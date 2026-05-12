/**
 * 抖音开放平台 HTTP 基址（仅服务端 / Vite 网关；勿暴露给浏览器 bundle）。
 *
 * - **DOUYIN_OPENAPI_BASE_URL**：本地生活等路径（如 `/goodlife/*`）基址；不设则 `https://open.douyin.com`。
 * - **DOUYIN_OPENAPI_OAUTH_BASE_URL**：OAuth（`/oauth/*`，含 `client_token`）基址。
 *   **不设且已配置 `DOUYIN_OPENAPI_BASE_URL`（非官方）**：先走同一中继；若中继对 `client_token` 仍返回 HTML（常见 Nginx 未透传 POST JSON），**自动再请求官方** `https://open.douyin.com/oauth/client_token/`。
 *   **不设且未配置中继**：默认 `https://open.douyin.com`。
 *   可显式设 `DOUYIN_OPENAPI_OAUTH_BASE_URL=https://open.douyin.com` 跳过中继上的 OAuth（与自动回落等价，仅少一次无效请求）。
 *
 * **goodlife（`/goodlife/*`）**：优先走 `DOUYIN_OPENAPI_BASE_URL` 中继；若中继返回 HTML、5xx 或非 JSON，**再请求一次官方**（便于拿到抖音 JSON 错误如 IP 白名单，或在官方可达时直接成功）。中继 Nginx 须对 **GET 保留完整 query**。
 *
 * Vercel：Environment Variables 中配置上述变量（勿以 / 结尾）。
 */
const DEFAULT_BASE = 'https://open.douyin.com'

function normalizedGoodlifeBase(): string {
  const raw = process.env.DOUYIN_OPENAPI_BASE_URL?.trim()
  if (!raw) return DEFAULT_BASE
  return raw.replace(/\/+$/, '')
}

/** OAuth 基址：显式 OAUTH_URL >（已配 goodlife 中继则与其同源）> 官方 */
function normalizedOauthBase(): string {
  const oauthRaw = process.env.DOUYIN_OPENAPI_OAUTH_BASE_URL?.trim()
  if (oauthRaw) return oauthRaw.replace(/\/+$/, '')
  const goodlife = normalizedGoodlifeBase()
  if (goodlife !== DEFAULT_BASE) return goodlife
  return DEFAULT_BASE
}

/** 当前 goodlife 等业务 API 使用的基址（与 `douyinOpenApiUrl('/goodlife/...')` 一致） */
export function douyinOpenApiBaseUrl(): string {
  return normalizedGoodlifeBase()
}

/** OAuth 使用的基址（与 `douyinOpenApiUrl('/oauth/...')` 一致） */
export function douyinOpenApiOauthBaseUrl(): string {
  return normalizedOauthBase()
}

/** @param path 以 / 开头的开放平台路径，如 `/oauth/client_token/`、`/goodlife/v1/...` */
export function douyinOpenApiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  const base = p.startsWith('/oauth/') ? normalizedOauthBase() : normalizedGoodlifeBase()
  return `${base}${p}`
}

function numericErrorCode(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  return undefined
}

function getDataErrorForClientToken(j: Record<string, unknown>): { ok: boolean; msg?: string } {
  const rootCode = numericErrorCode(j.error_code)
  if (rootCode !== undefined && rootCode !== 0) {
    return { ok: false, msg: String(j.description ?? j.msg ?? `抖音根 error_code=${rootCode}`) }
  }
  const mes = typeof j.message === 'string' ? j.message.trim().toLowerCase() : ''
  if (mes === 'error' || mes === 'fail' || mes === 'failed') {
    const data = j.data
    const d =
      data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : undefined
    return {
      ok: false,
      msg: String(d?.description ?? j.description ?? j.msg ?? '抖音接口返回失败'),
    }
  }
  const data = j.data
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    const code = numericErrorCode(d.error_code)
    if (code !== undefined && code !== 0) {
      return { ok: false, msg: String(d.description ?? `抖音 error_code=${code}`) }
    }
  }
  const extra = j.extra
  if (extra && typeof extra === 'object') {
    const e = extra as Record<string, unknown>
    const code = numericErrorCode(e.error_code)
    if (code !== undefined && code !== 0) {
      return { ok: false, msg: String(e.description ?? `抖音 extra error_code=${code}`) }
    }
  }
  return { ok: true }
}

