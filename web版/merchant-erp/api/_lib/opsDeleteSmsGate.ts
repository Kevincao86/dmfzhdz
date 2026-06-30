/**
 * 运营管控台删除操作：须超级管理员手机 18768501283 短信验证码确认。
 */
import { sendAuthSmsCode, verifyAuthSmsCode } from '../../vite-plugins/authSmsAuthShared.js'

export const OPS_DELETE_CONFIRM_PHONE = '18768501283'

export type OpsDeleteSmsGateResult =
  | { ok: true }
  | { ok: false; status: number; error: string; message: string }

function readDeleteSmsCode(body: Record<string, unknown>): string {
  const raw = body.deleteSmsCode ?? body.smsCode
  return typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim()
}

export async function sendOpsDeleteConfirmSms(viteRoot?: string): Promise<
  | { ok: true; message: string; devCode?: string }
  | { ok: false; error: string; message?: string }
> {
  return sendAuthSmsCode(OPS_DELETE_CONFIRM_PHONE, viteRoot)
}

export async function verifyOpsDeleteSmsCode(code: string, viteRoot?: string): Promise<boolean> {
  const trimmed = String(code || '').trim()
  if (!/^\d{6}$/.test(trimmed)) return false
  return verifyAuthSmsCode(OPS_DELETE_CONFIRM_PHONE, trimmed, viteRoot)
}

export async function requireOpsDeleteSmsGate(
  body: Record<string, unknown>,
  viteRoot?: string,
): Promise<OpsDeleteSmsGateResult> {
  const code = readDeleteSmsCode(body)
  if (!code) {
    return {
      ok: false,
      status: 403,
      error: 'delete_sms_required',
      message: `删除操作须填写超级管理员（${OPS_DELETE_CONFIRM_PHONE}）短信验证码`,
    }
  }
  const valid = await verifyOpsDeleteSmsCode(code, viteRoot)
  if (!valid) {
    return {
      ok: false,
      status: 403,
      error: 'delete_sms_invalid',
      message: '短信验证码错误或已过期，请重新获取',
    }
  }
  return { ok: true }
}
