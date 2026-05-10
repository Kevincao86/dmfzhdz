/**
 * 线上 Serverless：将抖音绑定凭证封装为 accessToken（AES-GCM），避免无状态环境下内存 sessions 失效。
 * 本地 dev 未配置 MERCHANT_DOUYIN_SESSION_SECRET 时仍使用随机 hex + Map（见 douyinMerchantGateway）。
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const PREFIX = 'moo1.'
const ALGO = 'aes-256-gcm'

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, 'meoo-douyin-session', 32)
}

export type DouyinSessionCredentialsPayload = {
  clientKey: string
  clientSecret: string
  merchantId: string
}

export function sealDouyinSessionCredentials(
  payload: DouyinSessionCredentialsPayload,
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

export function openDouyinSessionCredentials(token: string): DouyinSessionCredentialsPayload | null {
  if (!token.startsWith(PREFIX)) return null
  const secret = process.env.MERCHANT_DOUYIN_SESSION_SECRET?.trim()
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
    const j = JSON.parse(plain.toString('utf8')) as DouyinSessionCredentialsPayload
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

export function merchantDouyinSessionSecret(): string {
  return process.env.MERCHANT_DOUYIN_SESSION_SECRET?.trim() ?? ''
}