function responseLooksLikeHtml(raw: string): boolean {
  const t = raw.replace(/^\uFEFF/, '').trim().toLowerCase()
  return t.startsWith('<!') || t.startsWith('<html') || t.includes('<!doctype')
}

function looksLikeJsonObject(raw: string): boolean {
  const t = raw.replace(/^\uFEFF/, '').trim()
  return t.startsWith('{') || t.startsWith('[')
}

export type DouyinFetchFn = (input: string | URL, init?: RequestInit) => Promise<Response>

/** 将经 DOUYIN_OPENAPI_BASE_URL 拼出的 goodlife 完整 URL 换为官方同源路径（保留 path+query） */
export function officialGoodlifeUrlFromRelayRequest(relayFullUrl: string): string | null {
  const relay = normalizedGoodlifeBase()
  if (relay === DEFAULT_BASE) return null
  if (!relayFullUrl.startsWith(relay)) return null
  return DEFAULT_BASE + relayFullUrl.slice(relay.length)
}

/**
 * goodlife GET/POST：先走 `DOUYIN_OPENAPI_BASE_URL` 中继；若响应为 5xx、HTML 或 2xx 但非 JSON，
 * 再请求同源路径的 `https://open.douyin.com`（保留 query），便于在 Nginx 未透传 GET 时仍能拿到抖音 JSON
 *（含「IP 不在白名单」等业务错误）。中继正常时不会触发第二次请求。
 */
export async function fetchGoodlifeWithOfficialFallback(
  fetchFn: DouyinFetchFn,
  relayUrl: string,
  init: RequestInit,
): Promise<{ status: number; raw: string; usedOfficialFallback: boolean }> {
  const r1 = await fetchFn(relayUrl, init)
  const raw1 = await r1.text()
  const relay = normalizedGoodlifeBase()
  if (relay === DEFAULT_BASE) {
    return { status: r1.status, raw: raw1, usedOfficialFallback: false }
  }
  const tryFallback =
    r1.status >= 500 ||
    responseLooksLikeHtml(raw1) ||
    (r1.ok && !looksLikeJsonObject(raw1))
  if (!tryFallback) {
    return { status: r1.status, raw: raw1, usedOfficialFallback: false }
  }
  const official = officialGoodlifeUrlFromRelayRequest(relayUrl)
  if (!official) {
    return { status: r1.status, raw: raw1, usedOfficialFallback: false }
  }
  const r2 = await fetchFn(official, init)
  const raw2 = await r2.text()
  const officialLooksJson = looksLikeJsonObject(raw2) && !responseLooksLikeHtml(raw2)
  if (officialLooksJson) {
    return { status: r2.status, raw: raw2, usedOfficialFallback: true }
  }
  return { status: r1.status, raw: raw1, usedOfficialFallback: false }
}

/** JSON POST 再 form POST；任一步得到 2xx 且像 JSON 即返回，否则返回最后一条响应（含非 2xx）。 */
async function fetchClientTokenJsonThenForm(
  fetchFn: DouyinFetchFn,
  tokenUrl: string,
  jsonBody: string,
  formBody: string,
): Promise<{ status: number; raw: string }> {
  const tryJson = await fetchFn(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: jsonBody,
  })
  let raw = await tryJson.text()
  if (!tryJson.ok) {
    return { status: tryJson.status, raw }
  }
  if (!responseLooksLikeHtml(raw) && looksLikeJsonObject(raw)) {
    return { status: tryJson.status, raw }
  }
  const tryForm = await fetchFn(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: formBody,
  })
  raw = await tryForm.text()
  return { status: tryForm.status, raw }
}

/**
 * 申请 client_token：中继上先 JSON 再 form；仍 HTML 或非 JSON 时，若当前 OAuth 基址非官方则自动改打官方
 * `https://open.douyin.com/oauth/client_token/`（goodlife 仍只走 DOUYIN_OPENAPI_BASE_URL，白名单不变）。
 */
