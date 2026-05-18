/**
 * 阿里云号码认证服务（Dypnsapi）短信验证码：SendSmsVerifyCode / CheckSmsVerifyCode
 * @see https://help.aliyun.com/zh/pnvs/developer-reference/api-dypnsapi-2017-05-25-sendsmsverifycode
 */
import Dypnsapi20170525, * as $Dypnsapi from '@alicloud/dypnsapi20170525'
import { Config } from '@alicloud/openapi-client'

export function aliyunSmsConfigured(): boolean {
  return !!(
    process.env.ALIBABA_CLOUD_ACCESS_KEY_ID?.trim() &&
    process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET?.trim() &&
    process.env.ALIYUN_DYPNS_SIGN_NAME?.trim() &&
    process.env.ALIYUN_DYPNS_TEMPLATE_CODE?.trim()
  )
}

function createClient(): Dypnsapi20170525 {
  return new Dypnsapi20170525(
    new Config({
      accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID!.trim(),
      accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET!.trim(),
      endpoint: (process.env.ALIYUN_DYPNS_ENDPOINT ?? 'dypnsapi.aliyuncs.com').trim(),
    }),
  )
}

function apiMessage(body: { code?: string; message?: string; Message?: string } | undefined): string {
  if (!body) return 'unknown'
  return String(body.message ?? body.Message ?? body.code ?? 'unknown')
}

export async function sendAliyunSmsVerifyCode(
  phone: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const client = createClient()
  const req = new $Dypnsapi.SendSmsVerifyCodeRequest({
    phoneNumber: phone,
    countryCode: '86',
    signName: process.env.ALIYUN_DYPNS_SIGN_NAME!.trim(),
    templateCode: process.env.ALIYUN_DYPNS_TEMPLATE_CODE!.trim(),
    templateParam: process.env.ALIYUN_DYPNS_TEMPLATE_PARAM?.trim() || '{"code":"##code##"}',
    codeLength: 6,
    validTime: 300,
    interval: 60,
    duplicatePolicy: 1,
  })
  try {
    const res = await client.sendSmsVerifyCode(req)
    const body = res.body
    if (body?.code === 'OK' || body?.success === true) {
      return { ok: true }
    }
    return { ok: false, message: apiMessage(body) }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

export async function checkAliyunSmsVerifyCode(
  phone: string,
  code: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const client = createClient()
  const req = new $Dypnsapi.CheckSmsVerifyCodeRequest({
    phoneNumber: phone,
    countryCode: '86',
    verifyCode: code.trim(),
  })
  try {
    const res = await client.checkSmsVerifyCode(req)
    const body = res.body
    if (body?.code === 'OK' || body?.success === true) {
      return { ok: true }
    }
    return { ok: false, message: apiMessage(body) }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
