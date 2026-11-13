/** 12 位时间后缀（÷10ms），分享文案「招募单号：MP-RO-…」不易在微信换行 */
export function mpOrderTimeSuffix(nowMs = Date.now()): number {
  return Math.floor(Number(nowMs) / 10)
}

export function buildMpRecruitmentOrderId(kind: 'RO' | 'ICE' | 'USER' = 'RO', nowMs = Date.now()): string {
  return `MP-${kind}-${mpOrderTimeSuffix(nowMs)}`
}

/** 从 MP-RO-178099398735 等单号后缀反推创建时间（÷10ms） */
export function resolveCreatedMsFromMpId(id: unknown): number {
  const s = String(id || '').trim()
  const m = s.match(/^MP-(?:RO|ICE|USER)-(\d{10,13})$/i)
  if (!m) return 0
  const suffix = Number(m[1])
  if (!Number.isFinite(suffix) || suffix <= 0) return 0
  const ms = suffix >= 1e12 ? suffix : suffix * 10
  return Number.isFinite(ms) && ms > 0 ? ms : 0
}
