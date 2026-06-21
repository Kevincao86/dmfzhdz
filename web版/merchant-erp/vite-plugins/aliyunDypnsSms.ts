/**
 * 阿里云号码认证服务（Dypnsapi）短信验证码：SendSmsVerifyCode / CheckSmsVerifyCode
 * @see https://help.aliyun.com/zh/pnvs/developer-reference/api-dypnsapi-2017-05-25-sendsmsverifycode
 */
import { createRequire } from 'node:module'
import { $OpenApiUtil } from '@alicloud/openapi-core'

const require = createRequire(import.meta.url)
const DypnsapiPkg = require('@alicloud/dypnsapi20170525') as {
  default?: new (config: $OpenApiUtil.Config) => {
    sendSmsVerifyCode: (req: InstanceType<typeof SendSmsVerifyCodeRequestCtor>) => Promise<{ body?: Record<string, unknown> }>
    checkSmsVerifyCode: (req: InstanceType<typeof CheckSmsVerifyCodeRequestCtor>) => Promise<{ body?: Record<string, unknown> }>
  }
  SendSmsVerifyCodeRequest: new (...args: unknown[]) => unknown
  CheckSmsVerifyCodeRequest: new (...args: unknown[]) => unknown
}
const SendSmsVerifyCodeRequestCtor = DypnsapiPkg.SendSmsVerifyCodeRequest
const CheckSmsVerifyCodeRequestCtor = DypnsapiPkg.CheckSmsVerifyCodeRequest
type SendSmsVerifyCodeRequest = InstanceType<typeof SendSmsVerifyCodeRequestCtor>
type CheckSmsVerifyCodeRequest = InstanceType<typeof CheckSmsVerifyCodeRequestCtor>
const DypnsapiModule = DypnsapiPkg.default ?? DypnsapiPkg

/** Vercel ESM 加载 CJS SDK 时需取 .default */
function resolveSdkCtor<T extends new (config: $OpenApiUtil.Config) => {
  sendSmsVerifyCode: (req: SendSmsVerifyCodeRequest) => Promise<{ body?: Record<string, unknown> }>
  checkSmsVerifyCode: (req: CheckSmsVerifyCodeRequest) => Promise<{ body?: Record<string, unknown> }>
}>(mod: unknown): T {
  if (typeof mod === 'function') return mod as T
  if (mod && typeof mod === 'object' && 'default' in mod) {
    const d = (mod as { default: unknown }).default
    if (typeof d === 'function') return d as T
  }
  throw new Error('Dypnsapi SDK constructor unavailable')
}

const DypnsClient = resolveSdkCtor(DypnsapiModule as unknown)

/** ECS auth-api.env 常只配 OSS_*；短信与 OSS 可共用 RAM AccessKey */
function resolveAliyunAccessKeyId(): string {
  const keys = [
    'ALIBABA_CLOUD_ACCESS_KEY_ID',
    'ALIYUN_ICE_ACCESS_KEY_ID',
    'MERCHANT_PRODUCT_IMAGE_OSS_ACCESS_KEY_ID',
    'OSS_ACCESS_KEY_ID',
  ]
  for (const k of keys) {
    const v = process.env[k]?.trim()
    if (v) return v
  }
  return ''
}

function resolveAliyunAccessKeySecret(): string {
  const keys = [
    'ALIBABA_CLOUD_ACCESS_KEY_SECRET',
    'ALIYUN_ICE_ACCESS_KEY_SECRET',
    'MERCHANT_PRODUCT_IMAGE_OSS_ACCESS_KEY_SECRET',
    'OSS_ACCESS_KEY_SECRET',
  ]
  for (const k of keys) {
    const v = process.env[k]?.trim()
    if (v) return v
  }
  return ''
}

export function aliyunSmsConfigured(): boolean {
  return !!(
    resolveAliyunAccessKeyId() &&
    resolveAliyunAccessKeySecret() &&
    process.env.ALIYUN_DYPNS_SIGN_NAME?.trim() &&
    process.env.ALIYUN_DYPNS_TEMPLATE_CODE?.trim()
  )
}

