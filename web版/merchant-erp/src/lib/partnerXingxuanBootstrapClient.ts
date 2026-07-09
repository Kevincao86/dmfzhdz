import { merchantApiFetchUrls } from './merchantErpApiBase'
import { resolveMerchantApiBearer } from './merchantApiAuth'

const MP_TOKEN_KEY = 'lingqi_mp_session_token'
const MP_ACCOUNT_KEY = 'lingqi_mp_account'
const MP_ROLE_KEY = 'lingqi_mp_active_role'
const MP_WORK_IDENTITY_KEY = 'lingqi_mp_work_identity_v1'

export type PartnerXingxuanBootstrapPayload = {
  mpSessionToken: string
  account: Record<string, unknown>
  lingqiPrId?: string | null
  created?: boolean
}

let bootstrapPromise: Promise<PartnerXingxuanBootstrapPayload | null> | null = null

function writeMpSessionLocal(token: string, account: Record<string, unknown>) {
  try {
    localStorage.setItem(MP_TOKEN_KEY, token)
    localStorage.setItem(MP_ACCOUNT_KEY, JSON.stringify({ ...account, activeRole: 'pr' }))
    localStorage.setItem(MP_ROLE_KEY, 'pr')
    localStorage.setItem(MP_WORK_IDENTITY_KEY, 'pr')
  } catch {
    /* ignore */
  }
}

export function readPartnerXingxuanMpToken(): string | null {
  try {
    return localStorage.getItem(MP_TOKEN_KEY)?.trim() || null
  } catch {
    return null
  }
}

/** 服务商 fws：确保星选 PR 账号与会话（同源存储，供内嵌 iframe 与 API 扣费） */
export async function ensurePartnerXingxuanBootstrap(force = false): Promise<PartnerXingxuanBootstrapPayload | null> {
  if (!force && readPartnerXingxuanMpToken()) {
    return { mpSessionToken: readPartnerXingxuanMpToken()!, account: {} }
  }
  if (!force && bootstrapPromise) return bootstrapPromise

  bootstrapPromise = (async () => {
    const { token, source } = await resolveMerchantApiBearer()
    if (!token || source !== 'supabase') return null

    for (const url of merchantApiFetchUrls('/api/meoo-partner-xingxuan-bootstrap')) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        })
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
        if (!res.ok || data.ok === false) continue
        const mpSessionToken = String(data.mpSessionToken || '').trim()
        const account = (data.account && typeof data.account === 'object' ? data.account : {}) as Record<
          string,
          unknown
        >
        if (!mpSessionToken) continue
        writeMpSessionLocal(mpSessionToken, account)
        return {
          mpSessionToken,
          account,
          lingqiPrId: typeof data.lingqiPrId === 'string' ? data.lingqiPrId : null,
          created: data.created === true,
        }
      } catch {
        continue
      }
    }
    return null
  })()

  try {
    return await bootstrapPromise
  } finally {
    bootstrapPromise = null
  }
}
