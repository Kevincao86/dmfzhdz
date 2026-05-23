/**
 * POST /api/kuaishou-bind — 快手团购绑定（单文件入口）
 *
 * 完整实现写在本文件内，避免 Vercel Serverless 分包遗漏 `./merchant/douyin/bindRuntime`。
 * `meoo-kuaishou-bind` / `merchant/douyin/bind` 仅 re-export 本文件 default。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import {
  kuaishouOpenApiUrl,
  kuaishouServerFetch,
  exchangeKuaishouClientToken,
  extractPoisFromShopQueryData,
  fetchGoodlifeWithOfficialFallback,
  invalidateKuaishouMerchantClientTokenCache,
  isLikelyKuaishouClientTokenExpiredBizError,
  parseKuaishouOpenApiEnvelope,
  relayTlsInsecureEnvEnabled,
} from './kuaishouOpenApiBase.js'

export type KuaishouMerchantSession = {
  clientKey: string
  clientSecret: string
  merchantId: string
  douyinToken: string
  douyinExpiresAtMs: number
}

export const kuaishouMerchantDevSessions = new Map<string, KuaishouMerchantSession>()

const PREFIX = 'moo1.'
const ALGO = 'aes-256-gcm'

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, 'meoo-douyin-session', 32)
}

export type KuaishouSessionCredentialsPayload = {
  clientKey: string
  clientSecret: string
  merchantId: string
}

export function sealKuaishouSessionCredentials(
  payload: KuaishouSessionCredentialsPayload,
  secret: string,
): string {
  const key = deriveKey(secret)
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const plain = Buffer.from(JSON.stringify(payload), 'utf8')
  const enc = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  const blob = Buffer.concat([iv, tag, enc]).toString('base64url')
  return `${PREFIX}${blob}`
}

export function openKuaishouSessionCredentials(token: string): KuaishouSessionCredentialsPayload | null {
  if (!token.startsWith(PREFIX)) return null
  const secret = process.env.MERCHANT_KUAISHOU_SESSION_SECRET?.trim()
  if (!secret) return null
  try {
    const key = deriveKey(secret)
    const buf = Buffer.from(token.slice(PREFIX.length), 'base64url')
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const enc = buf.subarray(28)
    const decipher = createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(tag)
    const plain = Buffer.concat([decipher.update(enc), decipher.final()])
    const j = JSON.parse(plain.toString('utf8')) as KuaishouSessionCredentialsPayload
    if (
      typeof j.clientKey !== 'string' ||
      typeof j.clientSecret !== 'string' ||
      typeof j.merchantId !== 'string'
    ) {
      return null
    }
    return j
  } catch {
    return null
  }
}

export function merchantKuaishouSessionSecret(): string {
  return process.env.MERCHANT_KUAISHOU_SESSION_SECRET?.trim() ?? ''
}

const KUAISHOU_FETCH_TIMEOUT_MS = 25_000

function fetchTimeoutSignal(ms: number): AbortSignal {
  const AS = AbortSignal as typeof AbortSignal & { timeout?: (n: number) => AbortSignal }
  if (typeof AS.timeout === 'function') return AS.timeout(ms)
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  ;(t as { unref?: () => void }).unref?.()
  return c.signal
}

function douyinFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  return kuaishouServerFetch(input, {
    ...init,
    signal: fetchTimeoutSignal(KUAISHOU_FETCH_TIMEOUT_MS),
  })
}

function isLikelyWhitelistIpReject(detail: string): boolean {
  return /IP[^\s]*不在白名单|whitelist|白名单/i.test(detail)
}

function whitelistDeployHint(detail: string): string {
  const relay = process.env.KUAISHOU_OPENAPI_BASE_URL?.trim()
  const oauth = process.env.KUAISHOU_OPENAPI_OAUTH_BASE_URL?.trim()
  const oauthIsOfficialOnly =
    !!oauth &&
    /^https:\/\/open\.douyin\.com\/?$/i.test(oauth.replace(/\/+$/, ''))
  if (oauthIsOfficialOnly && relay) {
    return ' 已配置 KUAISHOU_OPENAPI_BASE_URL 固定出口，但 KUAISHOU_OPENAPI_OAUTH_BASE_URL 指向官方域名，OAuth 仍走云平台出口触发白名单校验。请删除该变量或与中继根保持一致。'
  }
  if (!relay) {
    return ' 开放平台白名单对应「请求快手时的来源 IP」：Vercel/Serverless 出口与控制台报备 EIP 不一致。请在部署环境设置 KUAISHOU_OPENAPI_BASE_URL 为 EIP 上反代 https://open.kwailocallife.com 的根路径（与同机「服务器 IP 白名单」一致）；配置后 OAuth 与同出口同源，无需单独设 OAUTH_URL。'
  }
  if (relay && isLikelyWhitelistIpReject(detail)) {
    return ' 已配置 EIP 中继仍出现 IP 白名单时：请确认 goodlife 与 OAuth 均走 KUAISHOU_OPENAPI_BASE_URL（默认不再回落 open.kwailocallife.com）；修正 Nginx：`location /douyin/` 使用 `proxy_pass https://open.kwailocallife.com/;`，且 GET 保留查询串、POST 透传 JSON body。排障可临时设 KUAISHOU_OPENAPI_GOODLIFE_OFFICIAL_FALLBACK=1（勿长期用于生产）。'
  }
  return ''
}

function numericErrorCode(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  return undefined
}

function getDataError(j: Record<string, unknown>): { ok: boolean; msg?: string } {
  const rootCode = numericErrorCode(j.error_code)
  if (rootCode !== undefined && rootCode !== 0) {
    return { ok: false, msg: String(j.description ?? j.msg ?? `快手根 error_code=${rootCode}`) }
  }
  const mes = typeof j.message === 'string' ? j.message.trim().toLowerCase() : ''
  if (mes === 'error' || mes === 'fail' || mes === 'failed') {
    const data = j.data
    const d =
      data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : undefined
    return {
      ok: false,
      msg: String(d?.description ?? j.description ?? j.msg ?? '快手接口返回失败'),
    }
  }
  const data = j.data
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    const code = numericErrorCode(d.error_code)
    if (code !== undefined && code !== 0) {
      return { ok: false, msg: String(d.description ?? `快手 error_code=${code}`) }
    }
  }
  const extra = j.extra
  if (extra && typeof extra === 'object') {
    const e = extra as Record<string, unknown>
    const code = numericErrorCode(e.error_code)
    if (code !== undefined && code !== 0) {
      return { ok: false, msg: String(e.description ?? `快手 extra error_code=${code}`) }
    }
  }
  return { ok: true }
}

async function fetchKuaishouClientToken(
  clientKey: string,
  clientSecret: string,
): Promise<{ token: string; expiresIn: number }> {
  return exchangeKuaishouClientToken(clientKey, clientSecret, douyinFetch)
}

async function ensureKuaishouToken(s: KuaishouMerchantSession): Promise<string> {
  const skew = 120_000
  if (s.douyinToken && Date.now() < s.douyinExpiresAtMs - skew) {
    return s.douyinToken
  }
  const { token, expiresIn } = await fetchKuaishouClientToken(s.clientKey, s.clientSecret)
  s.douyinToken = token
  s.douyinExpiresAtMs = Date.now() + Math.max(300, expiresIn) * 1000
  return token
}

async function shopPoiQueryPage(
  accountId: string,
  accessToken: string,
  page: number,
  size: number,
): Promise<Record<string, unknown>> {
  const u = new URL(kuaishouOpenApiUrl('/goodlife/v1/shop/poi/query/'))
  u.searchParams.set('account_id', accountId)
  u.searchParams.set('page', String(Math.max(1, page)))
  u.searchParams.set('size', String(Math.min(50, Math.max(1, size))))

  const { status, raw } = await fetchGoodlifeWithOfficialFallback(douyinFetch, u.toString(), {
    method: 'GET',
    headers: {
      'access-token': accessToken,
      'content-type': 'application/json',
      'Rpc-Transit-Life-Account': accountId,
    },
  })
  if (status < 200 || status >= 300) {
    throw new Error(`shop/query HTTP ${status}：${raw.slice(0, 400)}`)
  }
  const j = parseKuaishouOpenApiEnvelope(raw, 'shop/query')
  const err = getDataError(j)
  if (!err.ok) throw new Error(err.msg ?? 'shop/query 业务错误')
  return j
}

function isShopQueryRateLimitedMessage(msg: string): boolean {
  return /太过频繁|请稍后再试|rate limit|429|限流|频率过高|too many requests/i.test(msg)
}

/** 绑定页单次 shop/query：与 goodlife 网关一致做退避，缓解快手「请求太过频繁」 */
async function shopPoiQueryPageWithRetry(
  accountId: string,
  accessToken: string,
  page: number,
  size: number,
): Promise<Record<string, unknown>> {
  let lastErr: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) {
      const backoff = 700 * attempt * attempt
      await new Promise<void>((r) => setTimeout(r, backoff))
    }
    try {
      return await shopPoiQueryPage(accountId, accessToken, page, size)
    } catch (e) {
      lastErr = e
      const msg = e instanceof Error ? e.message : String(e)
      if (attempt < 4 && isShopQueryRateLimitedMessage(msg)) continue
      throw e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? 'shop/query 无响应'))
}

