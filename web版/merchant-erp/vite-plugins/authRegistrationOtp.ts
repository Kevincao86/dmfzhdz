import { createHash, randomInt } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export type OtpRecord = {
  codeHash: string
  expiresAt: number
  attempts: number
}

const OTP_TTL_MS = 5 * 60 * 1000
const MAX_VERIFY_ATTEMPTS = 8

function otpStorePath(viteRoot?: string): string {
  if (viteRoot) {
    return path.resolve(viteRoot, '..', '..', '.meoo-dev-sync', 'registration-otp.json')
  }
  return path.join('/tmp', 'meoo-registration-otp.json')
}

function readStore(filePath: string): Record<string, OtpRecord> {
  try {
    if (!fs.existsSync(filePath)) return {}
    const raw = fs.readFileSync(filePath, 'utf8')
    const j = JSON.parse(raw) as Record<string, OtpRecord>
    return j && typeof j === 'object' ? j : {}
  } catch {
    return {}
  }
}

function writeStore(filePath: string, data: Record<string, OtpRecord>): void {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 0), 'utf8')
}

function hashCode(phone: string, code: string): string {
  return createHash('sha256').update(`${phone}:${code}:${process.env.MEOO_OTP_PEPPER ?? 'meoo'}`).digest('hex')
}

export function normalizeCnMobile(raw: string): string | null {
  const digits = String(raw || '').replace(/\D/g, '')
  if (/^1\d{10}$/.test(digits)) return digits
  return null
}

export function isValidLoginName(loginName: string): boolean {
  return /^[a-zA-Z0-9]{4,32}$/.test(loginName.trim())
}

export function isValidMerchantShortName(name: string): boolean {
  const t = name.trim()
  if (t.length < 2 || t.length > 30) return false
  return /^[\u4e00-\u9fa5a-zA-Z0-9·（）()\-—\s]+$/.test(t)
}

export function issueSmsCode(phone: string, viteRoot?: string): { code: string; expiresAt: number } {
  const filePath = otpStorePath(viteRoot)
  const code = String(randomInt(100000, 999999))
  const expiresAt = Date.now() + OTP_TTL_MS
  const store = readStore(filePath)
  store[phone] = { codeHash: hashCode(phone, code), expiresAt, attempts: 0 }
  writeStore(filePath, store)
  return { code, expiresAt }
}

export function verifySmsCode(phone: string, code: string, viteRoot?: string): boolean {
  const filePath = otpStorePath(viteRoot)
  const store = readStore(filePath)
  const row = store[phone]
  if (!row) return false
  if (Date.now() > row.expiresAt) {
    delete store[phone]
    writeStore(filePath, store)
    return false
  }
  if (row.attempts >= MAX_VERIFY_ATTEMPTS) return false
  row.attempts += 1
  const ok = row.codeHash === hashCode(phone, code.trim())
  if (ok) delete store[phone]
  writeStore(filePath, store)
  return ok
}

export async function dispatchSms(phone: string, code: string): Promise<{ sent: boolean; devExpose?: string }> {
  const provider = (process.env.MEOO_SMS_PROVIDER ?? '').trim().toLowerCase()
  if (provider === 'none' || process.env.MEOO_SMS_DEV_EXPOSE === '1') {
    return { sent: true, devExpose: code }
  }
  // 预留：接入阿里云/腾讯云短信；未配置时 dev 回显验证码
  if (process.env.NODE_ENV !== 'production' || process.env.MEOO_SMS_DEV_EXPOSE === '1') {
    return { sent: true, devExpose: code }
  }
  console.info(`[meoo-sms] to=${phone} code=${code} (no provider configured)`)
  return { sent: false }
}
