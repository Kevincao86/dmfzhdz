import { Agent, fetch as undiciFetch } from 'undici'

/**
 * 抖音开放平台 HTTP 基址（仅服务端 / Vite 网关；勿暴露给浏览器 bundle）。
 *
 * - **DOUYIN_OPENAPI_BASE_URL**：本地生活等路径（如 `/goodlife/*`）基址；不设则 `https://open.douyin.com`。
 * - **DOUYIN_OPENAPI_OAUTH_BASE_URL**：OAuth（`/oauth/*`，含 `client_token`）基址。
 *   **不设且已配置 `DOUYIN_OPENAPI_BASE_URL`（非官方）**：OAuth 与中继同源；中继返回 HTML/非 JSON 时**不再自动改打官方**（避免 OAuth 出口 IP 与白名单不一致）。请修正反代或显式设置 `DOUYIN_OPENAPI_OAUTH_BASE_URL`（仍不推荐生产指向官方）。
 *   **不设且未配置中继**：默认 `https://open.douyin.com`。
 *   可显式设 `DOUYIN_OPENAPI_OAUTH_BASE_URL=https://open.douyin.com` 跳过中继上的 OAuth（与自动回落等价，仅少一次无效请求）。
 *
 * **goodlife（`/goodlife/*`）**：配置了非官方的 `DOUYIN_OPENAPI_BASE_URL` 时**仅走中继**，不再回落 `open.douyin.com`（避免出口 IP 变为 Vercel 导致开放平台白名单失效）。中继须正确透传 GET query、POST body 与 JSON 响应。
 * 若确需恢复旧「中继失败则打官方」排障行为，可设置 `DOUYIN_OPENAPI_GOODLIFE_OFFICIAL_FALLBACK=1`（不推荐生产）。
 *
 * - **DOUYIN_OPENAPI_RELAY_TLS_INSECURE**：设为 `1` / `true` 时，对「指向自建中继的 HTTPS 请求」**不校验中继 TLS 证书**（典型：反代使用自签或 IP 证书；Vercel 上否则会 `fetch failed`）。**直连 `https://open.douyin.com` 仍严格校验**。生产推荐为中继配置域名 + 受信任证书，勿长期依赖本开关。
 *
 * Vercel：Environment Variables 中配置上述变量（勿以 / 结尾）。
 */
const DEFAULT_BASE = 'https://open.douyin.com'

function normalizedGoodlifeBase(): string {
  const raw = process.env.DOUYIN_OPENAPI_BASE_URL?.trim()
  if (!raw) return DEFAULT_BASE
  return raw.replace(/\/+$/, '')
}

