/**
 * 美团 / 小红书 商家版绑定与同步（与后端约定路径）。
 * Base 同 `VITE_MERCHANT_API_BASE_URL`，未配置则为同源。
 */

const apiBase = () => (import.meta.env.VITE_MERCHANT_API_BASE_URL as string | undefined) ?? ''

function url(path: string) {
  const b = apiBase().replace(/\/$/, '')
  return `${b}${path}`
}

export type GenericBindPayload = {
  appId: string
  appSecret: string
  /** 美团可传商户/开发者扩展字段；小红书可传 sellerId 等，由后端解析 */
  extraId?: string
  /** 商家自研：门店授权后的 appAuthToken（正式联调常用） */
  appAuthToken?: string
}

export type GenericBindResult =
  | { ok: true; accessToken: string; message?: string; demo?: boolean }
  | { ok: false; message: string }

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

export async function postMeituanBind(
  payload: GenericBindPayload,
): Promise<GenericBindResult> {
  const res = await fetch(url('/api/merchant/meituan/bind'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await parseJson(res)
  if (!res.ok) {
    return {
      ok: false,
      message:
        (typeof data.message === 'string' && data.message) ||
        (typeof data.error === 'string' && data.error) ||
        `HTTP ${res.status}`,
    }
  }
  const token = data.accessToken ?? data.token
  if (typeof token !== 'string' || !token) {
    return {
      ok: false,
      message:
        '绑定接口未返回 accessToken（或 token），请后端返回 JSON：{ "accessToken": "..." }',
    }
  }
  return {
    ok: true,
    accessToken: token,
    message: typeof data.message === 'string' ? data.message : undefined,
    demo: data.demo === true,
  }
}

export async function postXhsBind(
  payload: GenericBindPayload,
): Promise<GenericBindResult> {
  const res = await fetch(url('/api/merchant/xhs/bind'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await parseJson(res)
  if (!res.ok) {
    return {
      ok: false,
      message:
        (typeof data.message === 'string' && data.message) ||
        (typeof data.error === 'string' && data.error) ||
        `HTTP ${res.status}`,
    }
  }
  const token = data.accessToken ?? data.token
  if (typeof token !== 'string' || !token) {
    return {
      ok: false,
      message:
        '绑定接口未返回 accessToken（或 token），请后端返回 JSON：{ "accessToken": "..." }',
    }
  }
  return { ok: true, accessToken: token }
}

export type SyncResult =
  | { ok: true; syncedAt?: string }
  | { ok: false; message: string }

/** 手动 / 定时触发的全量同步（由后端向美团或小红书拉数） */
export type WaimaiBindPlatformId = 'eleme' | 'meituan_waimai' | 'jd_waimai'

export async function postWaimaiBind(
  platform: WaimaiBindPlatformId,
  payload: GenericBindPayload,
): Promise<GenericBindResult> {
  const res = await fetch(url(`/api/merchant/${platform}/bind`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await parseJson(res)
  if (!res.ok) {
    return {
      ok: false,
      message:
        (typeof data.message === 'string' && data.message) ||
        (typeof data.error === 'string' && data.error) ||
        `HTTP ${res.status}`,
    }
  }
  const token = data.accessToken ?? data.token
  if (typeof token !== 'string' || !token) {
    return { ok: false, message: '绑定接口未返回 accessToken' }
  }
  return {
    ok: true,
    accessToken: token,
    message: typeof data.message === 'string' ? data.message : undefined,
    demo: data.demo === true,
  }
}

export async function postWaimaiSync(
  platform: WaimaiBindPlatformId,
  accessToken: string,
): Promise<SyncResult> {
  const res = await fetch(url(`/api/merchant/${platform}/sync`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })
  const data = await parseJson(res)
  if (!res.ok) {
    return {
      ok: false,
      message: (typeof data.message === 'string' && data.message) || `HTTP ${res.status}`,
    }
  }
  return {
    ok: true,
    syncedAt:
      (typeof data.syncedAt === 'string' && data.syncedAt) ||
      new Date().toLocaleString('zh-CN'),
  }
}

export async function postMerchantPlatformSync(
  platform: 'meituan' | 'xhs',
  accessToken: string,
): Promise<SyncResult> {
  const res = await fetch(url(`/api/merchant/${platform}/sync`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })
  const data = await parseJson(res)
  if (!res.ok) {
    return {
      ok: false,
      message:
        (typeof data.message === 'string' && data.message) ||
        (typeof data.error === 'string' && data.error) ||
        `HTTP ${res.status}`,
    }
  }
  const syncedAt =
    typeof data.syncedAt === 'string'
      ? data.syncedAt
      : typeof data.lastSyncAt === 'string'
        ? data.lastSyncAt
        : undefined
  return { ok: true, syncedAt }
}
