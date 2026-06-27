/** 解析抖音 OAuth 回调 URL（登录 vs 开放平台白名单绑定） */
export type DyOAuthCallbackMode =
  | { kind: 'error'; message: string }
  | { kind: 'whitelist_bind'; code: string; hasUserInfo: boolean }
  | { kind: 'login'; code: string; state: string }

export function resolveDyOAuthCallbackMode(searchParams: URLSearchParams): DyOAuthCallbackMode {
  const oauthErr = String(
    searchParams.get('error_description') || searchParams.get('error') || '',
  ).trim()
  if (oauthErr) return { kind: 'error', message: oauthErr }

  const code = String(searchParams.get('code') || '').trim()
  const state = String(searchParams.get('state') || '').trim()
  const scopesRaw = String(searchParams.get('scopes') || searchParams.get('scope') || '').trim()
  const isWhitelistBind = /trial\.whitelist/i.test(scopesRaw)

  if (isWhitelistBind && code) {
    return {
      kind: 'whitelist_bind',
      code,
      hasUserInfo: /user_info/i.test(scopesRaw),
    }
  }

  if (!code || !state) {
    return { kind: 'error', message: '缺少抖音授权参数，请返回登录页重试' }
  }

  return { kind: 'login', code, state }
}
