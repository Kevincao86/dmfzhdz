import type {
  RegistryFile,
  RegistryIceVideoSlot,
  RegistryMpRecruitmentApplicant,
  RegistryMpRecruitmentOrder,
} from './opsRegistryTypes.js'

export function isIceMpOrder(mp: RegistryMpRecruitmentOrder): boolean {
  return mp.hall === 'ice' || mp.orderKind === 'recruitment_ice'
}

export function iceSlotsFilledCount(mp: RegistryMpRecruitmentOrder): number {
  return (mp.iceVideoSlots ?? []).filter((s) => s.assignedApplicantId?.trim()).length
}

export function iceSlotsPassedCount(mp: RegistryMpRecruitmentOrder): number {
  const ids = new Set(
    (mp.applicants ?? [])
      .filter((a) => a.aiVerifyStatus === 'passed')
      .map((a) => a.id),
  )
  return (mp.iceVideoSlots ?? []).filter((s) => s.assignedApplicantId && ids.has(s.assignedApplicantId!))
    .length
}

export function isDouyinVideoUrl(raw: string): boolean {
  const t = raw.trim()
  if (!/^https?:\/\//i.test(t)) return false
  try {
    const u = new URL(t)
    const host = u.hostname.toLowerCase()
    return (
      host.includes('douyin.com') ||
      host.includes('iesdouyin.com') ||
      host === 'v.douyin.com'
    )
  } catch {
    return false
  }
}

/** 简易 AI 核查：链接形态 + 非空路径（可后续接真实模型） */
export function verifyDouyinPublishLink(url: string): { passed: boolean; note: string } {
  if (!isDouyinVideoUrl(url)) {
    return { passed: false, note: '请提交抖音视频作品链接（douyin.com）' }
  }
  const t = url.trim()
  if (t.length < 12) return { passed: false, note: '链接过短' }
  return { passed: true, note: '链接格式符合抖音作品页' }
}

export function maybeAdvanceIceMpToSettlement(
  mp: RegistryMpRecruitmentOrder,
): RegistryMpRecruitmentOrder {
  const slots = mp.iceVideoSlots ?? []
  if (!slots.length) return mp
  const allAssigned = slots.every((s) => s.assignedApplicantId?.trim())
  const allPassed = slots.every((s) => {
    const aid = s.assignedApplicantId?.trim()
    if (!aid) return false
    const app = (mp.applicants ?? []).find((a) => a.id === aid)
    return app?.aiVerifyStatus === 'passed'
  })
  if (allAssigned && allPassed && mp.status !== 'done' && mp.status !== 'closed') {
    return {
      ...mp,
      status: 'pending_settlement',
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    }
  }
  return mp
}

export type ApplyIceMpResult =
  | { ok: true; applicant: RegistryMpRecruitmentApplicant; slot: RegistryIceVideoSlot }
  | { ok: false; error: string; code?: string }

export function applyIceMpRecruitment(
  mp: RegistryMpRecruitmentOrder,
  applicant: RegistryMpRecruitmentApplicant,
): ApplyIceMpResult {
  const slots = [...(mp.iceVideoSlots ?? [])]
  if (!slots.length) return { ok: false, error: '云剪任务未配置成片', code: 'no_slots' }
  const existing = slots.find((s) => s.assignedApplicantId === applicant.id)
  if (existing) {
    return {
      ok: true,
      applicant: {
        ...applicant,
        assignedIceSlotId: existing.slotId,
        assignedVideoDownloadUrl: existing.downloadUrl,
        assignedVideoLabel: existing.label,
      },
      slot: existing,
    }
  }
  const freeIdx = slots.findIndex((s) => !s.assignedApplicantId?.trim())
  if (freeIdx < 0) {
    return { ok: false, error: '任务已满，暂无可用成片名额', code: 'slots_full' }
  }
  const slot = slots[freeIdx]!
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  slots[freeIdx] = {
    ...slot,
    assignedApplicantId: applicant.id,
    assignedAt: now,
  }
  const row: RegistryMpRecruitmentApplicant = {
    ...applicant,
    assignedIceSlotId: slot.slotId,
    assignedVideoDownloadUrl: slot.downloadUrl,
    assignedVideoLabel: slot.label,
    aiVerifyStatus: 'pending',
    appliedAt: applicant.appliedAt || now,
  }
  return { ok: true, applicant: row, slot: slots[freeIdx]! }
}

export function submitIceDouyinForApplicant(
  mp: RegistryMpRecruitmentOrder,
  applicantId: string,
  douyinPublishUrl: string,
): { ok: true; mp: RegistryMpRecruitmentOrder } | { ok: false; error: string } {
  const url = douyinPublishUrl.trim()
  const verify = verifyDouyinPublishLink(url)
  if (!verify.passed) return { ok: false, error: verify.note }

  const applicants = [...(mp.applicants ?? [])]
  const idx = applicants.findIndex((a) => a.id === applicantId)
  if (idx < 0) return { ok: false, error: '未找到报名记录' }

  const app = applicants[idx]!
  if (!app.assignedIceSlotId) return { ok: false, error: '未分配云剪成片，请先认领任务' }

  const slots = [...(mp.iceVideoSlots ?? [])]
  const slotIdx = slots.findIndex((s) => s.slotId === app.assignedIceSlotId)
  if (slotIdx < 0) return { ok: false, error: '成片槽位无效' }

  applicants[idx] = {
    ...app,
    douyinPublishUrl: url,
    aiVerifyStatus: 'passed',
    aiVerifyNote: verify.note,
    completedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  }

  let next: RegistryMpRecruitmentOrder = {
    ...mp,
    applicants,
    iceVideoSlots: slots,
    updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  }
  next = maybeAdvanceIceMpToSettlement(next)
  return { ok: true, mp: next }
}

export function patchRegistryMpOrder(
  data: RegistryFile,
  mpOrderId: string,
  patch: Partial<RegistryMpRecruitmentOrder>,
): RegistryFile | null {
  const list = [...(data.mpRecruitmentOrders ?? [])]
  const idx = list.findIndex((o) => o.id === mpOrderId)
  if (idx < 0) return null
  list[idx] = { ...list[idx]!, ...patch, updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }) }
  return { ...data, mpRecruitmentOrders: list }
}
