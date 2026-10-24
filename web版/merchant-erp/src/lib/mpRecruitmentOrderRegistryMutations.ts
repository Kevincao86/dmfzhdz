import type {
  RegistryMpRecruitmentApplicant,
  RegistryMpRecruitmentOrder,
  RegistrySnapshot,
  RecruitmentCpsLinkage,
} from './opsRegistryTypes.js'
import { filterSelectedIdsToApplicants, pruneApplicantIdRefsOnOrder } from './mpApplicantIdentity.js'
import { normalizeMarketingCenter, reconcileCashGrantsWithOrders } from './marketingCampaignCore.js'
import { applyOpenLoopSettleAction, setOpenLoopSettleRemind } from './openLoopSettlement.js'

export type MpRecruitmentPatchBody = {
  id?: string
  status?: RegistryMpRecruitmentOrder['status']
  applicants?: RegistryMpRecruitmentApplicant[]
  order?: RegistryMpRecruitmentOrder
  selectedApplicantIds?: string[]
  groupQrImage?: string
  /** PR 星选：林客 CPS 定向计划联动 */
  cpsLinkage?: RecruitmentCpsLinkage
  /** 达人完成招募单后补交一张发票图片 */
  talentInvoice?: { applicantId?: string; url?: string; fileName?: string }
  /** 开环：达人交片 / 结算自记 */
  openLoopSettle?: { applicantId?: string; action?: string }
  /** 达人打开或关闭商单结算提醒，不需要订单号 */
  settleRemind?: { memberId?: string; enabled?: boolean }
}

/** 整单 patch 时：客户端未加载 applicants 常会传 []，不得覆盖注册表已有报名 */
export function resolveApplicantsOnFullOrderPatch(
  curApplicants: RegistryMpRecruitmentApplicant[] | undefined,
  orderApplicants: RegistryMpRecruitmentApplicant[] | undefined,
): RegistryMpRecruitmentApplicant[] {
  if (orderApplicants === undefined) return curApplicants ?? []
  if (
    Array.isArray(orderApplicants) &&
    orderApplicants.length === 0 &&
    (curApplicants?.length ?? 0) > 0
  ) {
    return curApplicants ?? []
  }
  return orderApplicants
}

function stampApplicantsSelected(
  applicants: RegistryMpRecruitmentApplicant[] | undefined,
  selectedIds: string[],
  publisherIdentity?: string,
): RegistryMpRecruitmentApplicant[] {
  const set = new Set(selectedIds.map((id) => String(id)))
  const isMerchant = publisherIdentity === 'merchant'
  return (applicants ?? []).map((a) => {
    const on = set.has(String(a.id))
    return {
      ...a,
      prSelected: on,
      merchantSelected: isMerchant ? on : a.merchantSelected,
    }
  })
}

const MAX_TALENT_INVOICES = 3

function appendTalentInvoiceOnOrder(
  data: RegistrySnapshot,
  idx: number,
  cur: RegistryMpRecruitmentOrder,
  raw: MpRecruitmentPatchBody['talentInvoice'],
  now: string,
): { ok: true } | { ok: false; error: string; status: number } {
  const applicantId = String(raw?.applicantId || '').trim()
  const url = String(raw?.url || '').trim()
  const fileName = String(raw?.fileName || '')
    .trim()
    .replace(/[\\/]/g, '')
    .slice(0, 80)
  if (!applicantId || !/^https:\/\//i.test(url) || url.length > 2048) {
    return { ok: false, error: 'invalid_invoice', status: 400 }
  }
  const meta =
    cur.mpPublishMeta && typeof cur.mpPublishMeta === 'object'
      ? (cur.mpPublishMeta as Record<string, unknown>)
      : {}
  if (cur.requireTalentInvoice !== true && meta.requireTalentInvoice !== true) {
    return { ok: false, error: 'invoice_not_required', status: 400 }
  }
  const applicants = [...(cur.applicants ?? [])]
  const ai = applicants.findIndex((a) => a && String(a.id) === applicantId)
  if (ai < 0) return { ok: false, error: 'applicant_not_found', status: 404 }
  const prev = Array.isArray(applicants[ai]!.talentInvoices) ? applicants[ai]!.talentInvoices! : []
  if (prev.some((x) => String(x?.url || '') === url)) return { ok: true }
  if (prev.length >= MAX_TALENT_INVOICES) {
    return { ok: false, error: 'invoice_limit', status: 400 }
  }
  applicants[ai] = {
    ...applicants[ai]!,
    talentInvoices: [...prev, { url, ...(fileName ? { fileName } : {}), uploadedAt: now }],
  }
  data.mpRecruitmentOrders![idx] = { ...cur, applicants, updatedAt: now }
  return { ok: true }
}

