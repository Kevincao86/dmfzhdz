/**
 * 巨量本地推绑定校验（轻量实现，供 Vercel 单文件 API 与 merchant 网关共用）
 */
const OE_BASE = (process.env.OCEANENGINE_API_BASE ?? 'https://api.oceanengine.com').replace(/\/$/, '')

export type LocalPromotionBindTestResult = {
  statusCode: number
  body: { ok: boolean; demoMode?: boolean; message: string }
}

type LocalPromotionCredentials = {
  accessToken: string
  localAccountId: string
}

type OeEnvelope<T> = {
  code?: number
  message?: string
  data?: T
}

function mapOceanError(raw: string, status?: number): string {
  const s = raw.trim()
  const lower = s.toLowerCase()
  if (status === 404 || /not_found|page could not be found/.test(lower)) {
    return '巨量开放平台接口不可用，请检查授权或稍后重试。'
  }
  if (status && status >= 500) return '巨量开放平台暂时繁忙，请稍后再试。'
  if (!/[\u4e00-\u9fff]/.test(s)) {
    return '连接巨量本地推失败，请确认 Access Token 与广告主 ID 正确，并在开放平台开通线索/投放权限。'
  }
  return s
}

function parseBody(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

function credsFromBody(j: Record<string, unknown>): LocalPromotionCredentials | null {
  const accessToken =
    (typeof j.access_token === 'string' ? j.access_token : '') ||
    (typeof j.accessToken === 'string' ? j.accessToken : '') ||
    process.env.OCEANENGINE_ACCESS_TOKEN?.trim() ||
    ''
  const localAccountId =
    (typeof j.local_account_id === 'string' ? j.local_account_id : '') ||
    (typeof j.localAccountId === 'string' ? j.localAccountId : '') ||
    process.env.OCEANENGINE_LOCAL_ACCOUNT_ID?.trim() ||
    ''
  if (!accessToken || !localAccountId) return null
  return { accessToken, localAccountId }
}

async function oceanGet<T>(
  creds: LocalPromotionCredentials,
  path: string,
  query: Record<string, string>,
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    const qs = new URLSearchParams(query).toString()
    const url = `${OE_BASE}${path}${qs ? `?${qs}` : ''}`
    const r = await fetch(url, {
      headers: { 'Access-Token': creds.accessToken, Accept: 'application/json' },
    })
    const text = await r.text()
    let parsed: OeEnvelope<T> = {}
    try {
      parsed = JSON.parse(text) as OeEnvelope<T>
    } catch {
      return { ok: false, message: mapOceanError(text, r.status) }
    }
    if (!r.ok) {
      return { ok: false, message: mapOceanError(parsed.message ?? text, r.status) }
    }
    if (parsed.code !== 0 && parsed.code !== undefined) {
      return { ok: false, message: mapOceanError(parsed.message ?? '请求被拒绝', r.status) }
    }
    return { ok: true, data: (parsed.data ?? {}) as T }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: mapOceanError(msg) }
  }
}

export async function runLocalPromotionBindTest(bodyRaw: string): Promise<LocalPromotionBindTestResult> {
  const creds = credsFromBody(parseBody(bodyRaw))
  if (!creds) {
    return {
      statusCode: 400,
      body: { ok: false, message: '请填写 Access Token 与本地推广告主 ID' },
    }
  }

  const pr = await oceanGet<{ list?: unknown[]; project_list?: unknown[] }>(
    creds,
    '/open_api/v3.0/local/project/list/',
    {
      local_account_id: creds.localAccountId,
      page: '1',
      page_size: '1',
    },
  )

  if (!pr.ok) {
    return {
      statusCode: 200,
      body: {
        ok: true,
        demoMode: true,
        message: `无法连接巨量本地推（${pr.message}），当前为演示模式；请检查 Token 与广告主 ID 后重新绑定。`,
      },
    }
  }

  return {
    statusCode: 200,
    body: { ok: true, demoMode: false, message: '本地推授权校验通过' },
  }
}
