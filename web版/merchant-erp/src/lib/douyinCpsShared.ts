/** 抖音 CPS 定向计划 — 前后端共用的字段转换与校验 */

/** 商家佣金百分比（0–80）→ 抖音 commission_rate（文档示例 6.66% → 666） */
export function douyinCpsCommissionRateFromPct(pct: number): number {
  const n = Math.max(0, Math.min(80, Number(pct) || 0))
  return Math.round(n * 100)
}

/** 从报名资料提取抖音号（非昵称）；platformAccount 优先 */
export function extractDouyinTalentId(applicant: {
  platformAccount?: string
  platformNickname?: string
  name?: string
}): string {
  const raw = String(applicant.platformAccount || '').trim()
  if (raw && isLikelyDouyinTalentId(raw)) return raw
  return ''
}

/** 团购带货达人抖音号：字母数字与下划线，2–64 位，非纯中文昵称 */
export function isLikelyDouyinTalentId(raw: string): boolean {
  const s = String(raw || '').trim()
  if (s.length < 2 || s.length > 64) return false
  if (/[\u4e00-\u9fff]/.test(s)) return false
  if (/\s/.test(s)) return false
  return /^[A-Za-z0-9._-]+$/.test(s)
}

/** 招募计划名称 → 抖音 plan_name（≤20 字） */
export function douyinCpsPlanNameFromRecruitment(name: string, orderId: string): string {
  const base = String(name || '').trim() || `招募${orderId.slice(-6)}`
  return base.length <= 20 ? base : base.slice(0, 20)
}

/** 探店/招募时段 → Unix 秒（抖音 start_time / end_time） */
export function douyinCpsPlanTimeRangeSec(meta?: {
  visitStart?: string
  visitEnd?: string
  recruitStart?: string
  recruitEnd?: string
}): { startSec: number; endSec: number } {
  const nowSec = Math.floor(Date.now() / 1000)
  const parse = (v?: string): number | null => {
    const s = String(v || '').trim()
    if (!s) return null
    const t = Date.parse(s.includes('T') ? s : s.replace(' ', 'T'))
    if (!Number.isFinite(t)) return null
    return Math.floor(t / 1000)
  }
  let start =
    parse(meta?.visitStart) ??
    parse(meta?.recruitStart) ??
    nowSec + 3600
  let end =
    parse(meta?.visitEnd) ??
    parse(meta?.recruitEnd) ??
    start + 30 * 86400
  if (end <= start) end = start + 30 * 86400
  if (start < nowSec) start = nowSec + 3600
  return { startSec: start, endSec: end }
}

export type CpsTalentDetailRow = {
  douyinId: string
  gmv?: number
  usedGmv?: number
  talentCommission?: number
  liveCnt?: number
  shortVideoCnt?: number
}

/** 解析 oriented_plan_talent_detail 响应 */
export function parseOrientedPlanTalentDetailPayload(
  upstream: unknown,
): Record<string, Record<string, unknown>> {
  if (!upstream || typeof upstream !== 'object') return {}
  const root = upstream as Record<string, unknown>
  const data = root.data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Record<string, unknown>
    if (d.data && typeof d.data === 'object' && !Array.isArray(d.data)) {
      return d.data as Record<string, Record<string, unknown>>
    }
    const keys = Object.keys(d)
    if (keys.length && keys.every((k) => d[k] && typeof d[k] === 'object')) {
      return d as Record<string, Record<string, unknown>>
    }
  }
  return {}
}

export function cpsTalentDetailRowsFromMap(
  map: Record<string, Record<string, unknown>>,
): CpsTalentDetailRow[] {
  return Object.entries(map).map(([douyinId, v]) => ({
    douyinId,
    gmv: numOrUndef(v.gmv),
    usedGmv: numOrUndef(v.used_gmv),
    talentCommission: numOrUndef(v.talent_commission),
    liveCnt: numOrUndef(v.live_cnt),
    shortVideoCnt: numOrUndef(v.short_video_cnt),
  }))
}

function numOrUndef(v: unknown): number | undefined {
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
