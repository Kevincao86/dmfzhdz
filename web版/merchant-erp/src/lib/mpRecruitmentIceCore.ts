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

export type ClaimIceMpResult =
  | { ok: true; applicant: RegistryMpRecruitmentApplicant; needConfirm: true }
  | { ok: true; applicant: RegistryMpRecruitmentApplicant; needConfirm: false; slot: RegistryIceVideoSlot }
  | { ok: false; error: string; code?: string }

/** 闭环第一步：认领任务，待达人确认接收（不立即分配成片） */
export function claimIceMpRecruitment(
  mp: RegistryMpRecruitmentOrder,
  applicant: RegistryMpRecruitmentApplicant,
): ClaimIceMpResult {
  const slots = [...(mp.iceVideoSlots ?? [])]
  if (!slots.length) return { ok: false, error: '云剪任务未配置成片', code: 'no_slots' }

  const existing = (mp.applicants ?? []).find((a) => a.id === applicant.id)
  if (existing) {
    if (existing.taskStatus === 'confirmed' && existing.assignedIceSlotId) {
      const slot = slots.find((s) => s.slotId === existing.assignedIceSlotId)
      if (slot) {
        return { ok: true, applicant: existing, needConfirm: false, slot }
      }
    }
    if (existing.taskStatus === 'pending_confirm' || !existing.taskStatus) {
      return { ok: true, applicant: existing, needConfirm: true }
    }
    if (existing.taskStatus === 'rejected') {
      return { ok: false, error: '您已拒绝该任务，无法再次认领', code: 'rejected' }
    }
  }

  const taken = slots.filter((s) => s.assignedApplicantId?.trim()).length
  const pending = (mp.applicants ?? []).filter(
    (a) => a.taskStatus === 'pending_confirm' && a.id !== applicant.id,
  ).length
  if (taken + pending >= slots.length) {
    return { ok: false, error: '任务已满，暂无可用名额', code: 'slots_full' }
  }

  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  const row: RegistryMpRecruitmentApplicant = {
    ...applicant,
    taskStatus: 'pending_confirm',
    aiVerifyStatus: 'pending',
    appliedAt: applicant.appliedAt || now,
  }
  return { ok: true, applicant: row, needConfirm: true }
}

export type ConfirmIceMpResult =
  | { ok: true; applicant: RegistryMpRecruitmentApplicant; slot: RegistryIceVideoSlot }
  | { ok: false; error: string; code?: string }

/** 闭环第二步：确认接收并分配成片槽位 */
export function confirmIceMpReceipt(
  mp: RegistryMpRecruitmentOrder,
  applicantId: string,
): ConfirmIceMpResult {
  const slots = [...(mp.iceVideoSlots ?? [])]
  const applicants = [...(mp.applicants ?? [])]
  const idx = applicants.findIndex((a) => a.id === applicantId)
  if (idx < 0) return { ok: false, error: '未找到认领记录', code: 'not_found' }

  const app = applicants[idx]!
  if (app.taskStatus === 'rejected') return { ok: false, error: '任务已拒绝', code: 'rejected' }
  if (app.taskStatus === 'confirmed' && app.assignedIceSlotId) {
    const slot = slots.find((s) => s.slotId === app.assignedIceSlotId)
    if (slot) return { ok: true, applicant: app, slot }
  }
  if (app.taskStatus !== 'pending_confirm' && app.taskStatus !== 'applied' && !app.taskStatus) {
    return { ok: false, error: '当前状态不可确认接收', code: 'invalid_state' }
  }

  const existingSlot = slots.find((s) => s.assignedApplicantId === applicantId)
  if (existingSlot) {
    const row = {
      ...app,
      taskStatus: 'confirmed' as const,
      assignedIceSlotId: existingSlot.slotId,
      assignedVideoDownloadUrl: existingSlot.downloadUrl,
      assignedVideoLabel: existingSlot.label,
    }
    applicants[idx] = row
    return { ok: true, applicant: row, slot: existingSlot }
  }

  const freeIdx = slots.findIndex((s) => !s.assignedApplicantId?.trim())
  if (freeIdx < 0) return { ok: false, error: '成片名额已满', code: 'slots_full' }

  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  const slot = slots[freeIdx]!
  slots[freeIdx] = { ...slot, assignedApplicantId: applicantId, assignedAt: now }
  const row: RegistryMpRecruitmentApplicant = {
    ...app,
    taskStatus: 'confirmed',
    assignedIceSlotId: slot.slotId,
    assignedVideoDownloadUrl: slot.downloadUrl,
    assignedVideoLabel: slot.label,
    aiVerifyStatus: 'pending',
  }
  applicants[idx] = row
  return { ok: true, applicant: row, slot: slots[freeIdx]! }
}