export async function exchangeDouyinClientToken(
  clientKey: string,
  clientSecret: string,
  fetchFn: DouyinFetchFn,
): Promise<{ token: string; expiresIn: number }> {
  const primaryUrl = douyinOpenApiUrl('/oauth/client_token/')
  const jsonBody = JSON.stringify({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: 'client_credential',
  })
  const formBody = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: 'client_credential',
  }).toString()

  const parseSuccess = (raw: string, via: string): { token: string; expiresIn: number } => {
    const trimmed = (raw ?? '').replace(/^\uFEFF/, '').trim()
    let j: Record<string, unknown>
    try {
      const v = JSON.parse(trimmed || '{}') as unknown
      if (!v || typeof v !== 'object' || Array.isArray(v)) {
        throw new Error(`期望 JSON 对象，实际：${trimmed.slice(0, 240)}`)
      }
      j = v as Record<string, unknown>
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('期望 JSON')) throw e
      throw new Error(
        `client_token（${via}）返回非 JSON。自建反代请确认 proxy_pass、client_body_buffer_size、未将 POST 落到站点首页。也可显式设置 DOUYIN_OPENAPI_OAUTH_BASE_URL=https://open.douyin.com 仅 OAuth 直连。摘要：${trimmed.slice(0, 240)}`,
      )
    }
    const err = getDataErrorForClientToken(j)
    if (!err.ok) throw new Error(err.msg ?? `client_token 业务错误`)
    const extracted = extractClientTokenPayload(j)
    if (!extracted) {
      const rootK = Object.keys(j).join(',')
      const d = j.data
      const dk =
        d && typeof d === 'object' && !Array.isArray(d) ? Object.keys(d as object).join(',') : typeof d
      throw new Error(`client_token 响应缺少 access_token（根: ${rootK}；data: ${dk}）`)
    }
    return { token: extracted.token, expiresIn: extracted.expiresIn }
  }

  let { status, raw } = await fetchClientTokenJsonThenForm(fetchFn, primaryUrl, jsonBody, formBody)
  const oauthBase = normalizedOauthBase()
  const relayLooksBroken =
    oauthBase !== DEFAULT_BASE &&
    status >= 200 &&
    status < 300 &&
    (responseLooksLikeHtml(raw) || !looksLikeJsonObject(raw))
  if (relayLooksBroken) {
    const officialUrl = `${DEFAULT_BASE}/oauth/client_token/`
    const second = await fetchClientTokenJsonThenForm(fetchFn, officialUrl, jsonBody, formBody)
    if (second.status >= 200 && second.status < 300) {
      status = second.status
      raw = second.raw
    }
  }

  if (status < 200 || status >= 300) {
    throw new Error(`client_token HTTP ${status}：${raw.slice(0, 300)}`)
  }

  if (responseLooksLikeHtml(raw)) {
    throw new Error(
      `client_token 仍返回 HTML（抖音开放平台网页）。请修正 Nginx：对 /oauth/client_token/ 透传 POST body 与 JSON Content-Type，且 proxy_pass 须落到 open.douyin.com 的 API 路径；或设置 DOUYIN_OPENAPI_OAUTH_BASE_URL=https://open.douyin.com。摘要：${raw.slice(0, 240)}`,
    )
  }

  const via =
    relayLooksBroken && oauthBase !== DEFAULT_BASE ? '官方 OAuth 回落（中继曾返回 HTML）' : 'JSON 或 form 重试'
  return parseSuccess(raw, via)
}

