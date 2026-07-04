/**
 * 达人平台主页链接：每月 5 日（上海时区）批量解析并回写 mpTalentMembers + talentLibraryEntries
 */
import type { RegistryFile, RegistryMpTalentMember, RegistryMpTalentPlatformProfile } from './opsRegistryTypes.js'
import { upsertMpTalentMember } from './mpTalentMemberUpsert.js'
import { runProfileLinkParseCore, type ProfileLinkParseOk } from './profileLinkParseCore.js'

/** 每月 5 日（上海时区）执行；与带货等级 6 日错开 */
export const TALENT_PROFILE_LINK_REFRESH_DAY = 5

const SHANGHAI_TZ = 'Asia/Shanghai'
const SKIP_PLATFORM_IDS = new Set(['weixin_video'])

const PLATFORM_SYNC = [
  { id: 'douyin', name: '抖音' },
  { id: 'xiaohongshu', name: '小红书' },
  { id: 'kuaishou', name: '快手' },
  { id: 'dianping', name: '大众点评' },
] as const

export type TalentProfileLinkRefreshOpts = {
  /** 忽略「每月 5 日 / 本月已跑完」门禁（运维手动触发） */
  force?: boolean
  /** 只统计不写库 */
  dryRun?: boolean
  /** 单次最多解析几条链接（防 cron 超时，默认 60） */
  maxParses?: number
  /** 每条链接解析间隔 ms（默认 1200） */
  delayMs?: number
}

export type TalentProfileLinkRefreshResult = {
  ok: true
  skipped: boolean
  skipReason?: string
  refreshYm: string
  membersTotal: number
  cursorStart: number
  cursorEnd: number
  completed: boolean
  linksAttempted: number
  linksParsed: number
  linksFailed: number
  membersUpdated: number
  librarySyncCalls: number
  errors: { memberId: string; platform: string; message: string }[]
}

function shanghaiYmd(now: Date): { ym: string; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const year = parts.find((p) => p.type === 'year')?.value || '1970'
  const month = parts.find((p) => p.type === 'month')?.value || '01'
  const day = Number.parseInt(parts.find((p) => p.type === 'day')?.value || '1', 10)
  return { ym: `${year}-${month}`, day: Number.isFinite(day) ? day : 1 }
}

export function currentTalentProfileLinkRefreshYm(now = new Date()): string {
  return shanghaiYmd(now).ym
}

export function shouldRunTalentProfileLinkMonthlyRefresh(now = new Date()): boolean {
  return shanghaiYmd(now).day >= TALENT_PROFILE_LINK_REFRESH_DAY
}

