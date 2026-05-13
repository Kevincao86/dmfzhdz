/**
 * OpenAI SDK 的 usage / 部分字段可能含 getter、Proxy 或不可 JSON 序列化结构；
 * 直接 JSON.stringify 写入 HTTP 或日志会在 Vercel 上抛错，表现为通用 500。
 */
export function sanitizeTokenUsage(u: unknown): Record<string, number> | undefined {
  if (!u || typeof u !== 'object') return undefined
  const o = u as Record<string, unknown>
  const out: Record<string, number> = {}
  for (const key of ['prompt_tokens', 'completion_tokens', 'total_tokens'] as const) {
    const n = Number(o[key])
    if (Number.isFinite(n) && n >= 0) out[key] = n
  }
  return Object.keys(out).length ? out : undefined
}