export function rejectIceMpTask(
  mp: RegistryMpRecruitmentOrder,
  applicantId: string,
): { ok: true; mp: RegistryMpRecruitmentOrder } | { ok: false; error: string } {
  const applicants = [...(mp.applicants ?? [])]
  const idx = applicants.findIndex((a) => a.id === applicantId)
  if (idx < 0) return { ok: false, error: '未找到认领记录' }

  const app = applicants[idx]!
  let slots = [...(mp.iceVideoSlots ?? [])]
  if (app.assignedIceSlotId) {
    const si = slots.findIndex((s) => s.slotId === app.assignedIceSlotId)
    if (si >= 0) {
      slots[si] = {
        ...slots[si]!,
        assignedApplicantId: undefined,
        assignedAt: undefined,
      }
    }
  }

  applicants[idx] = {
    ...app,
    taskStatus: 'rejected',
    assignedIceSlotId: undefined,
    assignedVideoDownloadUrl: undefined,
    assignedVideoLabel: undefined,
  }

  return {
    ok: true,
    mp: {
      ...mp,
      applicants,
      iceVideoSlots: slots,
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    },
  }
}

/** @deprecated 使用 claimIceMpRecruitment + confirmIceMpReceipt */
export function applyIceMpRecruitment(
  mp: RegistryMpRecruitmentOrder,
  applicant: RegistryMpRecruitmentApplicant,
): ConfirmIceMpResult {
  const claim = claimIceMpRecruitment(mp, applicant)
  if (!claim.ok) return claim
  if (claim.needConfirm) {
    const merged: RegistryMpRecruitmentOrder = {
      ...mp,
      applicants: upsertApplicant(mp.applicants, claim.applicant),
    }
    return confirmIceMpReceipt(merged, claim.applicant.id)
  }
  return { ok: true, applicant: claim.applicant, slot: claim.slot }
}

function upsertApplicant(
  list: RegistryMpRecruitmentApplicant[] | undefined,
  row: RegistryMpRecruitmentApplicant,
): RegistryMpRecruitmentApplicant[] {
  const applicants = [...(list ?? [])]
  const i = applicants.findIndex((a) => a.id === row.id)
  if (i >= 0) applicants[i] = row
  else applicants.unshift(row)
  return applicants
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
  if (app.taskStatus !== 'confirmed') {
    return { ok: false, error: '请先确认接收任务后再回传链接' }
  }
  if (!app.assignedIceSlotId) return { ok: false, error: '未分配云剪成片，请先确认接收' }

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

export function handleIceMpApply(
  mp: RegistryMpRecruitmentOrder,
  row: RegistryMpRecruitmentApplicant,
):
  | { ok: true; mp: RegistryMpRecruitmentOrder; body: Record<string, unknown> }
  | { ok: false; error: string; code?: string } {
  const dup = (mp.applicants ?? []).find((a) => a.id === row.id)
  if (dup?.taskStatus === 'confirmed' && dup.assignedVideoDownloadUrl) {
    return {
      ok: true,
      mp,
      body: {
        ok: true,
        needConfirm: false,
        taskStatus: 'confirmed',
        assignedVideoDownloadUrl: dup.assignedVideoDownloadUrl,
      },
    }
  }
  if (dup?.taskStatus === 'pending_confirm') {
    return {
      ok: true,
      mp,
      body: { ok: true, needConfirm: true, taskStatus: 'pending_confirm' },
    }
  }
  if (dup?.taskStatus === 'rejected') {
    return { ok: false, error: '您已拒绝该任务', code: 'rejected' }
  }

  const claim = claimIceMpRecruitment(mp, row)
  if (!claim.ok) return claim
  const applicants = upsertApplicant(mp.applicants, claim.applicant)
  const next: RegistryMpRecruitmentOrder = {
    ...mp,
    applicants,
    status: mp.status === 'open' ? 'collecting' : mp.status,
    updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  }
  return {
    ok: true,
    mp: next,
    body: { ok: true, needConfirm: true, taskStatus: 'pending_confirm' },
  }
}

export function handleIceMpConfirm(
  mp: RegistryMpRecruitmentOrder,
  applicantId: string,
  action: 'confirm' | 'reject',
):
  | { ok: true; mp: RegistryMpRecruitmentOrder; body: Record<string, unknown> }
  | { ok: false; error: string; code?: string } {
  if (action === 'reject') {
    const rejected = rejectIceMpTask(mp, applicantId)
    if (!rejected.ok) return rejected
    return { ok: true, mp: rejected.mp, body: { ok: true, taskStatus: 'rejected' } }
  }
  const result = confirmIceMpReceipt(mp, applicantId)
  if (!result.ok) return result
  const applicants = upsertApplicant(mp.applicants, result.applicant)
  const iceVideoSlots = mp.iceVideoSlots?.map((s) =>
    s.slotId === result.slot.slotId ? result.slot : s,
  )
  const next: RegistryMpRecruitmentOrder = {
    ...mp,
    applicants,
    iceVideoSlots,
    updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  }
  return {
    ok: true,
    mp: next,
    body: {
      ok: true,
      taskStatus: 'confirmed',
      assignedVideoDownloadUrl: result.applicant.assignedVideoDownloadUrl,
      assignedVideoLabel: result.applicant.assignedVideoLabel,
    },
  }
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
