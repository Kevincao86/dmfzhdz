import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import {
  isValidLoginName,
  isValidMerchantShortName,
  normalizeCnMobile,
} from './authRegistrationOtp.js'
import { provisionMerchantTenant } from './authRegisterProvision.js'
import {
  createAdminSessionForUserId,
  smsLoginErrorMessage,
  findAuthUserByPhone,
  phoneAlreadyRegistered,
  sendAuthSmsCode,
  signInWithPasswordLoginName,
  verifyAuthSmsCode,
} from './authSmsAuthShared.js'
import { signInWithWxLoginCode, wxLoginErrorMessage } from './authWxLoginShared.js'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, code: number, body: unknown) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export function authRegisterGatewayPlugin(): Plugin {
  return {
    name: 'meoo-auth-register-gateway',
    configureServer(server) {
      const viteRoot = server.config.root

      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        if (req.method !== 'POST') return next()

        if (url === '/api/meoo-auth-sms-send') {
          try {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as { phone?: string }
            const phone = normalizeCnMobile(body.phone ?? '')
            if (!phone) {
              json(res, 400, { ok: false, error: 'invalid_phone', message: '请输入有效大陆手机号' })
              return
            }
            const sms = await sendAuthSmsCode(phone, viteRoot)
            if (!sms.ok) {
              json(res, 503, { ok: false, error: sms.error, message: sms.message })
              return
            }
            json(res, 200, {
              ok: true,
              message: sms.message,
              ...(sms.devCode ? { devCode: sms.devCode } : {}),
            })
          } catch (e) {
            json(res, 500, { ok: false, error: 'sms_send_failed', detail: String(e) })
          }
          return
        }

        if (url === '/api/meoo-auth-sms-verify') {
          try {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as { phone?: string; smsCode?: string }
            const phone = normalizeCnMobile(body.phone ?? '')
            const smsCode = String(body.smsCode ?? '').trim()
            if (!phone) {
              json(res, 400, { ok: false, error: 'invalid_phone', message: '请输入有效大陆手机号' })
              return
            }
            if (!/^\d{6}$/.test(smsCode)) {
              json(res, 400, { ok: false, error: 'invalid_sms_code', message: '请输入 6 位验证码' })
              return
            }
            const valid = await verifyAuthSmsCode(phone, smsCode, viteRoot, { skipRemoteFallback: true })
            if (!valid) {
              json(res, 200, { ok: false, error: 'sms_code_invalid', message: '验证码错误或已过期' })
              return
            }
            json(res, 200, { ok: true })
          } catch (e) {
            json(res, 500, { ok: false, error: 'sms_verify_failed', detail: String(e) })
          }
          return
        }

        if (url === '/api/meoo-auth-password-login') {
          try {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as { loginName?: string; password?: string }
            const result = await signInWithPasswordLoginName(body.loginName ?? '', body.password ?? '')
            if (!result.ok) {
              const status =
                result.error === 'invalid_credentials' ||
                result.error === 'invalid_login_name' ||
                result.error === 'invalid_password'
                  ? 400
                  : result.error === 'supabase_not_configured'
                    ? 503
                    : 500
              json(res, status, { ok: false, error: result.error, message: result.message })
              return
            }
            json(res, 200, {
              ok: true,
              access_token: result.access_token,
              refresh_token: result.refresh_token,
              expires_in: result.expires_in,
              loginName: result.loginName,
            })
          } catch (e) {
            json(res, 500, { ok: false, error: 'password_login_failed', detail: String(e) })
          }
          return
        }

        if (url === '/api/meoo-auth-wx-login') {
          try {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as {
              code?: string
              stableDevOpenId?: string
              wxNickName?: string
              wxAvatarUrl?: string
            }
            const out = await signInWithWxLoginCode({
              code: String(body.code ?? ''),
              stableDevOpenId:
                typeof body.stableDevOpenId === 'string' ? body.stableDevOpenId : undefined,
              wxNickName: typeof body.wxNickName === 'string' ? body.wxNickName : undefined,
              wxAvatarUrl: typeof body.wxAvatarUrl === 'string' ? body.wxAvatarUrl : undefined,
            })
            if (!out.ok) {
              const status =
                out.error === 'wx_not_configured'
                  ? 503
                  : out.error === 'wx_openid_already_bound'
                    ? 409
                    : 400
              json(res, status, {
                ok: false,
                error: out.error,
                message: out.message || wxLoginErrorMessage(out.error, out.detail),
                detail: out.detail,
              })
              return
            }
            json(res, 200, {
              ok: true,
              access_token: out.access_token,
              refresh_token: out.refresh_token,
              expires_in: out.expires_in,
              loginName: out.loginName,
              isNew: out.isNew,
            })
          } catch (e) {
            json(res, 500, { ok: false, error: 'wx_login_failed', detail: String(e) })
          }
          return
        }

        if (url === '/api/meoo-auth-sms-login') {
          try {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as { phone?: string; smsCode?: string }
            const phone = normalizeCnMobile(body.phone ?? '')
            const smsCode = String(body.smsCode ?? '').trim()
            if (!phone) {
              json(res, 400, { ok: false, error: 'invalid_phone', message: '请输入有效大陆手机号' })
              return
            }
            if (!/^\d{6}$/.test(smsCode)) {
              json(res, 400, { ok: false, error: 'invalid_sms_code', message: '请输入 6 位验证码' })
              return
            }
            if (!(await verifyAuthSmsCode(phone, smsCode, viteRoot))) {
              json(res, 400, { ok: false, error: 'sms_code_invalid', message: '验证码错误或已过期' })
              return
            }
            const user = await findAuthUserByPhone(phone)
            if (!user) {
              json(res, 404, {
                ok: false,
                error: 'phone_not_registered',
                message: '该手机号尚未注册，请先注册',
              })
              return
            }
            const session = await createAdminSessionForUserId(user.userId, user.email)
            if (!session.ok) {
              json(res, 503, {
                ok: false,
                error: session.error,
                message: smsLoginErrorMessage(session.error, session.detail),
                detail: session.detail,
              })
              return
            }
            json(res, 200, {
              ok: true,
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              expires_in: session.expires_in,
              loginName: user.loginName,
            })
          } catch (e) {
            json(res, 500, { ok: false, error: 'sms_login_failed', detail: String(e) })
          }
          return
        }

        if (url === '/api/meoo-auth-register') {
          try {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as {
              loginName?: string
              merchantName?: string
              phone?: string
              smsCode?: string
              password?: string
              confirmPassword?: string
            }
            const loginName = (body.loginName ?? '').trim()
            const merchantName = (body.merchantName ?? '').trim()
            const phone = normalizeCnMobile(body.phone ?? '')
            const smsCode = String(body.smsCode ?? '').trim()
            const password = body.password ?? ''
            const confirmPassword = body.confirmPassword ?? password

            if (!isValidLoginName(loginName)) {
              json(res, 400, { ok: false, error: 'invalid_login_name', message: '登录名须为 4–32 位字母或数字' })
              return
            }
            if (!isValidMerchantShortName(merchantName)) {
              json(res, 400, { ok: false, error: 'invalid_merchant_name', message: '商家简称 2–30 字，可含汉字' })
              return
            }
            if (!phone) {
              json(res, 400, { ok: false, error: 'invalid_phone' })
              return
            }
            if (!/^\d{6}$/.test(smsCode)) {
              json(res, 400, { ok: false, error: 'invalid_sms_code' })
              return
            }
            if (password.length < 6) {
              json(res, 400, { ok: false, error: 'invalid_password', message: '密码至少 6 位' })
              return
            }
            if (password !== confirmPassword) {
              json(res, 400, { ok: false, error: 'password_mismatch', message: '两次输入的密码不一致' })
              return
            }
            if (!(await verifyAuthSmsCode(phone, smsCode, viteRoot))) {
              json(res, 400, { ok: false, error: 'sms_code_invalid', message: '验证码错误或已过期' })
              return
            }
            if (await phoneAlreadyRegistered(phone)) {
              json(res, 409, { ok: false, error: 'phone_exists', message: '该手机号已注册，请直接登录' })
              return
            }

            const result = await provisionMerchantTenant({
              loginName,
              password,
              merchantName,
              phone,
              trialDays: 0,
            })
            if (!result.ok) {
              const status =
                result.error === 'login_exists' ? 409 : result.error === 'supabase_admin_not_configured' ? 503 : 400
              const msg =
                result.error === 'login_exists'
                  ? '该登录名已被注册'
                  : result.error === 'supabase_admin_not_configured'
                    ? '注册服务未配置，请联系管理员'
                    : '注册失败'
              json(res, status, { ok: false, error: result.error, message: msg, detail: result.detail })
              return
            }
            json(res, 200, { ok: true, message: '注册成功，请登录', tenantId: result.tenantId })
          } catch (e) {
            json(res, 500, { ok: false, error: 'register_failed', detail: String(e) })
          }
          return
        }

        if (url === '/api/meoo-auth-register-partner') {
          try {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as {
              loginName?: string
              partnerName?: string
              merchantName?: string
              phone?: string
              smsCode?: string
              password?: string
              confirmPassword?: string
            }
            const loginName = (body.loginName ?? '').trim()
            const partnerName = (body.partnerName ?? body.merchantName ?? '').trim()
            const phone = normalizeCnMobile(body.phone ?? '')
            const smsCode = String(body.smsCode ?? '').trim()
            const password = body.password ?? ''
            const confirmPassword = body.confirmPassword ?? password

            if (!isValidLoginName(loginName)) {
              json(res, 400, { ok: false, error: 'invalid_login_name', message: '登录名须为 4–32 位字母或数字' })
              return
            }
            if (!isValidMerchantShortName(partnerName)) {
              json(res, 400, { ok: false, error: 'invalid_partner_name', message: '服务商简称 2–30 字' })
              return
            }
            if (!phone) {
              json(res, 400, { ok: false, error: 'invalid_phone' })
              return
            }
            if (!/^\d{6}$/.test(smsCode)) {
              json(res, 400, { ok: false, error: 'invalid_sms_code' })
              return
            }
            if (password.length < 6) {
              json(res, 400, { ok: false, error: 'invalid_password', message: '密码至少 6 位' })
              return
            }
            if (password !== confirmPassword) {
              json(res, 400, { ok: false, error: 'password_mismatch' })
              return
            }
            if (!(await verifyAuthSmsCode(phone, smsCode, viteRoot))) {
              json(res, 400, { ok: false, error: 'sms_code_invalid', message: '验证码错误或已过期' })
              return
            }
            if (await phoneAlreadyRegistered(phone)) {
              json(res, 409, { ok: false, error: 'phone_exists', message: '该手机号已注册，请直接登录' })
              return
            }

            const result = await provisionMerchantTenant({
              loginName,
              password,
              merchantName: partnerName,
              phone,
              trialDays: 0,
              edition: 'partner',
            })
            if (!result.ok) {
              const status =
                result.error === 'login_exists' ? 409 : result.error === 'supabase_admin_not_configured' ? 503 : 400
              json(res, status, { ok: false, error: result.error, message: '注册失败', detail: result.detail })
              return
            }
            json(res, 200, { ok: true, message: '服务商注册成功，请登录', tenantId: result.tenantId })
          } catch (e) {
            json(res, 500, { ok: false, error: 'register_failed', detail: String(e) })
          }
          return
        }

        return next()
      })
    },
  }
}
