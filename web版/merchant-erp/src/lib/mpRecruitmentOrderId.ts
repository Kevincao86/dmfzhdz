/** 12 位时间后缀（÷10ms），分享文案「招募单号：MP-RO-…」不易在微信换行 */
export function mpOrderTimeSuffix(nowMs = Date.now()): number {
  return Math.floor(Number(nowMs) / 10)
}

export function buildMpRecruitmentOrderId(kind: 'RO' | 'ICE' | 'USER' = 'RO', nowMs = Date.now()): string {
  return `MP-${kind}-${mpOrderTimeSuffix(nowMs)}`
}
