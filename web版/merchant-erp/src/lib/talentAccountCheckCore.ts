/**
 * PR 达人查验：公开主页解析 + 豆包分析。
 * 免费账号每月成功 1 次；会员不限次数，每次成功查验 5 积分（先套餐桶，再充值桶）。
 * 同一号 24 小时内读缓存，不重复扣。
 */
import fs from 'node:fs'
import path from 'node:path'
import type { MpAccountRow } from './mpAccountAuth.js'
import type { MpLibraryRole } from './mpMembershipCatalog.js'
import { currentGiftMonthKey } from './mpAiPointsBuckets.js'
import { talentEvalMonthlyLimit } from './mpMembershipQuota.js'
import { createRegistrySnapshotIoFetch } from './registrySnapshotIoFetch.js'
import { readAccountMpAiPointsBalance } from './mpAiPointsSpendCore.js'
import { spendMpAiPointsForSessionToken } from './mpAiPointsSpendSession.js'
import { runProfileLinkParseCore } from './profileLinkParseCore.js'

export const TALENT_CHECK_POINTS = 5
const CACHE_MS = 24 * 60 * 60 * 1000
const MAX_ROWS = 30

type CheckRow = { label: string; value: string; source: string }

export type TalentCheckView = {
  nickname: string
  account: string
  followersText: string
  signature: string
  avatarUrl: string
  direction: string
  recent: string[]
  summary: string
  checkedAt: string
  checkedAtLabel: string
  cached: boolean
  charged: number
  balance: number | null
  rows: CheckRow[]
}

type CacheFile = { at: number; view: TalentCheckView }

function safeKey(value: string) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'unknown'
}

function quotaFile(accountId: string) {
  return path.join(process.cwd(), 'data', 'talent-check-quota', `${safeKey(accountId)}.json`)
}

function cacheFile(accountId: string, douyinKey: string) {
  return path.join(process.cwd(), 'data', 'talent-check-cache', `${safeKey(accountId)}__${safeKey(douyinKey)}.json`)
}

function readFreeUsed(accountId: string) {
  const month = currentGiftMonthKey()
  try {
    const parsed = JSON.parse(fs.readFileSync(quotaFile(accountId), 'utf8')) as { month?: string; used?: number }
    if (parsed.month !== month) return 0
    return Math.max(0, Math.floor(Number(parsed.used) || 0))
  } catch {
    return 0
  }
}

function writeFreeUsed(accountId: string) {
  const file = quotaFile(accountId)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ month: currentGiftMonthKey(), used: 1 }))
}

function readCache(accountId: string, douyinKey: string): TalentCheckView | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(cacheFile(accountId, douyinKey), 'utf8')) as CacheFile
    if (!parsed || typeof parsed.at !== 'number' || !parsed.view) return null
    if (Date.now() - parsed.at > CACHE_MS) return null
    return { ...parsed.view, cached: true, charged: 0 }
  } catch {
    return null
  }
}

function writeCache(accountId: string, douyinKey: string, view: TalentCheckView) {
  const file = cacheFile(accountId, douyinKey)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ at: Date.now(), view }))
}

function deleteCache(accountId: string, douyinKey: string) {
  try {
    fs.unlinkSync(cacheFile(accountId, douyinKey))
  } catch {
    /* 没有缓存 */
  }
}

export function normDouyinKey(raw: string) {
  return String(raw || '')
    .trim()
    .replace(/^@/, '')
    .replace(/\s+/g, '')
    .toLowerCase()
    .slice(0, 120)
}

function followersText(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '未公开'
  if (n >= 10000) {
    const wan = n / 10000
    const text = wan >= 100 ? String(Math.round(wan)) : wan.toFixed(1).replace(/\.0$/, '')
    return `${text}万`
  }
  return n.toLocaleString('zh-CN')
}

function checkedClock(iso: string) {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
  return parts
}

export function readAnalysisJson(text: string): { summary: string; direction: string; recent: string[] } | null {
  const raw = String(text || '')
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const j = JSON.parse(raw.slice(start, end + 1)) as {
      summary?: unknown
      direction?: unknown
      recent?: unknown
    }
    const summary = String(j.summary || '').trim()
    if (summary.length < 20) return null
    const direction = String(j.direction || '').trim().slice(0, 16)
    const recent = Array.isArray(j.recent)
      ? j.recent.map((item) => String(item || '').trim()).filter((item) => item.length >= 2).slice(0, 3)
      : []
    return { summary: summary.slice(0, 180), direction, recent }
  } catch {
    return null
  }
}