export function patchMpRecruitmentOrderInSnapshot(
  data: RegistrySnapshot,
  body: MpRecruitmentPatchBody,
): { ok: true } | { ok: false; error: string; status: number } {
  if (body.settleRemind != null) {
    return setOpenLoopSettleRemind(
      data,
      String(body.settleRemind.memberId || ''),
      body.settleRemind.enabled === true,
    )
  }
  const id = (body.id ?? '').trim()
  const order = body.order
  const status = body.status
  const applicants = body.applicants
  const selectedApplicantIds = body.selectedApplicantIds
  const hasGroupQr = body.groupQrImage !== undefined
  const hasCpsLinkage = body.cpsLinkage !== undefined
  const hasTalentInvoice = body.talentInvoice != null
  const hasOpenLoopSettle = body.openLoopSettle != null
  const MAX_GROUP_QR_LEN = 120_000
  if (!id) return { ok: false, error: 'invalid_patch', status: 400 }
  if (hasGroupQr && String(body.groupQrImage || '').length > MAX_GROUP_QR_LEN) {
    return { ok: false, error: 'group_qr_too_large', status: 400 }
  }
  if (!order && !status && !applicants && !selectedApplicantIds && !hasGroupQr && !hasCpsLinkage && !hasTalentInvoice && !hasOpenLoopSettle) {
    return { ok: false, error: 'invalid_patch', status: 400 }
  }
  if (
    status &&
    status !== 'open' &&
    status !== 'collecting' &&
    status !== 'pending_settlement' &&
    status !== 'closed' &&
    status !== 'done'
  ) {
    return { ok: false, error: 'invalid_patch', status: 400 }
  }
  const idx = data.mpRecruitmentOrders?.findIndex((o) => o.id === id) ?? -1
  if (!data.mpRecruitmentOrders || idx < 0) {
    return { ok: false, error: 'not_found', status: 404 }
  }
  const cur = data.mpRecruitmentOrders[idx]!
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  if (hasTalentInvoice) {
    return appendTalentInvoiceOnOrder(data, idx, cur, body.talentInvoice, now)
  }
  if (hasOpenLoopSettle) {
    const result = applyOpenLoopSettleAction(
      cur,
      String(body.openLoopSettle?.applicantId || ''),
      String(body.openLoopSettle?.action || ''),
      new Date(),
    )
    if (!result.ok) return { ok: false, error: result.error, status: result.error === 'applicant_not_found' ? 404 : 400 }
    data.mpRecruitmentOrders[idx] = result.order
    return { ok: true }
  }
  if (order && order.id === id) {
    const mergedApplicants = resolveApplicantsOnFullOrderPatch(cur.applicants, order.applicants)
    data.mpRecruitmentOrders[idx] = pruneApplicantIdRefsOnOrder({
      ...cur,
      ...order,
      id,
      sourceMerchantOrderId: cur.sourceMerchantOrderId,
      createdAt: cur.createdAt,
      applicants: mergedApplicants,
      updatedAt: now,
    })
  } else {
    const applicantPool = applicants ?? cur.applicants
    const nextSelectedIds = selectedApplicantIds
      ? filterSelectedIdsToApplicants(applicantPool, selectedApplicantIds)
      : null
  if (hasGroupQr) {
    const qr = String(body.groupQrImage || '').trim()
    const snap = data as RegistrySnapshot & { mpGroupQrByOrderId?: Record<string, string> }
    if (qr) {
      if (!snap.mpGroupQrByOrderId || typeof snap.mpGroupQrByOrderId !== 'object') {
        snap.mpGroupQrByOrderId = {}
      }
      snap.mpGroupQrByOrderId[id] = qr
    } else if (snap.mpGroupQrByOrderId && typeof snap.mpGroupQrByOrderId === 'object') {
      delete snap.mpGroupQrByOrderId[id]
    }
    const metaRaw = cur.mpPublishMeta && typeof cur.mpPublishMeta === 'object' ? cur.mpPublishMeta : {}
    const meta = { ...(metaRaw as Record<string, unknown>) }
    delete meta.groupQrImage
    data.mpRecruitmentOrders[idx] = {
      ...cur,
      ...(status ? { status } : {}),
      ...(applicants ? { applicants } : {}),
      ...(nextSelectedIds
        ? {
            selectedApplicantIds: nextSelectedIds,
            applicants: stampApplicantsSelected(cur.applicants, nextSelectedIds, cur.publisherIdentity),
          }
        : {}),
      groupQrImage: undefined,
      mpPublishMeta: Object.keys(meta).length ? meta : undefined,
      ...(hasCpsLinkage ? { cpsLinkage: body.cpsLinkage } : {}),
      updatedAt: now,
    }
  } else {
    data.mpRecruitmentOrders[idx] = {
      ...cur,
      ...(status ? { status } : {}),
      ...(applicants ? { applicants } : {}),
      ...(nextSelectedIds
        ? {
            selectedApplicantIds: nextSelectedIds,
            applicants: stampApplicantsSelected(cur.applicants, nextSelectedIds, cur.publisherIdentity),
          }
        : {}),
      ...(hasCpsLinkage ? { cpsLinkage: body.cpsLinkage } : {}),
      updatedAt: now,
    }
  }
  }
  return { ok: true }
}

