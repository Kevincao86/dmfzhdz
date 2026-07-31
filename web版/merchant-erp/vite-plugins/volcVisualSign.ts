/**
 * 火山引擎 OpenAPI V4 签名（visual / cv 服务）
 * @see https://github.com/volcengine/volc-openapi-demos/blob/main/signature/nodejs/sign.js
 */
import crypto from 'node:crypto'

function hmac(secret: string | Buffer, s: string): Buffer {
  return crypto.createHmac('sha256', secret).update(s, 'utf8').digest()
}

function hashHex(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex')
}

function uriEscape(str: string): string {
  return encodeURIComponent(str).replace(/[!*'()]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
}

function queryParamsToString(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${uriEscape(key)}=${uriEscape(params[key] ?? '')}`)
    .join('&')
}

export function volcDateTimeNow(): string {
  return new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
}

export type VolcSignedRequest = {
  url: string
  headers: Record<string, string>
  body: string
}

/** 签发 visual.volcengineapi.com JSON POST */
export function signVolcVisualJsonPost(opts: {
  accessKeyId: string
  secretAccessKey: string
  action: string
  version?: string
  region?: string
  body: Record<string, unknown>
}): VolcSignedRequest {
  const host = 'visual.volcengineapi.com'
  const region = (opts.region || 'cn-north-1').trim() || 'cn-north-1'
  const version = opts.version || '2022-08-31'
  const bodyStr = JSON.stringify(opts.body)
  const xDate = volcDateTimeNow()
  const shortDate = xDate.slice(0, 8)
  const payloadHash = hashHex(bodyStr)
  const query: Record<string, string> = {
    Action: opts.action,
    Version: version,
  }
  const canonicalQuery = queryParamsToString(query)
  const signedHeaders = 'content-type;host;x-content-sha256;x-date'
  const canonicalHeaders =
    `content-type:application/json\n` +
    `host:${host}\n` +
    `x-content-sha256:${payloadHash}\n` +
    `x-date:${xDate}\n`
  const canonicalRequest = [
    'POST',
    '/',
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')
  const credentialScope = `${shortDate}/${region}/cv/request`
  const stringToSign = ['HMAC-SHA256', xDate, credentialScope, hashHex(canonicalRequest)].join('\n')
  const kDate = hmac(opts.secretAccessKey, shortDate)
  const kRegion = hmac(kDate, region)
  const kService = hmac(kRegion, 'cv')
  const kSigning = hmac(kService, 'request')
  const signature = hmac(kSigning, stringToSign).toString('hex')
  const authorization =
    `HMAC-SHA256 Credential=${opts.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  return {
    url: `https://${host}/?${canonicalQuery}`,
    headers: {
      'Content-Type': 'application/json',
      'X-Date': xDate,
      'X-Content-Sha256': payloadHash,
      Authorization: authorization,
    },
    body: bodyStr,
  }
}