/** 解析抖音 JSON 响应（去 BOM）；失败时返回 {}，与其它接口容错一致 */
export function parseDouyinJson(raw: string): Record<string, unknown> {
  const s = (raw ?? '').replace(/^\uFEFF/, '').trim()
  if (!s) return {}
  try {
    const v = JSON.parse(s) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** 反代不当时常返回抖音开放平台 HTML；若当 JSON 解析会得到「假空」门店列表 */
export function assertDouyinOpenApiJsonBody(raw: string, apiLabel: string): void {
  const t = (raw ?? '').replace(/^\uFEFF/, '').trim()
  if (!t) {
    throw new Error(
      `${apiLabel} 响应体为空。请检查 DOUYIN_OPENAPI_BASE_URL 反代是否截断 GET、或上游未返回 body。`,
    )
  }
  const head = t.slice(0, 800).toLowerCase()
  if (
    head.startsWith('<!') ||
    head.startsWith('<html') ||
    head.includes('<!doctype') ||
    head.includes('抖音开放平台') ||
    (head.includes('<title>') && head.includes('</title>'))
  ) {
    throw new Error(
      `${apiLabel} 返回 HTML 而非 JSON：经自建反代访问 goodlife 失败（常见：proxy_pass 未保留查询串、location 只配了 POST、把 GET 落到站点首页）。请修正 Nginx 的 /douyin/ 规则，或暂时移除 DOUYIN_OPENAPI_BASE_URL 验证。摘要：${t.slice(0, 280)}`,
    )
  }
}

export function parseDouyinOpenApiEnvelope(raw: string, apiLabel: string): Record<string, unknown> {
  assertDouyinOpenApiJsonBody(raw, apiLabel)
  try {
    const v = JSON.parse((raw ?? '').replace(/^\uFEFF/, '').trim()) as unknown
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      throw new Error(`${apiLabel} 根 JSON 须为对象`)
    }
    return v as Record<string, unknown>
  } catch (e) {
    if (e instanceof Error && (e.message.startsWith(apiLabel) || e.message.includes('根 JSON'))) throw e
    const snippet = (raw ?? '').replace(/^\uFEFF/, '').trim().slice(0, 280)
    throw new Error(`${apiLabel} JSON 解析失败：${snippet}`)
  }
}

function pickPoiArrayFromRecord(d: Record<string, unknown>, depth = 0): unknown[] {
  if (depth > 5) return []
  const direct = d.pois
  if (Array.isArray(direct)) return direct
  const alt =
    d.list ??
    d.poi_list ??
    d.shop_list ??
    d.shops ??
    d.records ??
    d.poi_info_list ??
    d.poi_infos ??
    d.shop_poi_list ??
    d.poi_data_list
  if (Array.isArray(alt)) return alt
  const res = d.result
  if (res && typeof res === 'object' && !Array.isArray(res)) {
    const nested = pickPoiArrayFromRecord(res as Record<string, unknown>, depth + 1)
    if (nested.length > 0) return nested
  }
  return []
}

/** 从 shop.query 的 data 节点提取门店列表（兼容嵌套 data、多字段名） */
export function extractPoisFromShopQueryData(data: Record<string, unknown> | undefined): unknown[] {
  if (!data || typeof data !== 'object') return []
  const first = pickPoiArrayFromRecord(data)
  if (first.length > 0) return first
  const inner = data.data
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    const second = pickPoiArrayFromRecord(inner as Record<string, unknown>)
    if (second.length > 0) return second
  }
  return []
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  return v as Record<string, unknown>
}

/**
 * 从 client_token 接口 JSON 中取凭证（兼容 data 嵌套、data 为 JSON 字符串、client_access_token 等别名）。
 * 文档示例：data.access_token；部分网关/版本字段可能略有差异。
 */
export function extractClientTokenPayload(j: Record<string, unknown>): { token: string; expiresIn: number } | null {
  const tryRec = (rec: Record<string, unknown> | undefined): { token: string; expiresIn: number } | null => {
    if (!rec) return null
    for (const k of ['access_token', 'client_access_token', 'token'] as const) {
      const t = rec[k]
      if (typeof t === 'string' && t.trim()) {
        const ei = Number(rec.expires_in ?? 7200)
        return { token: t.trim(), expiresIn: Number.isFinite(ei) && ei > 0 ? ei : 7200 }
      }
    }
    return null
  }

  let hit = tryRec(asRecord(j))
  if (hit) return hit

  const d0 = asRecord(j.data)
  if (d0) {
    hit = tryRec(d0)
    if (hit) return hit
    hit = tryRec(asRecord(d0.data))
    if (hit) return hit
  }

  if (typeof j.data === 'string' && j.data.trim()) {
    try {
      const p = JSON.parse(j.data) as unknown
      const pr = asRecord(p)
      hit = tryRec(pr)
      if (hit) return hit
      if (pr) {
        hit = tryRec(asRecord(pr.data))
        if (hit) return hit
      }
    } catch {
      return null
    }
  }

  hit = tryRec(asRecord(j.result))
  if (hit) return hit

  return null
}
