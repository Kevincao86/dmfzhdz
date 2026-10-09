/**
 * 在线客服 HTTP：独立客服台用共享 Token；运营台用已登录的员工会话。
 * 构建占位符 build-placeholder 不能通过。
 */
import { bearerTokenFromAuthHeader, verifyOpsSessionToken } from './opsStaffAccountsBackend.js'

const PLACEHOLDER_TOKENS = new Set(['build-placeholder', 'placeholder', 'changeme'])

export function supportOpsHttpAuthorized(
  authorizationHeader: string | string[] | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = Array.isArray(authorizationHeader) ? authorizationHeader[0] : authorizationHeader
  const auth = bearerTokenFromAuthHeader(raw)
  if (!auth || PLACEHOLDER_TOKENS.has(auth)) return false

  const expected = (env.MEOO_SUPPORT_OPS_HTTP_TOKEN ?? '').trim()
  if (expected && !PLACEHOLDER_TOKENS.has(expected) && auth === expected) return true

  const session = verifyOpsSessionToken(auth, env)
  if (!session) return false
  if (session.role === 'super_admin') return true
  const perms = session.permissions ?? []
  return perms.includes('support') || perms.includes('support_mp')
}
