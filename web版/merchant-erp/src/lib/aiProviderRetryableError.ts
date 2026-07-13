/**
 * 上游 AI 欠费 / 配额 / 模型不可用 → 允许 providerChain 自动切换下一厂商。
 */
export function isRetryableAiProviderError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase()
  return /429|quota|rate.?limit|余额|不足|insufficient|exhausted|limit exceeded|too many|resource|额度|欠费|overdue|accountoverdue|account.?overdue|overdue.?balance|payment required|billing|over.?limit|capacity|does not exist|not have access|model.*not.*found|invalid.*model|endpoint.*not|unknown model|model.*unavailable|access.*denied/.test(
    msg,
  )
}
