import type { VercelRequest } from '@vercel/node'
import { sessionTokenFromHeaders } from '../../vite-plugins/aiTokenUsageCore.js'

export function mpSessionTokenFromRequest(
  req: VercelRequest,
  body?: Record<string, unknown>,
): string {
  const fromHeaders = sessionTokenFromHeaders(req.headers as Record<string, string | string[] | undefined>)
  const fromBody = String(body?.sessionToken || body?.token || '').trim()
  return fromHeaders || fromBody
}

export function mpPointsSpendHttpStatus(error: string | undefined): number {
  if (error === 'insufficient_points') return 402
  if (error === 'not_found') return 401
  return 422
}
