import type { VercelResponse } from '@vercel/node'

/** 避免 handler 抛错后未写响应导致 Vercel FUNCTION_INVOCATION_FAILED */
export function sendOpsJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  try {
    if (res.writableEnded) return
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.status(status).send(JSON.stringify(body))
  } catch {
    try {
      if (!res.writableEnded) res.end()
    } catch {
      /* noop */
    }
  }
}