export function deleteMpRecruitmentOrdersFromSnapshot(
  data: RegistrySnapshot,
  rawIds: string[],
): { ok: true; deletedIds: string[] } | { ok: false; error: string; status: number } {
  const ids = [...new Set(rawIds.map((x) => String(x || '').trim()).filter(Boolean))]
  if (!ids.length) return { ok: false, error: 'invalid_delete', status: 400 }
  const idSet = new Set(ids)
  const list = data.mpRecruitmentOrders ?? []
  const deletedIds = list.filter((o) => o && idSet.has(o.id)).map((o) => o.id)
  if (!deletedIds.length) return { ok: false, error: 'not_found', status: 404 }

  data.mpRecruitmentOrders = list.filter((o) => o && !idSet.has(o.id))

  for (const order of data.recruitmentOrders ?? []) {
    if (!order) continue
    const linked = String(order.linkedMpOrderId || '').trim()
    if (linked && idSet.has(linked)) {
      order.linkedMpOrderId = undefined
    }
  }

  data.mpTalentInbox = (data.mpTalentInbox ?? []).filter((item) => {
    const mpId = String(item?.mpOrderId || '').trim()
    return !mpId || !idSet.has(mpId)
  })

  const cash = reconcileCashGrantsWithOrders(
    normalizeMarketingCenter(data.marketingCenter),
    data.mpRecruitmentOrders ?? [],
  )
  if (cash.removed > 0) data.marketingCenter = cash.center

  return { ok: true, deletedIds }
}

export function deleteMpRecruitmentOrderFromSnapshot(
  data: RegistrySnapshot,
  id: string,
): { ok: true } | { ok: false; error: string; status: number } {
  const result = deleteMpRecruitmentOrdersFromSnapshot(data, [id])
  if (!result.ok) return result
  return { ok: true }
}