function accountNameFromPois(pois: unknown[]): string | undefined {
  for (const row of pois) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const acc =
      o.account && typeof o.account === 'object'
        ? (o.account as Record<string, unknown>)
        : null
    const root =
      acc?.root_account && typeof acc.root_account === 'object'
        ? (acc.root_account as Record<string, unknown>)
        : null
    const n = root?.account_name
    if (typeof n === 'string' && n.trim()) return n.trim()
    const r2 =
      o.root_account && typeof o.root_account === 'object'
        ? (o.root_account as Record<string, unknown>)
        : null
    const n2 = r2?.account_name
    if (typeof n2 === 'string' && n2.trim()) return n2.trim()
  }
  return undefined
}

export async function runKuaishouMerchantBind(
  bodyRaw: string,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  let body: { appId?: string; appSecret?: string; merchantId?: string }
  try {
    body = JSON.parse(bodyRaw || '{}') as typeof body
  } catch {
    return { statusCode: 400, body: { message: '请求体须为 JSON' } }
  }
  const clientKey = String(body.appId ?? '').trim()
  const clientSecret = String(body.appSecret ?? '').trim()
  const merchantId = String(body.merchantId ?? '').trim()
  if (!clientKey || !clientSecret || !merchantId) {
    return {
      statusCode: 400,
      body: { message: '请提供 appId（client_key）、appSecret（client_secret）、merchantId（account_id）' },
    }
  }

  try {
    const session: KuaishouMerchantSession = {
      clientKey,
      clientSecret,
      merchantId,
      douyinToken: '',
      douyinExpiresAtMs: 0,
    }
    const token = await ensureKuaishouToken(session)
    let first: Record<string, unknown>
    try {
      first = await shopPoiQueryPageWithRetry(merchantId, token, 1, 1)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (isLikelyKuaishouClientTokenExpiredBizError(msg)) {
        invalidateKuaishouMerchantClientTokenCache(session)
        const token2 = await ensureKuaishouToken(session)
        first = await shopPoiQueryPageWithRetry(merchantId, token2, 1, 1)
      } else {
        throw e
      }
    }
    const d = first.data as Record<string, unknown> | undefined
    const pois = extractPoisFromShopQueryData(d)
    const accountName = accountNameFromPois(pois)

    const secret = merchantKuaishouSessionSecret()
    let accessToken: string
    if (secret) {
      accessToken = sealKuaishouSessionCredentials({ clientKey, clientSecret, merchantId }, secret)
    } else {
      const sid = randomBytes(32).toString('hex')
      kuaishouMerchantDevSessions.set(sid, session)
      accessToken = sid
    }

    return {
      statusCode: 200,
      body: {
        accessToken,
        accountName: accountName ?? undefined,
        message: secret
          ? '已绑定快手团购（线上加密会话，请在部署环境配置 MERCHANT_KUAISHOU_SESSION_SECRET）。'
          : '已建立直连快手生活服务开放平台的本地会话（仅开发服务器内存）。',
      },
    }
  } catch (e) {
    const aborted =
      e instanceof Error && (e.name === 'AbortError' || /aborted|timeout/i.test(e.message))
    const detail = aborted
      ? `连接快手生活服务开放平台超时（${Math.round(KUAISHOU_FETCH_TIMEOUT_MS / 1000)}s）。请稍后重试；若持续失败，可在 Vercel → Functions → 区域改为东京(hnd1)/首尔(icn1)等离大陆更近的节点后再试。`
      : e instanceof Error
        ? e.message
        : String(e)
    const whitelistHint =
      detail && !aborted && isLikelyWhitelistIpReject(detail) ? whitelistDeployHint(detail) : ''
    const rateLimitHint =
      !aborted && isShopQueryRateLimitedMessage(detail)
        ? ' 此为快手生活服务开放平台对接口 QPS/频控的限制（与白名单是否为 60.204.* 无直接关系）。请间隔 1～3 分钟再点「确认绑定」、避免连续重试；若需固定出口 IP，仍须在 Vercel 配置 KUAISHOU_OPENAPI_BASE_URL 指向华为云 EIP 上的反代，使请求经白名单 IP 访问快手。'
        : ''
    const relayHtmlHint =
      detail &&
      !aborted &&
      /返回 HTML|HTML 而非 JSON/i.test(detail) &&
      process.env.KUAISHOU_OPENAPI_BASE_URL?.trim()
        ? ' 根因多为 Nginx 未把 GET /douyin/goodlife/... 转到 open.kwailocallife.com（须 proxy_pass https://open.kwailocallife.com/; 且勿只配 POST）。部署本版本后若中继仍返回 HTML，会再试官方一次；官方若报 IP 白名单，请先修好中继使 goodlife 从 EIP 出站。'
        : ''
    const relayTlsHint =
      !aborted &&
      process.env.KUAISHOU_OPENAPI_BASE_URL?.trim() &&
      /fetch failed|certificate|certificates|ssl|tls|UNABLE_TO_VERIFY|self[- ]signed/i.test(detail) &&
      !relayTlsInsecureEnvEnabled()
        ? ' 若中继 HTTPS 为自签或 IP 证书，Vercel 上 Node 校验会失败并表现为 fetch failed：在环境变量增加 KUAISHOU_OPENAPI_RELAY_TLS_INSECURE=1（仅用于可信自建中继）；或为中继配置域名与受信任证书后可删除该变量。'
        : ''
    return {
      statusCode: 502,
      body: { message: `快手鉴权或门店查询失败：${detail}${whitelistHint}${rateLimitHint}${relayHtmlHint}${relayTlsHint}` },
    }
  }
}

export const config = { maxDuration: 60 }

function sendSafeJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
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

function rawBody(req: VercelRequest): string {
  try {
    if (typeof req.body === 'string') return req.body
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
    if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
    return '{}'
  } catch {
    return '{}'
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      res.status(204).end()
      return
    }

    if (req.method !== 'POST') {
      sendSafeJson(res, 405, { message: 'Method Not Allowed' })
      return
    }

    const r = await runKuaishouMerchantBind(rawBody(req))
    let payload: string
    try {
      payload = JSON.stringify(r.body)
    } catch {
      payload = JSON.stringify({ message: '绑定结果无法序列化为 JSON' })
    }
    if (!res.writableEnded) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.status(r.statusCode).send(payload)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendSafeJson(res, 500, {
      message: msg || '快手绑定处理异常',
      hint: '请确认 Vercel Root Directory 为 web版/merchant-erp，并已部署含本文件的最新构建。',
    })
  }
}
