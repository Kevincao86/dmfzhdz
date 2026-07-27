import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createOpsServiceRoleClient } from '../createOpsServiceRoleClient.js'
import { opsTenantResetPasswordAdmin } from '../opsTenantsMutationsBackend.js'
import {
  bearerTokenFromAuthHeader,
  createPartnerScopedTenant,
  loadPartnerCityAccounts,
  mapTenantAccountPublic,
  patchPartnerScopedTenant,
  requireRegionalPartnerSession,
  resolveLicenseCityInScope,
  searchTenantsForPartnerClaim,
  tenantCityInPartnerScope,
} from '../regionalPartnersBackend.js'
import { sendOpsJson } from '../safeOpsJson.js'

function rawBody(req: VercelRequest): string {
  if (typeof req.body === 'string') return req.body
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object')
    return JSON.stringify(req.body)
  return '{}'
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const client = createOpsServiceRoleClient()
  if (!client.ok) {
    sendOpsJson(res, client.status, client.body)
    return
  }

  const token = bearerTokenFromAuthHeader(req.headers.authorization)
  const auth = await requireRegionalPartnerSession(client.admin, token, process.env)
  if (!auth.ok) {
    sendOpsJson(res, auth.status, { ok: false, code: auth.error, message: '未登录或会话已过期' })
    return
  }
  if (!auth.partner.permissions.includes('merchants')) {
    sendOpsJson(res, 403, { ok: false, code: 'permission_denied', message: '无商家列表权限' })
    return
  }

  try {
    if (req.method === 'GET') {
      const q = String(
        (req.query?.q as string | undefined) ??
          new URL(req.url || '', 'http://local').searchParams.get('q') ??
          '',
      ).trim()

      if (q) {
        const found = await searchTenantsForPartnerClaim(client.admin, auth.partner, q)
        sendOpsJson(res, 200, {
          ok: true,
          merchants: found.map((row) => ({
            ...mapTenantAccountPublic(row),
            inScope:
              row.regional_partner_id === auth.partner.id ||
              tenantCityInPartnerScope(row, auth.partner.cities),
            canClaim: true,
          })),
        })
        return
      }

      const merchants = await loadPartnerCityAccounts(client.admin, auth.partner)
      sendOpsJson(res, 200, {
        ok: true,
        cities: auth.partner.cities,
        merchants: merchants.map((m) => ({
          ...mapTenantAccountPublic(m),
          inScope: true,
          canClaim: false,
        })),
      })
      return
    }

    if (req.method !== 'POST') {
      sendOpsJson(res, 405, { ok: false, message: 'Method Not Allowed' })
      return
    }

    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody(req) || '{}') as Record<string, unknown>
    } catch {
      sendOpsJson(res, 400, { ok: false, message: 'invalid_json' })
      return
    }

    const action = String(body.action ?? 'update').trim().toLowerCase()

    if (action === 'preview_license_city') {
      const hit = resolveLicenseCityInScope(
        String(body.licenseAddress ?? ''),
        auth.partner.cities,
      )
      if (!hit.ok) {
        sendOpsJson(res, 400, {
          ok: false,
          code: hit.error,
          message:
            hit.error === 'license_city_not_in_scope'
              ? '营业执照住所城市未命中你的代理城市范围'
              : '请填写营业执照住所/经营场所地址',
        })
        return
      }
      sendOpsJson(res, 200, {
        ok: true,
        city: hit.city,
        matchedToken: hit.matchedToken,
      })
      return
    }

    if (action === 'create') {
      const r = await createPartnerScopedTenant(client.admin, auth.partner, {
        loginName: String(body.loginName ?? ''),
        password: String(body.password ?? ''),
        merchantName: String(body.merchantName ?? ''),
        edition: body.edition === 'partner' ? 'partner' : 'merchant',
        licenseAddress: String(body.licenseAddress ?? ''),
        trialDays: body.trialDays != null ? Number(body.trialDays) : 7,
      })
      if (!r.ok) {
        const msgMap: Record<string, string> = {
          invalid_login_name: '登录名须为 4–32 位字母或数字',
          password_too_short: '密码至少 6 位',
          invalid_merchant_name: '请填写公司/商家名称',
          license_address_required: '请填写营业执照住所地址',
          license_city_not_in_scope: '营业执照住所城市未命中你的代理城市范围，无法开户',
          login_exists: '该登录名已存在',
          auth_create_failed: '创建登录账号失败',
          tenant_insert_failed: '创建租户失败',
          member_insert_failed: '绑定成员失败',
        }
        sendOpsJson(res, 400, {
          ok: false,
          code: r.error,
          message: msgMap[r.error] ?? r.error,
          detail: r.detail,
        })
        return
      }
      sendOpsJson(res, 200, {
        ok: true,
        tenantId: r.tenantId,
        city: r.city,
        matchedToken: r.matchedToken,
      })
      return
    }

    if (action === 'reset_password') {
      const tenantId = String(body.tenantId ?? body.id ?? '').trim()
      const gateCities = await loadPartnerCityAccounts(client.admin, auth.partner)
      const allowed = gateCities.some((t) => t.id === tenantId)
      if (!allowed) {
        // 允许对搜索认领中的账号先设城市再改密：若带 city 则先 patch
        if (body.registerCity) {
          const claim = await patchPartnerScopedTenant(client.admin, auth.partner, {
            tenantId,
            registerCity: String(body.registerCity),
            registerProvince:
              body.registerProvince != null ? String(body.registerProvince) : undefined,
          })
          if (!claim.ok) {
            sendOpsJson(res, 400, { ok: false, code: claim.error, message: claim.error })
            return
          }
        } else {
          sendOpsJson(res, 403, { ok: false, code: 'out_of_scope', message: '不在代理城市范围内' })
          return
        }
      }
      const r = await opsTenantResetPasswordAdmin(client.admin, {
        id: tenantId,
        password: body.password != null ? String(body.password) : '123456',
      })
      if (!r.ok) {
        sendOpsJson(res, r.status, r.body)
        return
      }
      sendOpsJson(res, 200, { ok: true })
      return
    }

    if (action === 'update' || action === 'claim') {
      const r = await patchPartnerScopedTenant(client.admin, auth.partner, {
        tenantId: String(body.tenantId ?? body.id ?? '').trim(),
        merchantName: body.merchantName != null ? String(body.merchantName) : undefined,
        accountStatus:
          body.accountStatus === 'normal' ||
          body.accountStatus === 'disabled' ||
          body.accountStatus === 'frozen'
            ? body.accountStatus
            : undefined,
        opsGiftDays:
          body.opsGiftDays != null && Number.isFinite(Number(body.opsGiftDays))
            ? Number(body.opsGiftDays)
            : undefined,
        registerCity: body.registerCity != null ? String(body.registerCity) : undefined,
        registerProvince:
          body.registerProvince != null ? String(body.registerProvince) : undefined,
        licenseAddress: body.licenseAddress != null ? String(body.licenseAddress) : undefined,
      })
      if (!r.ok) {
        const msg =
          r.error === 'city_out_of_scope' || r.error === 'license_city_not_in_scope'
            ? '营业执照住所城市未命中代理范围'
            : r.error === 'out_of_scope'
              ? '该账号不在代理城市范围内，请填写执照住所以认领'
              : r.error === 'license_address_required'
                ? '请填写营业执照住所地址'
                : r.error
        sendOpsJson(res, 400, { ok: false, code: r.error, message: msg })
        return
      }
      sendOpsJson(res, 200, { ok: true, merchant: mapTenantAccountPublic(r.row) })
      return
    }

    sendOpsJson(res, 400, { ok: false, message: 'unknown_action' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, { ok: false, code: 'server_error', message: msg.slice(0, 400) })
  }
}