function nowIsoShanghai(): string {
  return new Date().toLocaleString('zh-CN', { hour12: false, timeZone: SHANGHAI_TZ })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type LinkJob = { platformId: string; platformName: string; link: string }

function collectLinkJobs(member: RegistryMpTalentMember): LinkJob[] {
  const jobs: LinkJob[] = []
  const pp = member.platformProfiles
  if (pp && typeof pp === 'object') {
    for (const { id, name } of PLATFORM_SYNC) {
      if (SKIP_PLATFORM_IDS.has(id)) continue
      const raw = pp[id]
      if (!raw || raw.enabled === false) continue
      const link = String(raw.profileLink || '').trim()
      if (!link) continue
      jobs.push({ platformId: id, platformName: name, link })
    }
    if (jobs.length) return jobs
  }
  const douyinLink = String(member.douyin?.profileLink || '').trim()
  if (douyinLink) jobs.push({ platformId: 'douyin', platformName: '抖音', link: douyinLink })
  const xhsLink = String(member.xiaohongshu?.profileLink || '').trim()
  if (xhsLink) jobs.push({ platformId: 'xiaohongshu', platformName: '小红书', link: xhsLink })
  return jobs
}

function mergeTags(existing: unknown, parsed: string[]): string[] | undefined {
  const prev = Array.isArray(existing)
    ? existing.map((t) => String(t || '').trim()).filter(Boolean)
    : []
  const merged = [...new Set([...prev, ...parsed.map((t) => String(t || '').trim()).filter(Boolean)])]
  return merged.length ? merged.slice(0, 8) : undefined
}

function applyParsedToProfile(
  prof: RegistryMpTalentPlatformProfile & { enabled?: boolean; talentGrade?: string },
  parsed: ProfileLinkParseOk,
  platformId: string,
): boolean {
  let changed = false
  if (parsed.platformAccount) {
    const next = String(parsed.platformAccount).trim()
    if (next && String(prof.platformAccount || '').trim() !== next) {
      prof.platformAccount = next
      changed = true
    }
  }
  if (parsed.platformNickname) {
    const next = String(parsed.platformNickname).trim()
    if (next && String(prof.platformNickname || '').trim() !== next) {
      prof.platformNickname = next
      changed = true
    }
  }
  if (parsed.profileLink) {
    const next = String(parsed.profileLink).trim()
    if (next && String(prof.profileLink || '').trim() !== next) {
      prof.profileLink = next
      changed = true
    }
  }
  if (parsed.followers > 0) {
    const prev = Math.max(0, Number(prof.followers) || 0)
    if (parsed.followers !== prev) {
      prof.followers = parsed.followers
      changed = true
    }
  }
  if (parsed.talentGrade && platformId === 'kuaishou') {
    const next = String(parsed.talentGrade).trim()
    if (next && String(prof.talentGrade || '').trim() !== next) {
      prof.talentGrade = next
      changed = true
    }
  }
  const tags = mergeTags(prof.accountTags, parsed.accountTags)
  if (tags) {
    const prevKey = JSON.stringify(prof.accountTags || [])
    const nextKey = JSON.stringify(tags)
    if (prevKey !== nextKey) {
      prof.accountTags = tags
      changed = true
    }
  }
  return changed
}

function applyParsedToMember(
  member: RegistryMpTalentMember,
  platformId: string,
  parsed: ProfileLinkParseOk,
): boolean {
  let changed = false
  if (!member.platformProfiles) member.platformProfiles = {}
  let prof = member.platformProfiles[platformId]
  if (!prof) {
    prof = { enabled: true }
    member.platformProfiles[platformId] = prof
    changed = true
  }
  if (applyParsedToProfile(prof, parsed, platformId)) changed = true

  if (platformId === 'douyin' && member.douyin) {
    if (applyParsedToProfile(member.douyin, parsed, platformId)) changed = true
  }
  if (platformId === 'xiaohongshu' && member.xiaohongshu) {
    if (applyParsedToProfile(member.xiaohongshu, parsed, platformId)) changed = true
  }
  if (parsed.gender && !String(member.gender || '').trim()) {
    member.gender = parsed.gender
    changed = true
  }
  if (changed) member.updatedAt = nowIsoShanghai()
  return changed
}

export async function refreshTalentProfileLinksInSnapshot(
  data: RegistryFile,
  opts: TalentProfileLinkRefreshOpts = {},
): Promise<{ changed: boolean; result: TalentProfileLinkRefreshResult }> {
  const now = new Date()
  const refreshYm = currentTalentProfileLinkRefreshYm(now)
  const force = opts.force === true
  const dryRun = opts.dryRun === true
  const maxParses = Math.max(1, Math.min(500, Math.floor(Number(opts.maxParses) || 60)))
  const delayMs = Math.max(200, Math.min(5000, Math.floor(Number(opts.delayMs) || 1200)))

  const baseResult = (): TalentProfileLinkRefreshResult => ({
    ok: true,
    skipped: false,
    refreshYm,
    membersTotal: 0,
    cursorStart: 0,
    cursorEnd: 0,
    completed: false,
    linksAttempted: 0,
    linksParsed: 0,
    linksFailed: 0,
    membersUpdated: 0,
    librarySyncCalls: 0,
    errors: [],
  })

  if (!force && !shouldRunTalentProfileLinkMonthlyRefresh(now)) {
    return {
      changed: false,
      result: {
        ...baseResult(),
        skipped: true,
        skipReason: `未到每月 ${TALENT_PROFILE_LINK_REFRESH_DAY} 日（上海时区）`,
        completed: String(data.talentProfileLinkRefreshYm || '') === refreshYm,
      },
    }
  }

  if (!force && String(data.talentProfileLinkRefreshYm || '') === refreshYm) {
    return {
      changed: false,
      result: {
        ...baseResult(),
        skipped: true,
        skipReason: '本月已全部解析完成',
        completed: true,
      },
    }
  }

  const members = data.mpTalentMembers ?? []
  let cursor = Number(data.talentProfileLinkRefreshCursor ?? 0)
  if (!Number.isFinite(cursor) || cursor < 0) cursor = 0
  if (String(data.talentProfileLinkRefreshCursorYm || '') !== refreshYm) cursor = 0

  const result = baseResult()
  result.membersTotal = members.length
  result.cursorStart = cursor

  let parseBudget = maxParses
  let registryDirty = false
  let stoppedEarly = false

  memberLoop: for (let i = cursor; i < members.length; i += 1) {
    if (parseBudget <= 0) {
      stoppedEarly = true
      result.cursorEnd = i
      break
    }
    const member = members[i]
    if (!member) continue
    const jobs = collectLinkJobs(member)
    if (!jobs.length) {
      cursor = i + 1
      result.cursorEnd = cursor
      continue
    }

    let memberChanged = false
    for (const job of jobs) {
      if (parseBudget <= 0) {
        stoppedEarly = true
        result.cursorEnd = i
        break memberLoop
      }
      parseBudget -= 1
      result.linksAttempted += 1
      try {
        const parsed = await runProfileLinkParseCore({ link: job.link, platform: job.platformName })
        if (!parsed.ok) {
          result.linksFailed += 1
          if (result.errors.length < 40) {
            result.errors.push({
              memberId: String(member.id || ''),
              platform: job.platformName,
              message: parsed.message.slice(0, 160),
            })
          }
          await sleep(delayMs)
          continue
        }
        if (applyParsedToMember(member, job.platformId, parsed)) {
          memberChanged = true
        }
        result.linksParsed += 1
      } catch (e) {
        result.linksFailed += 1
        if (result.errors.length < 40) {
          result.errors.push({
            memberId: String(member.id || ''),
            platform: job.platformName,
            message: (e instanceof Error ? e.message : String(e)).slice(0, 160),
          })
        }
      }
      await sleep(delayMs)
    }

    if (memberChanged) {
      result.membersUpdated += 1
      if (!dryRun) {
        upsertMpTalentMember(data, member)
        result.librarySyncCalls += 1
        registryDirty = true
      }
    }

    cursor = i + 1
    result.cursorEnd = cursor
  }

  const completed = !stoppedEarly && cursor >= members.length
  result.completed = completed

  if (!dryRun) {
    data.talentProfileLinkRefreshCursorYm = refreshYm
    data.talentProfileLinkRefreshCursor = completed ? 0 : cursor
    if (completed) {
      data.talentProfileLinkRefreshYm = refreshYm
      data.talentProfileLinkRefreshCursor = 0
    }
    registryDirty = true
  }

  return { changed: registryDirty && !dryRun, result }
}

/** cron / API：加载 registry → 批量解析 → 条件 save */
export async function maybeRefreshTalentProfileLinksAndSave(
  io: { load(): Promise<RegistryFile>; save(data: RegistryFile): Promise<void> },
  opts?: TalentProfileLinkRefreshOpts,
): Promise<{ saved: boolean; result: TalentProfileLinkRefreshResult }> {
  const data = await io.load()
  const { changed, result } = await refreshTalentProfileLinksInSnapshot(data, opts)
  if (changed) {
    await io.save(data)
    return { saved: true, result }
  }
  return { saved: false, result }
}