/** 排障：列出未配置的短信环境变量 */
export function aliyunSmsMissingEnvKeys(): string[] {
  const missing: string[] = []
  if (!resolveAliyunAccessKeyId()) missing.push('ALIBABA_CLOUD_ACCESS_KEY_ID (或 OSS_ACCESS_KEY_ID)')
  if (!resolveAliyunAccessKeySecret()) missing.push('ALIBABA_CLOUD_ACCESS_KEY_SECRET (或 OSS_ACCESS_KEY_SECRET)')
  if (!process.env.ALIYUN_DYPNS_SIGN_NAME?.trim()) missing.push('ALIYUN_DYPNS_SIGN_NAME')
  if (!process.env.ALIYUN_DYPNS_TEMPLATE_CODE?.trim()) missing.push('ALIYUN_DYPNS_TEMPLATE_CODE')
  return missing
}

function createClient(): InstanceType<typeof DypnsClient> {
  const config = new $OpenApiUtil.Config({
    accessKeyId: resolveAliyunAccessKeyId(),
    accessKeySecret: resolveAliyunAccessKeySecret(),
    endpoint: (process.env.ALIYUN_DYPNS_ENDPOINT ?? 'dypnsapi.aliyuncs.com').trim(),
  })
  return new DypnsClient(config)
}

/** 赠送模板 100001 需 code + min；可用环境变量覆盖 */
function defaultTemplateParam(): string {
  return process.env.ALIYUN_DYPNS_TEMPLATE_PARAM?.trim() || '{"code":"##code##","min":"5"}'
}

function apiMessage(body: Record<string, unknown> | undefined): string {
  if (!body) return 'unknown'
  const msg = body.message ?? body.Message ?? body.code
  return String(msg ?? 'unknown')
}

function isOkBody(body: Record<string, unknown> | undefined): boolean {
  if (!body) return false
  return body.code === 'OK' || body.Code === 'OK' || body.success === true || body.Success === true
}

export async function sendAliyunSmsVerifyCode(
  phone: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const client = createClient()
  const req = new SendSmsVerifyCodeRequestCtor({
    phoneNumber: phone,
    countryCode: '86',
    signName: process.env.ALIYUN_DYPNS_SIGN_NAME!.trim(),
    templateCode: process.env.ALIYUN_DYPNS_TEMPLATE_CODE!.trim(),
    templateParam: defaultTemplateParam(),
    codeLength: 6,
    codeType: 1,
    validTime: 300,
    interval: 60,
    duplicatePolicy: 1,
  })
  try {
    const res = await client.sendSmsVerifyCode(req)
    const body = (res.body ?? res) as Record<string, unknown>
    if (isOkBody(body)) {
      return { ok: true }
    }
    return { ok: false, message: apiMessage(body) }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

function isVerifyPassBody(body: Record<string, unknown> | undefined): boolean {
  if (!body) return false
  const model = (body.Model ?? body.model) as Record<string, unknown> | undefined
  const result = String(model?.VerifyResult ?? model?.verifyResult ?? '').trim()
  if (result === 'PASS') return true
  if (result === 'UNKNOWN') return false
  // 兼容旧解析：无 VerifyResult 时仍看 Code（阿里云文档要求以 VerifyResult 为准）
  return isOkBody(body)
}

export async function checkAliyunSmsVerifyCode(
  phone: string,
  code: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const client = createClient()
  const req = new CheckSmsVerifyCodeRequestCtor({
    phoneNumber: phone,
    countryCode: '86',
    verifyCode: code.trim(),
  })
  try {
    const res = await client.checkSmsVerifyCode(req)
    const body = (res.body ?? res) as Record<string, unknown>
    if (isVerifyPassBody(body)) {
      return { ok: true }
    }
    const model = (body?.Model ?? body?.model) as Record<string, unknown> | undefined
    const verifyResult = String(model?.VerifyResult ?? model?.verifyResult ?? '').trim()
    if (verifyResult === 'UNKNOWN') {
      return { ok: false, message: '验证码错误' }
    }
    return { ok: false, message: apiMessage(body) || '验证码错误或已过期' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