function buildView(input: {
  nickname: string
  account: string
  followers: number
  signature: string
  avatarUrl: string
  direction: string
  recent: string[]
  summary: string
  checkedAt: string
  cached: boolean
  charged: number
  balance: number | null
}): TalentCheckView {
  const rows: CheckRow[] = [
    { label: '昵称', value: input.nickname || '未公开', source: '公开主页' },
    { label: '抖音号', value: input.account || '未公开', source: '公开主页' },
    { label: '粉丝', value: followersText(input.followers), source: '公开主页' },
    { label: '签名', value: input.signature || '未公开', source: '公开主页' },
  ]
  if (input.direction) rows.push({ label: '内容方向', value: input.direction, source: '豆包检索' })
  if (input.recent.length) rows.push({ label: '近期内容', value: input.recent.join('、'), source: '豆包检索' })
  rows.push({ label: '说明', value: input.summary, source: '豆包检索' })
  return {
    nickname: input.nickname,
    account: input.account,
    followersText: followersText(input.followers),
    signature: input.signature,
    avatarUrl: input.avatarUrl,
    direction: input.direction,
    recent: input.recent,
    summary: input.summary,
    checkedAt: input.checkedAt,
    checkedAtLabel: checkedClock(input.checkedAt),
    cached: input.cached,
    charged: input.charged,
    balance: input.balance,
    rows,
  }
}

export function parseCheckSheet(text: string): { rows: { douyinId: string; nickname: string }[]; truncated: boolean } {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const rows: { douyinId: string; nickname: string }[] = []
  for (const line of lines) {
    const cells = line.split(/[,，\t]/).map((cell) => cell.trim().replace(/^"|"$/g, ''))
    const id = cells[0] || ''
    if (!id || /抖音号|账号|douyin/i.test(id)) continue
    rows.push({ douyinId: id.slice(0, 200), nickname: (cells[1] || '').slice(0, 40) })
    if (rows.length >= MAX_ROWS) break
  }
  return { rows, truncated: lines.length > rows.length + 1 }
}

async function sheetRowsFromBody(body: Record<string, unknown>) {
  const csvText = String(body.csvText || '')
  if (csvText.trim()) return parseCheckSheet(csvText)
  const fileBase64 = String(body.fileBase64 || '').trim()
  if (!fileBase64) return { rows: [] as { douyinId: string; nickname: string }[], truncated: false }
  const buf = Buffer.from(fileBase64, 'base64')
  if (buf.length > 2_000_000) {
    throw new Error('表格过大，请控制在 2MB 以内')
  }
  const XLSX = await import('xlsx')
  const book = XLSX.read(buf, { type: 'buffer' })
  const name = book.SheetNames[0]
  const sheet = name ? book.Sheets[name] : null
  if (!sheet) return { rows: [] as { douyinId: string; nickname: string }[], truncated: false }
  const grid = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: false })
  const lines = grid
    .map((row) => (Array.isArray(row) ? row.map((cell) => String(cell || '').trim()).join(',') : ''))
    .filter(Boolean)
  return parseCheckSheet(lines.join('\n'))
}

async function askDoubao(nickname: string, account: string, followers: number, signature: string) {
  const { mergeMerchantAiEnvWithRegistrySnapshot } = await import('../../vite-plugins/merchantRegistryVendorEnv.js')
  const { callDoubaoWebSearch } = await import('../../vite-plugins/merchantAiUpstream.js')
  const env = await mergeMerchantAiEnvWithRegistrySnapshot(process.cwd(), process.env as Record<string, string>)
  const key = String(env.MERCHANT_AI_DOUBAO_KEY || env.ARK_API_KEY || '').trim()
  if (!key) throw new Error('豆包暂不可用，请稍后再试')
  const system = [
    '你是豆包助手。只根据这次联网检索到的公开主页回答。',
    '不要编造粉丝数、播放量、成交额、手机号或微信。',
    '粉丝数以用户消息里给出的公开资料为准，不要改写。',
    '只输出一个 JSON 对象，不要 Markdown。',
    '键：summary（40到90字，写这个账号公开内容在做什么）、direction（8个字以内的内容方向）、recent（最多3条公开作品标题，没有就空数组）。',
  ].join('')
  const user = [
    `抖音号：${account || '未公开'}`,
    `昵称：${nickname || '未公开'}`,
    `粉丝：${followers > 0 ? followersText(followers) : '未公开'}`,
    `签名：${signature || '未公开'}`,
    '请联网检索这一个抖音账号的公开主页和近期内容。',
  ].join('\n')
  const hit = await callDoubaoWebSearch(key, env, system, user)
  return readAnalysisJson(hit.text)
}

