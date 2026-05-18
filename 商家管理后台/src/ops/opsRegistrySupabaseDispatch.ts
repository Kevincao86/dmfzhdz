/**
 * 线上：注册表读写 Supabase ops_registry_snapshot；逻辑与 vite-plugins opsRegistryGatewayShared 对齐。
 * 通过 RegistrySnapshotIo 注入读写实现（Vercel 使用 fetch PostgREST，避免 supabase-js）。
 */
import { createHash } from 'node:crypto'
import type {
  RegistryMpRecruitmentApplicant,
  RegistryMpRecruitmentOrder,
  RegistryMpTalentMember,
  RegistryRecruitmentOrder,
  RegistryScheduleRow,
  RegistryTalentPoolRow,
  RegistryTenant,
  RegistryVideoSubmission,
} from '../meooRegistryShared/opsRegistryTypes.js'
import { filterLegacyDemoRecruitmentOrders } from '../meooRegistryShared/recruitmentLegacyDemoOrders.js'
import { upsertMpTalentMember } from '../meooRegistryShared/mpTalentMemberUpsert.js'
import { upsertTalentLibraryFromApplicant } from '../meooRegistryShared/talentLibraryUpsert.js'
import type { RegistrySnapshotIo } from './registrySnapshotIo.js'

function sha256Hex(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('hex')
}

