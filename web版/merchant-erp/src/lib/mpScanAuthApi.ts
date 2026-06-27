import { buildMerchantErpApiUrl, merchantErpApiBase } from './merchantErpApiBase'
import { toUserFacingError } from './userFacingError'

export type ErpOAuthPortal = 'merchant' | 'partner'

type ApiJson = Record<string, unknown>

async function postMpAuth(body: Record<string, unknown>): Promise<ApiJson> {
  const base = merchantErpApiBase()
  if (!base) throw new Error('未配置 ERP API 基址')
  const url = buildMerchantErpApiUrl(base, '/api/meoo-ops-mp-auth')
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data: ApiJson = {}
  try {
    data = JSON.parse(text) as ApiJson
  } catch {
    throw new Error(`接口返回非 JSON（HTTP ${res.status}）`)
  }
  if (!res.ok || data.ok === false) {
    const msg = String(data.message || data.error || `http_${res.status}`)
    throw new Error(toUserFacingError(msg, '扫码登录'))
  }
  return data
}

export async function erpDyOAuthBegin(portal: ErpOAuthPortal): Promise<{
  authorizeUrl: string
  ticket: string
  redirectUri: string
}> {
  const redirectUri =
    typeof window !== 'undefined' ? `${window.location.origin}/login/dy-oauth` : ''
  const data = await postMpAuth({
    action: 'dy_oauth_begin',
    workIdentity: portal,
    portal,
    redirectUri,
  })
  const authorizeUrl = String(data.authorizeUrl || '')
  const ticket = String(data.ticket || '')
  const outRedirect = String(data.redirectUri || redirectUri)
  if (!authorizeUrl) throw new Error('未获取到抖音授权链接')
  return { authorizeUrl, ticket, redirectUri: outRedirect }
}

export async function erpDyOAuthComplete(
  code: string,
  state: string,
): Promise<{
  access_token: string
  refresh_token: string
  loginName?: string
  portal?: string
}> {
  const data = await postMpAuth({
    action: 'dy_oauth_complete',
    code,
    state,
  })
  const access_token = String(data.access_token || '')
  const refresh_token = String(data.refresh_token || '')
  if (!access_token || !refresh_token) {
    throw new Error('抖音授权成功，但未获取到 ERP 登录会话')
  }
  return {
    access_token,
    refresh_token,
    loginName: typeof data.loginName === 'string' ? data.loginName : undefined,
    portal: typeof data.portal === 'string' ? data.portal : undefined,
  }
}
