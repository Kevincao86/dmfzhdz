import type { RegistryFile, RegistryMpTalentMember } from './opsRegistryTypes.js'

/** 团购达人带货力等级：每月 6 日评定（上海时区） */
export const DOUYIN_SALES_LEVEL_RESET_DAY = 6

const SHANGHAI_TZ = 'Asia/Shanghai'

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

export function currentDouyinSalesLevelResetYm(now = new Date()): string {
  return shanghaiYmd(now).ym
}

export function shouldRunDouyinSalesLevelMonthlyReset(now = new Date()): boolean {
  return shanghaiYmd(now).day >= DOUYIN_SALES_LEVEL_RESET_DAY
}

function nowIsoShanghai(): string {
  return new Date().toLocaleString('zh-CN', { hour12: false, timeZone: SHANGHAI_TZ })
}

function clearMemberDouyinSalesLevel(member: RegistryMpTalentMember, nowIso: string): boolean {
  let changed = false
  const prof = member.platformProfiles?.douyin
  if (prof && String(prof.douyinSalesLevel || '').trim()) {
    delete prof.douyinSalesLevel
    changed = true
  }
  const legacy = member.douyin
  if (legacy && String(legacy.douyinSalesLevel || '').trim()) {
    delete legacy.douyinSalesLevel
    changed = true
  }
  if (changed) member.updatedAt = nowIso
  return changed
}

/** 每月 6 日（上海）起：全库抹除抖音带货等级，仅执行一次/自然月 */
export function ensureDouyinSalesLevelMonthlyReset(
  data: RegistryFile,
  now = new Date(),
): { changed: boolean; resetYm: string } {
  const resetYm = currentDouyinSalesLevelResetYm(now)
  if (!shouldRunDouyinSalesLevelMonthlyReset(now)) {
    return { changed: false, resetYm: String(data.douyinSalesLevelResetYm || resetYm) }
  }
  if (String(data.douyinSalesLevelResetYm || '') === resetYm) {
    return { changed: false, resetYm }
  }

  const nowIso = nowIsoShanghai()

  for (const member of data.mpTalentMembers ?? []) {
    clearMemberDouyinSalesLevel(member, nowIso)
  }

  for (const entry of data.talentLibraryEntries ?? []) {
    if (entry.platform !== '抖音') continue
    if (!String(entry.douyinSalesLevel || '').trim()) continue
    delete entry.douyinSalesLevel
    entry.updatedAt = nowIso
  }

  data.douyinSalesLevelResetYm = resetYm
  return { changed: true, resetYm }
}

export function memberNeedsDouyinSalesLevelUpdate(
  member: RegistryMpTalentMember | null,
  resetYm: string,
  now = new Date(),
): boolean {
  if (!shouldRunDouyinSalesLevelMonthlyReset(now)) return false
  if (String(resetYm) !== currentDouyinSalesLevelResetYm(now)) return false
  if (!member) return false

  const prof = member.platformProfiles?.douyin
  const legacy = member.douyin
  const hasDouyinProfile = Boolean(
    (prof &&
      (String(prof.platformAccount || '').trim() ||
        String(prof.platformNickname || '').trim() ||
        prof.enabled)) ||
      (legacy &&
        (String(legacy.platformAccount || '').trim() || String(legacy.platformNickname || '').trim())),
  )
  if (!hasDouyinProfile) return false

  const level = String(prof?.douyinSalesLevel || legacy?.douyinSalesLevel || '').trim()
  return !level
}