function upgradeBody() {
  return {
    ok: false,
    error: 'upgrade_membership',
    message: '本月免费查验已用完，下月恢复。升级会员后按积分查验，不限次数。',
  }
}

function findCached(accountId: string, keys: string[]) {
  for (const key of keys) {
    if (!key) continue
    const hit = readCache(accountId, key)
    if (hit) return hit
  }
  return null
}

export async function runTalentAccountCheck(opts: {
  supabaseUrl: string
  serviceRole: string
  token: string
  account: MpAccountRow
  body: Record<string, unknown>
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const roleRaw = String(opts.body.billingRole || opts.body.libraryRole || '').trim().toLowerCase()
  const roleHint: MpLibraryRole | undefined =
    roleRaw === 'pr' || roleRaw === 'talent' || roleRaw === 'shoot' || roleRaw === 'edit' ? roleRaw : undefined
  if (roleHint !== 'pr') {
    return { status: 200, body: { ok: false, error: 'pr_only', message: '达人查验只在 PR 身份下使用' } }
  }
  const accountId = String(opts.account.id || '').trim()
  if (!accountId) return { status: 200, body: { ok: false, error: 'not_found', message: '请先登录' } }

  const io = createRegistrySnapshotIoFetch(opts.supabaseUrl, opts.serviceRole)
  const data = await io.load()
  const plan = talentEvalMonthlyLimit(data, opts.account, { roleHint: 'pr' })
  const member = plan.paid
  const balance = readAccountMpAiPointsBalance(data, opts.account, { roleHint: 'pr' })
  const freeUsed = readFreeUsed(accountId)
  const freeRemaining = member ? 0 : Math.max(0, 1 - freeUsed)
  const mode = String(opts.body.mode || 'status').trim()
  const platform = String(opts.body.platform || 'douyin').trim().toLowerCase()
  if (mode !== 'status' && platform && platform !== 'douyin') {
    const names: Record<string, string> = { xhs: '小红书', kuaishou: '快手', dianping: '大众点评', channels: '视频号' }
    const name = names[platform] || '该平台'
    return { status: 200, body: { ok: false, error: 'platform_closed', message: `${name}尚未开放，目前只能查验抖音` } }
  }

  if (mode === 'status') {
    return {
      status: 200,
      body: {
        ok: true,
        member,
        freeRemaining,
        pointsPerCheck: TALENT_CHECK_POINTS,
        pointsBalance: balance,
        hint: member
          ? `会员不限次数。每次成功查验 ${TALENT_CHECK_POINTS} 积分，先扣套餐积分，再扣充值积分。`
          : freeRemaining > 0
            ? '免费版本月还可成功查验 1 次。'
            : '本月免费次数已用完，下月恢复。升级会员后按积分查验。',
      },
    }
  }

  if (mode === 'parse_sheet' || mode === 'quote') {
    if (!member) return { status: 200, body: upgradeBody() }
  }

  if (mode === 'parse_sheet') {
    try {
      const parsed = await sheetRowsFromBody(opts.body)
      if (!parsed.rows.length) {
        return { status: 200, body: { ok: false, error: 'empty_sheet', message: '表格里没有抖音号。第一列填抖音号，昵称可以空着。' } }
      }
      return { status: 200, body: { ok: true, rows: parsed.rows, truncated: parsed.truncated, limit: MAX_ROWS } }
    } catch (e) {
      const message = e instanceof Error ? e.message : '表格读取失败'
      return { status: 200, body: { ok: false, error: 'sheet_failed', message } }
    }
  }

  if (mode === 'quote') {
    const queries = Array.isArray(opts.body.queries) ? opts.body.queries.map((item) => String(item || '').trim()).filter(Boolean) : []
    const unique = Array.from(new Set(queries.map(normDouyinKey))).filter(Boolean).slice(0, MAX_ROWS)
    if (!unique.length) {
      return { status: 200, body: { ok: false, error: 'empty_sheet', message: '请先放入要查的抖音号' } }
    }
    let cached = 0
    for (const key of unique) {
      if (readCache(accountId, key)) cached += 1
    }
    const chargeCount = unique.length - cached
    const pointsRequired = chargeCount * TALENT_CHECK_POINTS
    return {
      status: 200,
      body: {
        ok: balance >= pointsRequired,
        error: balance >= pointsRequired ? '' : 'insufficient_points',
        message:
          balance >= pointsRequired
            ? ''
            : `积分不足（当前 ${balance.toLocaleString('zh-CN')}，需要 ${pointsRequired.toLocaleString('zh-CN')}），请充值积分或升级套餐后再试`,
        count: unique.length,
        cached,
        chargeCount,
        pointsRequired,
        pointsBalance: balance,
        pointsPerCheck: TALENT_CHECK_POINTS,
      },
    }
  }

  const query = String(opts.body.query || '').trim()
  if (!query) return { status: 200, body: { ok: false, error: 'missing_query', message: '请输入抖音号、分享口令或主页链接' } }
  const inputKey = normDouyinKey(query)
  const cachedFirst = findCached(accountId, [inputKey])
  if (cachedFirst) {
    return { status: 200, body: { ok: true, view: cachedFirst, member, freeRemaining, pointsBalance: balance, pointsPerCheck: TALENT_CHECK_POINTS } }
  }
  if (!member && freeRemaining <= 0) return { status: 200, body: upgradeBody() }
  if (member && balance < TALENT_CHECK_POINTS) {
    return {
      status: 200,
      body: {
        ok: false,
        error: 'insufficient_points',
        message: `积分不足（当前 ${balance.toLocaleString('zh-CN')}，需要 ${TALENT_CHECK_POINTS}），请充值积分或升级套餐后再试`,
        required: TALENT_CHECK_POINTS,
        balance,
      },
    }
  }

  const parsed = await runProfileLinkParseCore({ link: query, platform: '抖音' })
  if (!parsed.ok) {
    return { status: 200, body: { ok: false, error: 'parse_failed', message: parsed.message || '没有查到这个抖音号的公开主页' } }
  }
  const accountKey = normDouyinKey(parsed.platformAccount)
  const cachedParsed = findCached(accountId, [accountKey, inputKey])
  if (cachedParsed) {
    return { status: 200, body: { ok: true, view: cachedParsed, member, freeRemaining, pointsBalance: balance, pointsPerCheck: TALENT_CHECK_POINTS } }
  }

  let analysis: { summary: string; direction: string; recent: string[] } | null = null
  try {
    analysis = await askDoubao(parsed.platformNickname, parsed.platformAccount, parsed.followers, String(parsed.signature || ''))
  } catch (e) {
    const message = e instanceof Error ? e.message : '豆包分析失败'
    return { status: 200, body: { ok: false, error: 'analysis_failed', message } }
  }
  if (!analysis) {
    return { status: 200, body: { ok: false, error: 'analysis_incomplete', message: '豆包这次没有写完分析，未扣积分。请再查一次。' } }
  }

  const checkedAt = new Date().toISOString()
  const view = buildView({
    nickname: parsed.platformNickname,
    account: parsed.platformAccount,
    followers: parsed.followers,
    signature: String(parsed.signature || ''),
    avatarUrl: String(parsed.avatarUrl || ''),
    direction: analysis.direction,
    recent: analysis.recent,
    summary: analysis.summary,
    checkedAt,
    cached: false,
    charged: member ? TALENT_CHECK_POINTS : 0,
    balance: null,
  })
  const keys = Array.from(new Set([accountKey, inputKey].filter(Boolean)))
  for (const key of keys) writeCache(accountId, key, view)

  if (!member) {
    writeFreeUsed(accountId)
    return {
      status: 200,
      body: {
        ok: true,
        view: { ...view, charged: 0 },
        member: false,
        freeRemaining: 0,
        pointsBalance: balance,
        pointsPerCheck: TALENT_CHECK_POINTS,
      },
    }
  }

  const daySlot = Math.floor(Date.now() / 86400000)
  const spent = await spendMpAiPointsForSessionToken(opts.supabaseUrl, opts.serviceRole, opts.token, {
    kind: 'talent_check',
    idempotencyKey: `talent-check:${accountId}:${accountKey || inputKey}:${daySlot}`,
    note: `达人查验 ${parsed.platformNickname || parsed.platformAccount}`,
    roleHint: 'pr',
  })
  if (!spent.ok) {
    for (const key of keys) deleteCache(accountId, key)
    return {
      status: 200,
      body: {
        ok: false,
        error: spent.error || 'insufficient_points',
        message: spent.message || '积分不足，请充值积分或升级套餐后再试',
        required: TALENT_CHECK_POINTS,
        balance,
      },
    }
  }
  const charged = spent.already ? 0 : spent.pointsCharged
  const nextBalance = spent.newBalance
  const saved = { ...view, charged, balance: nextBalance }
  for (const key of keys) writeCache(accountId, key, saved)
  return {
    status: 200,
    body: {
      ok: true,
      view: saved,
      member: true,
      freeRemaining: 0,
      pointsBalance: nextBalance,
      pointsPerCheck: TALENT_CHECK_POINTS,
    },
  }
}
