import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createOpsServiceRoleClient } from '../createOpsServiceRoleClient.js'
import {
  assignMerchantToPartner,
  bearerTokenFromAuthHeader,
  createRegionalPartner,
  listRegionalPartners,
  parseCities,
  parsePartnerPermissions,
  requireOpsRegionalPartnersAccess,
  unassignMerchantFromPartner,
  updateRegionalPartner,
  type RegionalPartnerModuleKey,
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
  const auth = await requireOpsRegionalPartnersAccess(client.admin, token, process.env)
  if (!auth.ok) {
    sendOpsJson(res, auth.status, {
      ok: false,
      message:
        auth.error === 'permission_denied'
          ? '无区域服务商管理权限'
          : '未登录或会话已过期',
      code: auth.error,
    })
    return
  }

  try {
    if (req.method === 'GET') {
      const partners = await listRegionalPartners(client.admin)
      sendOpsJson(res, 200, { ok: true, partners })
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

    const action = String(body.action ?? '').trim().toLowerCase()

    if (action === 'create') {
      const permissions = Array.isArray(body.permissions)
        ? parsePartnerPermissions(body.permissions)
        : undefined
      const r = await createRegionalPartner(client.admin, {
        phone: String(body.phone ?? ''),
        companyName: String(body.companyName ?? ''),
        password: String(body.password ?? ''),
        cities: parseCities(body.cities),
        permissions: permissions as RegionalPartnerModuleKey[] | undefined,
        partnerShareRate:
          body.partnerShareRate != null ? Number(body.partnerShareRate) : undefined,
        platformShareRate:
          body.platformShareRate != null ? Number(body.platformShareRate) : undefined,
        note: body.note != null ? String(body.note) : undefined,
      })
      if (!r.ok) {
        sendOpsJson(res, 400, {
          ok: false,
          code: r.error,
          message:
            r.error === 'city_exclusive_conflict'
              ? `城市「${r.conflictCity ?? ''}」已有其他区域服务商`
              : r.error,
          conflictCity: r.conflictCity,
        })
        return
      }
      sendOpsJson(res, 200, { ok: true, partner: r.partner })
      return
    }

    if (action === 'update') {
      const id = String(body.id ?? '').trim()
      const permissions =
        body.permissions != null ? parsePartnerPermissions(body.permissions) : undefined
      const r = await updateRegionalPartner(client.admin, id, {
        companyName: body.companyName != null ? String(body.companyName) : undefined,
        password: body.password != null ? String(body.password) : undefined,
        cities: body.cities != null ? parseCities(body.cities) : undefined,
        permissions,
        partnerShareRate:
          body.partnerShareRate != null ? Number(body.partnerShareRate) : undefined,
        platformShareRate:
          body.platformShareRate != null ? Number(body.platformShareRate) : undefined,
        status:
          body.status === 'disabled' ? 'disabled' : body.status === 'active' ? 'active' : undefined,
        note: body.note != null ? String(body.note) : undefined,
      })
      if (!r.ok) {
        sendOpsJson(res, 400, {
          ok: false,
          code: r.error,
          message:
            r.error === 'city_exclusive_conflict'
              ? `城市「${r.conflictCity ?? ''}」已有其他区域服务商`
              : r.error,
          conflictCity: r.conflictCity,
        })
        return
      }
      sendOpsJson(res, 200, { ok: true, partner: r.partner })
      return
    }

    if (action === 'assign_merchant') {
      const r = await assignMerchantToPartner(client.admin, {
        tenantId: String(body.tenantId ?? '').trim(),
        partnerId: String(body.partnerId ?? '').trim(),
        attributionCity:
          body.attributionCity != null ? String(body.attributionCity) : undefined,
      })
      if (!r.ok) {
        sendOpsJson(res, 400, { ok: false, code: r.error, message: r.error })
        return
      }
      sendOpsJson(res, 200, { ok: true })
      return
    }

    if (action === 'unassign_merchant') {
      const r = await unassignMerchantFromPartner(client.admin, String(body.tenantId ?? '').trim())
      if (!r.ok) {
        sendOpsJson(res, 400, { ok: false, code: r.error, message: r.error })
        return
      }
      sendOpsJson(res, 200, { ok: true })
      return
    }

    sendOpsJson(res, 400, { ok: false, message: 'unknown_action' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/regional_partners|does not exist|schema cache/i.test(msg)) {
      sendOpsJson(res, 503, {
        ok: false,
        code: 'regional_partners_table_missing',
        message: '请在轻量执行 bash scripts/ecs-apply-regional-partners.sh',
        detail: msg.slice(0, 200),
      })
      return
    }
    sendOpsJson(res, 500, { ok: false, code: 'server_error', message: msg.slice(0, 400) })
  }
}