/** 生产默认关闭：自建 goodlife 中继失败时不再回落官方，避免出口 IP 漂移出白名单。 */
function goodlifeOfficialFallbackAllowed(): boolean {
  const v = process.env.DOUYIN_OPENAPI_GOODLIFE_OFFICIAL_FALLBACK?.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
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

let relayTlsInsecureAgent: Agent | undefined

function getRelayTlsInsecureAgent(): Agent {
  if (!relayTlsInsecureAgent) {
    relayTlsInsecureAgent = new Agent({
      connect: { rejectUnauthorized: false },
    })
  }
  return relayTlsInsecureAgent
}

export function relayTlsInsecureEnvEnabled(): boolean {
  const v = process.env.DOUYIN_OPENAPI_RELAY_TLS_INSECURE?.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

function requestUrlString(input: string | URL): string {
  return typeof input === 'string' ? input : input.href
}

/**
 * 服务端统一出口：默认 `fetch`；若开启 `DOUYIN_OPENAPI_RELAY_TLS_INSECURE` 且 URL 落在自建中继（非 open.douyin.com），
 * 使用 undici 不校验中继证书，避免自签/IP 证书在 Vercel 上表现为 `fetch failed`。
 */
export async function douyinServerFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const urlStr = requestUrlString(input)
  if (!relayTlsInsecureEnvEnabled()) {
    return fetch(input, init)
  }
  if (urlStr.startsWith(DEFAULT_BASE)) {
    return fetch(input, init)
  }
  const relay = normalizedGoodlifeBase()
  const oauth = normalizedOauthBase()
  if (relay === DEFAULT_BASE) {
    return fetch(input, init)
  }
  const hitRelay = urlStr.startsWith(relay)
  const hitCustomOauth = oauth !== DEFAULT_BASE && urlStr.startsWith(oauth)
  if (!hitRelay && !hitCustomOauth) {
    return fetch(input, init)
  }
  return undiciFetch(input, {
    ...(init ?? {}),
    dispatcher: getRelayTlsInsecureAgent(),
  } as never) as unknown as Promise<Response>
}

/** 将经 DOUYIN_OPENAPI_BASE_URL 拼出的 goodlife 完整 URL 换为官方同源路径（保留 path+query） */
export function officialGoodlifeUrlFromRelayRequest(relayFullUrl: string): string | null {
  const relay = normalizedGoodlifeBase()
  if (relay === DEFAULT_BASE) return null
  if (!relayFullUrl.startsWith(relay)) return null
  return DEFAULT_BASE + relayFullUrl.slice(relay.length)
}

/**
 * goodlife GET/POST：先走 `DOUYIN_OPENAPI_BASE_URL` 中继；若**网络层失败**（反代不可达、TLS、超时等）或响应为 5xx、HTML、2xx 但非 JSON，
 * 再请求同源路径的 `https://open.douyin.com`（保留 query），便于反代宕机时仍能拉门店/发品。
 */
export async function fetchGoodlifeWithOfficialFallback(
  fetchFn: DouyinFetchFn,
  relayUrl: string,
  init: RequestInit,
): Promise<{ status: number; raw: string; usedOfficialFallback: boolean }> {
  const relayBase = normalizedGoodlifeBase()
  const officialUrl = (): string | null => officialGoodlifeUrlFromRelayRequest(relayUrl)

  let r1: Response
  let raw1: string
  try {
    r1 = await fetchFn(relayUrl, init)
    raw1 = await r1.text()
  } catch (e1) {
    const msg1 = e1 instanceof Error ? e1.message : String(e1)
    const official = officialUrl()
    if (relayBase !== DEFAULT_BASE && official && goodlifeOfficialFallbackAllowed()) {
      try {
        const r2 = await fetchFn(official, init)
        const raw2 = await r2.text()
        return { status: r2.status, raw: raw2, usedOfficialFallback: true }
      } catch (e2) {
        const msg2 = e2 instanceof Error ? e2.message : String(e2)
        throw new Error(
          `goodlife 经 DOUYIN_OPENAPI_BASE_URL 失败（${msg1}）；直连 open.douyin.com 仍失败（${msg2}）。请检查反代可从部署环境访问，或暂时移除 DOUYIN_OPENAPI_BASE_URL 仅用官方域名。`,
        )
      }
    }
    throw e1 instanceof Error ? e1 : new Error(msg1)
  }

  if (relayBase === DEFAULT_BASE) {
    return { status: r1.status, raw: raw1, usedOfficialFallback: false }
  }
  if (!goodlifeOfficialFallbackAllowed()) {
    return { status: r1.status, raw: raw1, usedOfficialFallback: false }
  }
  const tryFallback =
    r1.status >= 500 ||
    responseLooksLikeHtml(raw1) ||
    (r1.ok && !looksLikeJsonObject(raw1))
  if (!tryFallback) {
    return { status: r1.status, raw: raw1, usedOfficialFallback: false }
  }
  const official = officialUrl()
  if (!official) {
    return { status: r1.status, raw: raw1, usedOfficialFallback: false }
  }
  try {
    const r2 = await fetchFn(official, init)
    const raw2 = await r2.text()
    const officialLooksJson = looksLikeJsonObject(raw2) && !responseLooksLikeHtml(raw2)
    if (officialLooksJson) {
      return { status: r2.status, raw: raw2, usedOfficialFallback: true }
    }
  } catch {
    /* 直连也失败时仍返回中继体，便于排障 */
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
  if (relayLooksBroken && goodlifeOfficialFallbackAllowed()) {
    const officialOauthUrl = `${DEFAULT_BASE}/oauth/client_token/`
    const second = await fetchClientTokenJsonThenForm(fetchFn, officialOauthUrl, jsonBody, formBody)
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
    relayLooksBroken && oauthBase !== DEFAULT_BASE && goodlifeOfficialFallbackAllowed()
      ? '官方 OAuth 回落（中继曾返回 HTML）'
      : 'JSON 或 form 重试'
  return parseSuccess(raw, via)
}

/** 抖音 OpenAPI 常见 Int64 字段名（poi_id / rate_id 等超过 JS 安全整数时会丢精度） */
const DOUYIN_INT64_JSON_FIELDS = [
  'poi_id',
  'rate_id',
  'product_id',
  'sku_id',
  'spu_id',
  'account_id',
  'merchant_id',
  'reply_id',
  'create_time',
  'update_time',
  'rate_score',
  'digg_cnt',
  'rate_expore_cnt',
  'query_time',
] as const

/** 将 JSON 字符串字面量内的裸控制字符转为 \\n/\\r/\\t，兼容 audit_msg 等含真实换行的响应 */
export function escapeJsonControlCharsInStrings(raw: string): string {
  let out = ''
  let inString = false
  let escaped = false
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!
    if (escaped) {
      out += c
      escaped = false
      continue
    }
    if (c === '\\') {
      out += c
      escaped = true
      continue
    }
    if (c === '"') {
      inString = !inString
      out += c
      continue
    }
    if (inString) {
      if (c === '\n') {
        out += '\\n'
        continue
      }
      if (c === '\r') {
        out += '\\r'
        continue
      }
      if (c === '\t') {
        out += '\\t'
        continue
      }
    }
    out += c
  }
  return out
}

/** 解析前将 Int64 数字改为字符串，避免 JSON.parse 精度丢失导致门店筛选对不上 */
export function quoteDouyinInt64InJson(raw: string): string {
  let s = (raw ?? '').replace(/^\uFEFF/, '').trim()
  if (!s) return s
  for (const field of DOUYIN_INT64_JSON_FIELDS) {
    s = s.replace(new RegExp(`"${field}"\\s*:\\s*(\\d{15,})\\b`, 'g'), `"${field}":"$1"`)
  }
  /** 勿对全文做「任意 :16位数字」替换，会误伤 audit_msg 等字符串内的「: 数字,」片段 */
  return s
}

function tryParseDouyinOpenApiObject(raw: string): Record<string, unknown> | null {
  const trimmed = (raw ?? '').replace(/^\uFEFF/, '').trim()
  if (!trimmed) return null
  const candidates = [
    quoteDouyinInt64InJson(trimmed),
    escapeJsonControlCharsInStrings(trimmed),
    quoteDouyinInt64InJson(escapeJsonControlCharsInStrings(trimmed)),
    trimmed,
  ]
  for (const s of candidates) {
    try {
      const v = JSON.parse(s) as unknown
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
    } catch {
      /* try next */
    }
  }
  return null
}

/** 统一 Int64 字符串化（兼容 number / string / bigint） */
export function stringifyDouyinOpenApiInt64(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'bigint') return v.toString()
  if (typeof v === 'number' && Number.isFinite(v)) return String(Math.trunc(v))
  return String(v).trim()
}

/** 比较 poi_id（容忍历史缓存里因 JSON 精度导致的末位差异） */
export function douyinPoiIdsMatch(a: unknown, b: unknown): boolean {
  const sa = stringifyDouyinOpenApiInt64(a)
  const sb = stringifyDouyinOpenApiInt64(b)
  if (!sa || !sb) return false
  if (sa === sb) return true
  if (sa.length >= 16 && sb.length >= 16 && sa.slice(0, 15) === sb.slice(0, 15)) return true
  return false
}

/** 解析抖音 JSON 响应（去 BOM）；失败时返回 {}，与其它接口容错一致 */
export function parseDouyinJson(raw: string): Record<string, unknown> {
  return tryParseDouyinOpenApiObject(raw ?? '') ?? {}
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
  const parsed = tryParseDouyinOpenApiObject(raw ?? '')
  if (parsed) return parsed
  const bytes = (raw ?? '').replace(/^\uFEFF/, '').trim().length
  throw new Error(
    `${apiLabel} JSON 解析失败（响应约 ${bytes} 字节；常见原因：audit_msg 含未转义换行，或 Int64 精度预处理误伤 — 请重试或联系技术支持）`,
  )
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

/**
 * goodlife 等接口业务错误里常见的「client_token / access-token 失效」文案（与 HTTP 状态码区分）。
 * 命中时通常应清空会话缓存后重新 `client_token` 再重试一次请求。
 */
export function isLikelyDouyinClientTokenExpiredBizError(msg: string): boolean {
  if (!msg || typeof msg !== 'string') return false
  return /access[_ ]?token过期|access_token过期|token过期|请刷新或重新授权|请重新授权|access[_-]?token无效|凭证已过期|client_token过期/i.test(
    msg,
  )
}

/** 清空会话中的 client_token 缓存，迫使下次 ensure 重新 exchange。 */
export function invalidateDouyinMerchantClientTokenCache(s: {
  douyinToken: string
  douyinExpiresAtMs: number
}): void {
  s.douyinToken = ''
  s.douyinExpiresAtMs = 0
}