export async function dispatchOpsRegistrySupabase(opts: {
  method: string
  /** e.g. /api/ops-sync/registry */
  urlPath: string
  bodyRaw: string
  io: RegistrySnapshotIo
}): Promise<{ status: number; body: unknown }> {
  const { method, urlPath, bodyRaw, io } = opts

  try {
    if (method === 'GET' && urlPath === '/api/ops-sync/registry') {
      const data = await io.load()
      const before = data.recruitmentOrders ?? []
      const cleaned = filterLegacyDemoRecruitmentOrders(before)
      if (cleaned.length !== before.length) {
        data.recruitmentOrders = cleaned
        await io.save(data)
      }
      return { status: 200, body: data }
    }

    if (method === 'POST' && urlPath === '/api/ops-sync/tenants/erp') {
      const body = JSON.parse(bodyRaw || '{}') as { tenant?: RegistryTenant }
      const tenant = body.tenant
      if (!tenant || !tenant.id || !tenant.loginName) {
        return { status: 400, body: { ok: false, error: 'invalid_tenant' } }
      }
      const data = await io.load()
      const nextTenants = data.tenants.filter((t) => t.id !== tenant.id)
      nextTenants.push({
        ...tenant,
        source: 'erp',
        updatedAt: new Date().toISOString(),
      })
      data.tenants = nextTenants
      await io.save(data)
      return { status: 200, body: { ok: true } }
    }

    if (method === 'POST' && urlPath === '/api/ops-sync/tenants/manual') {
      const body = JSON.parse(bodyRaw || '{}') as {
        loginName?: string
        password?: string
        merchantName?: string
        trialDays?: number
        officialDays?: number
        industry?: string
      }
      const loginName = (body.loginName ?? '').trim()
      const password = body.password ?? ''
      const merchantName = (body.merchantName ?? '').trim()
      const trialDays = Math.max(0, Math.min(3650, Number(body.trialDays) || 0))
      const officialDays = Math.max(0, Math.min(36500, Number(body.officialDays) || 0))
      const industry = (body.industry ?? '综合服务').trim() || '综合服务'
      if (loginName.length < 2 || password.length < 6 || merchantName.length < 1) {
        return { status: 400, body: { ok: false, error: 'invalid_fields' } }
      }
      const data = await io.load()
      const lnKey = loginName.toLowerCase()
      if (data.tenants.some((t) => (t.loginName ?? '').trim().toLowerCase() === lnKey)) {
        return { status: 409, body: { ok: false, error: 'login_exists' } }
      }
      const now = new Date()
      const id = `ops-${now.getTime()}`
      const passwordHash = sha256Hex(password)
      const trialEnds = new Date(now)
      trialEnds.setDate(trialEnds.getDate() + trialDays)
      const officialEnds = new Date(trialEnds)
      officialEnds.setDate(officialEnds.getDate() + officialDays)
      const row: RegistryTenant = {
        id,
        source: 'ops_manual',
        loginName,
        passwordHash,
        merchantName,
        industry,
        registeredAt: now.toISOString(),
        accountStatus: 'normal',
        trialDays,
        officialDays,
        trialEndsAt: trialDays > 0 ? trialEnds.toISOString() : undefined,
        officialEndsAt: officialDays > 0 ? officialEnds.toISOString() : undefined,
        updatedAt: now.toISOString(),
      }
      data.tenants.push(row)
      await io.save(data)
      return { status: 200, body: { ok: true, id } }
    }

    if (method === 'POST' && urlPath === '/api/ops-sync/ai') {
      const { opsRegistrySupabaseSaveAiModels } = await import('./opsRegistrySupabaseAiWrites.js')
      return opsRegistrySupabaseSaveAiModels(io, bodyRaw)
    }

    if (method === 'POST' && urlPath === '/api/ops-sync/video-ai') {
      const { opsRegistrySupabaseSaveVideoAi } = await import('./opsRegistrySupabaseAiWrites.js')
      return opsRegistrySupabaseSaveVideoAi(io, bodyRaw)
    }

    if (method === 'POST' && urlPath === '/api/ops-sync/vendor-keys') {
      const { opsRegistrySupabaseSaveVendorKeys } = await import('./opsRegistrySupabaseAiWrites.js')
      return opsRegistrySupabaseSaveVendorKeys(io, bodyRaw)
    }

    if (method === 'POST' && urlPath === '/api/ops-sync/tenants/patch') {
      const body = JSON.parse(bodyRaw || '{}') as {
        id?: string
        merchantName?: string
        industry?: string
        accountStatus?: RegistryTenant['accountStatus']
        trialDays?: number
        officialDays?: number
        password?: string
      }
      const id = (body.id ?? '').trim()
      if (!id) {
        return { status: 400, body: { ok: false, error: 'missing_id' } }
      }
      const data = await io.load()
      const idx = data.tenants.findIndex((t) => t.id === id)
      if (idx < 0) {
        return { status: 404, body: { ok: false, error: 'not_found' } }
      }
      const cur = data.tenants[idx]!
      if (typeof body.merchantName === 'string' && body.merchantName.trim())
        cur.merchantName = body.merchantName.trim()
      if (typeof body.industry === 'string' && body.industry.trim()) cur.industry = body.industry.trim()
      if (body.accountStatus === 'normal' || body.accountStatus === 'disabled' || body.accountStatus === 'frozen') {
        cur.accountStatus = body.accountStatus
      }
      if (typeof body.trialDays === 'number' && Number.isFinite(body.trialDays)) {
        cur.trialDays = Math.max(0, Math.min(3650, Math.floor(body.trialDays)))
      }
      if (typeof body.officialDays === 'number' && Number.isFinite(body.officialDays)) {
        cur.officialDays = Math.max(0, Math.min(36500, Math.floor(body.officialDays)))
      }
      if (typeof body.password === 'string' && body.password.length >= 6) {
        cur.passwordHash = sha256Hex(body.password)
      }
      const base = new Date(cur.registeredAt || Date.now())
      if (cur.trialDays > 0) {
        const te = new Date(base)
        te.setDate(te.getDate() + cur.trialDays)
        cur.trialEndsAt = te.toISOString()
      } else {
        cur.trialEndsAt = undefined
      }
      if (cur.officialDays > 0) {
        const start = cur.trialEndsAt ? new Date(cur.trialEndsAt) : new Date(base)
        const oe = new Date(start)
        oe.setDate(oe.getDate() + cur.officialDays)
        cur.officialEndsAt = oe.toISOString()
      } else {
        cur.officialEndsAt = undefined
      }
      cur.updatedAt = new Date().toISOString()
      data.tenants[idx] = cur
      await io.save(data)
      return { status: 200, body: { ok: true } }
    }

    if (method === 'POST' && urlPath === '/api/ops-sync/recruitment-orders/append') {
      const body = JSON.parse(bodyRaw || '{}') as { order?: RegistryRecruitmentOrder }
      const order = body.order
      if (!order || !order.id || !order.customerName) {
        return { status: 400, body: { ok: false, error: 'invalid_order' } }
      }
      const data = await io.load()
      const list = [...(data.recruitmentOrders ?? [])]
      list.unshift(order)
      data.recruitmentOrders = list.slice(0, 200)
      await io.save(data)
      return { status: 200, body: { ok: true } }
    }

    if (method === 'POST' && urlPath === '/api/ops-sync/recruitment-orders/set') {
      const body = JSON.parse(bodyRaw || '{}') as { orders?: RegistryRecruitmentOrder[] }
      const orders = Array.isArray(body.orders) ? body.orders : []
      const data = await io.load()
      data.recruitmentOrders = orders.slice(0, 200)
      await io.save(data)
      return { status: 200, body: { ok: true } }
    }

    if (method === 'POST' && urlPath === '/api/ops-sync/recruitment-orders/patch') {
      const body = JSON.parse(bodyRaw || '{}') as {
        id?: string
        status?: RegistryRecruitmentOrder['status']
        acceptMode?: RegistryRecruitmentOrder['acceptMode']
        linkedMpOrderId?: string
        recruitmentPlatform?: RegistryRecruitmentOrder['recruitmentPlatform']
      }
      const id = (body.id ?? '').trim()
      const status = body.status
      if (!id) {
        return { status: 400, body: { ok: false, error: 'invalid_patch' } }
      }
      const okStatus =
        status === undefined ||
        status === 'pending' ||
        status === 'accepted' ||
        status === 'done' ||
        status === 'cancelled' ||
        status === 'refunded'
      if (!okStatus) {
        return { status: 400, body: { ok: false, error: 'invalid_patch' } }
      }
      const data = await io.load()
      const idx = data.recruitmentOrders?.findIndex((o) => o.id === id) ?? -1
      if (!data.recruitmentOrders || idx < 0) {
        return { status: 404, body: { ok: false, error: 'not_found' } }
      }
      const cur = data.recruitmentOrders[idx]!
      data.recruitmentOrders[idx] = {
        ...cur,
        ...(status !== undefined ? { status } : {}),
        ...(body.acceptMode === 'manual' || body.acceptMode === 'miniprogram'
          ? { acceptMode: body.acceptMode }
          : {}),
        ...(typeof body.linkedMpOrderId === 'string' && body.linkedMpOrderId.trim()
          ? { linkedMpOrderId: body.linkedMpOrderId.trim() }
          : {}),
        ...(body.recruitmentPlatform === '抖音' || body.recruitmentPlatform === '小红书'
          ? { recruitmentPlatform: body.recruitmentPlatform }
          : {}),
      }
      await io.save(data)
      return { status: 200, body: { ok: true } }
    }

    if (method === 'POST' && urlPath === '/api/ops-sync/mp-recruitment-orders/append') {
      const body = JSON.parse(bodyRaw || '{}') as { order?: RegistryMpRecruitmentOrder }
      const order = body.order
      if (!order || !order.id || !order.sourceMerchantOrderId) {
        return { status: 400, body: { ok: false, error: 'invalid_mp_order' } }
      }
      const data = await io.load()
      const list = [...(data.mpRecruitmentOrders ?? [])]
      const sid = String(order.sourceMerchantOrderId || '').trim()
      const dup = list.find((o) => o && String(o.sourceMerchantOrderId || '').trim() === sid)
      if (dup) {
        return {
          status: 409,
          body: { ok: false, error: 'duplicate_merchant_order', existingId: dup.id },
        }
      }
      list.unshift(order)
      data.mpRecruitmentOrders = list.slice(0, 200)
      await io.save(data)
      return { status: 200, body: { ok: true, id: order.id } }
    }

    if (method === 'POST' && urlPath === '/api/ops-sync/mp-recruitment-orders/patch') {
      const body = JSON.parse(bodyRaw || '{}') as {
        id?: string
        status?: RegistryMpRecruitmentOrder['status']
      }
      const id = (body.id ?? '').trim()
      const status = body.status
      if (!id) {
        return { status: 400, body: { ok: false, error: 'invalid_patch' } }
      }
      const okStatus =
        status === 'open' || status === 'collecting' || status === 'closed' || status === 'done'
      if (!okStatus) {
        return { status: 400, body: { ok: false, error: 'invalid_patch' } }
      }
      const data = await io.load()
      const idx = data.mpRecruitmentOrders?.findIndex((o) => o.id === id) ?? -1
      if (!data.mpRecruitmentOrders || idx < 0) {
        return { status: 404, body: { ok: false, error: 'not_found' } }
      }
      data.mpRecruitmentOrders[idx] = {
        ...data.mpRecruitmentOrders[idx]!,
        status,
        updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      }
      await io.save(data)
      return { status: 200, body: { ok: true } }
    }

    if (method === 'POST' && urlPath === '/api/ops-sync/mp-recruitment-orders/apply') {
      const body = JSON.parse(bodyRaw || '{}') as {
        mpOrderId?: string
        applicant?: RegistryMpRecruitmentApplicant
      }
      const mpOrderId = (body.mpOrderId ?? '').trim()
      const applicant = body.applicant
      const nick = (applicant?.platformNickname || applicant?.name || '').trim()
      if (!mpOrderId || !applicant || !applicant.id || !nick) {
        return { status: 400, body: { ok: false, error: 'invalid_apply' } }
      }
      applicant.platformNickname = nick
      applicant.name = nick
      const data = await io.load()
      const idx = data.mpRecruitmentOrders?.findIndex((o) => o.id === mpOrderId) ?? -1
      if (!data.mpRecruitmentOrders || idx < 0) {
        return { status: 404, body: { ok: false, error: 'not_found' } }
      }
      const cur = data.mpRecruitmentOrders[idx]!
      const merchantOrderNo = cur.sourceMerchantOrderId
      const platform = cur.platform || '抖音'
      const row = {
        ...applicant,
        mpOrderId,
        merchantOrderNo,
        paymentMethod: applicant.paymentMethod || (applicant.alipayAccount ? `支付宝：${applicant.alipayAccount}` : '支付宝'),
      }
      const applicants = [...(cur.applicants ?? [])]
      applicants.unshift(row)
      data.mpRecruitmentOrders[idx] = {
        ...cur,
        applicants: applicants.slice(0, 500),
        status: cur.status === 'open' ? 'collecting' : cur.status,
        updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      }
      upsertTalentLibraryFromApplicant(data, {
        platform,
        applicant: row,
        mpOrderId,
        merchantOrderNo,
      })
      await io.save(data)
      return { status: 200, body: { ok: true } }
    }

    if (method === 'POST' && urlPath === '/api/ops-sync/mp-talent-members/register') {
      const body = JSON.parse(bodyRaw || '{}') as { member?: RegistryMpTalentMember }
      const member = body.member
      if (!member || !member.memberType || !String(member.wxNickName || '').trim()) {
        return { status: 400, body: { ok: false, error: 'invalid_member' } }
      }
      if (!String(member.contact || '').trim() || !String(member.wechatId || '').trim()) {
        return { status: 400, body: { ok: false, error: 'contact_required' } }
      }
      const data = await io.load()
      upsertMpTalentMember(data, member)
      await io.save(data)
      return { status: 200, body: { ok: true, id: member.id } }
    }

    if (method === 'POST' && urlPath === '/api/ops-sync/talent-pool/append') {
      const body = JSON.parse(bodyRaw || '{}') as { candidates?: RegistryTalentPoolRow[] }
      const candidates = Array.isArray(body.candidates) ? body.candidates : []
      const data = await io.load()
      const list = [...(data.talentPoolCandidates ?? [])]
      for (const c of [...candidates].reverse()) list.unshift(c)
      data.talentPoolCandidates = list.slice(0, 240)
      await io.save(data)
      return { status: 200, body: { ok: true } }
    }

    if (method === 'POST' && urlPath === '/api/ops-sync/talent-pool/set') {
      const body = JSON.parse(bodyRaw || '{}') as { candidates?: RegistryTalentPoolRow[] }
      const candidates = Array.isArray(body.candidates) ? body.candidates : []
      const data = await io.load()
      data.talentPoolCandidates = candidates.slice(0, 240)
      await io.save(data)
      return { status: 200, body: { ok: true } }
    }

    if (method === 'POST' && urlPath === '/api/ops-sync/recruitment-schedule/set') {
      const body = JSON.parse(bodyRaw || '{}') as { rows?: RegistryScheduleRow[] }
      const rows = Array.isArray(body.rows) ? body.rows : []
      const data = await io.load()
      data.recruitmentScheduleRows = rows.slice(0, 400)
      await io.save(data)
      return { status: 200, body: { ok: true } }
    }

    if (method === 'POST' && urlPath === '/api/ops-sync/recruitment-videos/set') {
      const body = JSON.parse(bodyRaw || '{}') as { videos?: RegistryVideoSubmission[] }
      const videos = Array.isArray(body.videos) ? body.videos : []
      const data = await io.load()
      data.recruitmentVideoSubmissions = videos.slice(0, 400)
      await io.save(data)
      return { status: 200, body: { ok: true } }
    }

    return { status: 404, body: { ok: false, error: 'not_found', path: urlPath } }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { status: 502, body: { ok: false, error: 'ops_sync_failed', detail: msg.slice(0, 400) } }
  }
}
