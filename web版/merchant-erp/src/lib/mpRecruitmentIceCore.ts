import type {
  RegistryFile,
  RegistryIceVideoSlot,
  RegistryMpRecruitmentApplicant,
  RegistryMpRecruitmentOrder,
} from './opsRegistryTypes.js'
import { extractDouyinShareFromText, resolveDouyinVideoPublishUrl } from './digitalHumanDouyinLinkCore.js'
import { getIceVerifyMode, isEditTeamIceMpOrder } from './iceOrderDetect.js'
import { verifyIceDouyinPublishWithAi } from './iceDouyinAiVerifyCore.js'
import { findDuplicateApplicant } from './mpApplicantIdentity.js'

export { isIceMpOrder, getIceVerifyMode, iceVerifyModeLabel, isEditTeamIceMpOrder, getEditGroupQrFromMp, getTalentGroupQrFromMp } from './iceOrderDetect.js'
export type { IceVerifyMode } from './iceOrderDetect.js'

function parseIceRecruitCapacity(mp: RegistryMpRecruitmentOrder): number {
  if (mp.recruitCount != null) {
    const n = Number.parseInt(String(mp.recruitCount), 10)
    if (Number.isFinite(n) && n > 0) return n
  }
  const meta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : {}
  const metaN = Number.parseInt(String(meta.recruitCount ?? ''), 10)
  if (Number.isFinite(metaN) && metaN > 0) return metaN
  const summary = [mp.merchantRequirements, mp.recruitmentInfo].filter(Boolean).join('\n')
  const m = String(summary).match(/招募人数[:：]\s*(\d+)/)
  if (m) return Math.max(1, Number.parseInt(m[1], 10) || 1)
  return Math.max(1, (mp.iceVideoSlots ?? []).length)
}

function resolveIceReferenceDownloadUrl(mp: RegistryMpRecruitmentOrder): string {
  const fromSlot = (mp.iceVideoSlots ?? []).find((s) => String(s.downloadUrl || '').trim())?.downloadUrl
  if (fromSlot?.trim()) return fromSlot.trim()
  const meta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : {}
  return String(meta.iceVideoUrl || meta.referenceUrl || meta.materialUrl || '').trim()
}

/** 云剪直派：按 recruitCount 补齐成片槽（同一下载链接可多人认领） */
export function ensureIceVideoSlots(mp: RegistryMpRecruitmentOrder): RegistryIceVideoSlot[] {
  const capacity = parseIceRecruitCapacity(mp)
  const existing = [...(mp.iceVideoSlots ?? [])]
  const downloadUrl = resolveIceReferenceDownloadUrl(mp)
  const template = existing[0]
  if (existing.length >= capacity) return existing
  while (existing.length < capacity) {
    const i = existing.length + 1
    existing.push({
      slotId: template && i === 1 ? template.slotId : `SLOT-${String(mp.id || 'ICE').replace(/\s/g, '')}-${i}`,
      label: `成片${i}`,
      downloadUrl: template?.downloadUrl?.trim() || downloadUrl,
      iceJobId: template?.iceJobId ?? '',
    })
  }
  return existing
}

export function buildIceVideoSlotsForRecruitCount(
  recruitCount: number,
  downloadUrl: string,
  idSeed: string,
): RegistryIceVideoSlot[] {
  const url = String(downloadUrl || '').trim()
  const n = Math.max(1, Number.parseInt(String(recruitCount), 10) || 1)
  const seed = String(idSeed || Date.now()).replace(/\s/g, '')
  return Array.from({ length: n }, (_, i) => ({
    slotId: i === 0 ? `SLOT-${seed}` : `SLOT-${seed}-${i + 1}`,
    label: `成片${i + 1}`,
    downloadUrl: url,
    iceJobId: '',
  }))
}

function countActiveIceApplicants(mp: RegistryMpRecruitmentOrder, excludeApplicantId?: string): number {
  return (mp.applicants ?? []).filter((a) => {
    if (excludeApplicantId && a.id === excludeApplicantId) return false
    if (a.taskStatus === 'rejected') return false
    if (a.taskStatus === 'confirmed' || a.taskStatus === 'pending_confirm' || a.taskStatus === 'applied') {
      return true
    }
    return !a.taskStatus && !!String(a.appliedAt || '').trim()
  }).length
}

export function iceSlotsFilledCount(mp: RegistryMpRecruitmentOrder): number {
  return (mp.iceVideoSlots ?? []).filter((s) => s.assignedApplicantId?.trim()).length
}

export function iceSlotsPassedCount(mp: RegistryMpRecruitmentOrder): number {
  const passedIds = new Set(
    (mp.applicants ?? [])
      .filter((a) => a.aiVerifyStatus === 'passed' || a.videoStatus === 'passed')
      .map((a) => a.id),
  )
  return (mp.iceVideoSlots ?? []).filter((s) => s.assignedApplicantId && passedIds.has(s.assignedApplicantId!))
    .length
}

function isIceRecruitFull(mp: RegistryMpRecruitmentOrder): boolean {
  const cap = parseIceRecruitCapacity(mp)
  return cap > 0 && countActiveIceApplicants(mp) >= cap
}

/** 云剪满额：大厅展示已停止，PR 发单仍履约中 */
export function maybeCloseIceWhenFull(mp: RegistryMpRecruitmentOrder): RegistryMpRecruitmentOrder {
  if (!isIceRecruitFull(mp)) return mp
  const raw = String(mp.status || 'open')
  if (raw === 'done' || raw === 'deleted' || raw === 'pending_settlement') return mp
  if (raw === 'open' || raw === 'collecting') {
    return {
      ...mp,
      status: 'closed',
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    }
  }
  return mp
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

/** 从分享口令/整段文案中提取抖音链接（同步，不做短链跳转） */
export function normalizeDouyinPublishInput(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  const share = extractDouyinShareFromText(t)
  if (share.url) return share.url
  if (share.videoId) return `https://www.douyin.com/video/${share.videoId}`
  if (isDouyinVideoUrl(t)) return t
  return null
}

/** 简易 AI 核查：链接形态 + 非空路径（可后续接真实模型） */
export function verifyDouyinPublishLink(raw: string): { passed: boolean; note: string; normalizedUrl?: string } {
  const normalized = normalizeDouyinPublishInput(raw)
  const url = normalized ?? raw.trim()
  if (!isDouyinVideoUrl(url)) {
    return {
      passed: false,
      note: '未识别到抖音作品链接，请粘贴抖音「分享」复制的整段文案（含链接）',
    }
  }
  if (url.length < 12) return { passed: false, note: '链接过短' }
  const note =
    normalized && normalized !== raw.trim() ? '已从分享口令识别链接' : '链接格式符合抖音作品页'
  return { passed: true, note, normalizedUrl: url }
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
    return app?.aiVerifyStatus === 'passed' || app?.videoStatus === 'passed'
  })
  if (allAssigned && allPassed && mp.status !== 'done' && mp.status !== 'closed') {
    const verifyMode = getIceVerifyMode(mp)
    return {
      ...mp,
      status: verifyMode === 'ai' ? 'done' : 'pending_settlement',
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    }
  }
  return mp
}

export type ClaimIceMpResult =
  | { ok: true; applicant: RegistryMpRecruitmentApplicant; needConfirm: true }
  | { ok: true; applicant: RegistryMpRecruitmentApplicant; needConfirm: false; slot: RegistryIceVideoSlot }
  | { ok: false; error: string; code?: string }

export type ConfirmIceMpResult =
  | { ok: true; applicant: RegistryMpRecruitmentApplicant; slot: RegistryIceVideoSlot; iceVideoSlots: RegistryIceVideoSlot[] }
  | { ok: false; error: string; code?: string }

/** 闭环第一步：认领任务，待达人确认接收（不立即分配成片） */
export function claimIceMpRecruitment(
  mp: RegistryMpRecruitmentOrder,
  applicant: RegistryMpRecruitmentApplicant,
): ClaimIceMpResult {
  const isEditTeam = isEditTeamIceMpOrder(mp as unknown as Record<string, unknown>)
  const slots = isEditTeam ? [] : ensureIceVideoSlots(mp)
  if (!isEditTeam && (!slots.length || !resolveIceReferenceDownloadUrl(mp))) {
    return { ok: false, error: '云剪任务未配置成片', code: 'no_slots' }
  }

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

  const capacity = isEditTeam ? 9999 : parseIceRecruitCapacity(mp)
  const occupied = countActiveIceApplicants(mp, applicant.id)
  if (occupied >= capacity) {
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

/** 闭环第二步：确认接收并分配成片槽位 */
export function confirmIceMpReceipt(
  mp: RegistryMpRecruitmentOrder,
  applicantId: string,
): ConfirmIceMpResult {
  const isEditTeam = isEditTeamIceMpOrder(mp as unknown as Record<string, unknown>)
  const slots = isEditTeam ? [...(mp.iceVideoSlots ?? [])] : ensureIceVideoSlots(mp)
  const applicants = [...(mp.applicants ?? [])]
  const idx = applicants.findIndex((a) => a.id === applicantId)
  if (idx < 0) return { ok: false, error: '未找到认领记录', code: 'not_found' }

  const app = applicants[idx]!
  if (app.taskStatus === 'rejected') return { ok: false, error: '任务已拒绝', code: 'rejected' }
  if (app.taskStatus === 'confirmed' && app.assignedIceSlotId) {
    const slot = slots.find((s) => s.slotId === app.assignedIceSlotId)
    if (slot) return { ok: true, applicant: app, slot, iceVideoSlots: slots }
  }
  if (app.taskStatus !== 'pending_confirm' && app.taskStatus !== 'applied' && !app.taskStatus) {
    return { ok: false, error: '当前状态不可确认接收', code: 'invalid_state' }
  }

  if (isEditTeam) {
    const row: RegistryMpRecruitmentApplicant = {
      ...app,
      taskStatus: 'confirmed',
      aiVerifyStatus: 'pending',
    }
    applicants[idx] = row
    return { ok: true, applicant: row, slot: slots[0] || { slotId: '', label: '', downloadUrl: '', iceJobId: '' }, iceVideoSlots: slots }
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
    return { ok: true, applicant: row, slot: existingSlot, iceVideoSlots: slots }
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
  return { ok: true, applicant: row, slot: slots[freeIdx]!, iceVideoSlots: slots }
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
  return { ok: true, applicant: claim.applicant, slot: claim.slot, iceVideoSlots: ensureIceVideoSlots(mp) }
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

export async function submitIceDouyinForApplicant(
  mp: RegistryMpRecruitmentOrder,
  applicantId: string,
  douyinPublishUrl: string,
  env: Record<string, string> = process.env as Record<string, string>,
): Promise<
  | { ok: true; mp: RegistryMpRecruitmentOrder; aiVerifyStatus: 'passed' | 'pending'; message?: string }
  | { ok: false; error: string }
> {
  const resolved = await resolveDouyinVideoPublishUrl(douyinPublishUrl)
  if (!resolved.ok) return { ok: false, error: resolved.error }
  const url = resolved.normalizedUrl
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

  const verifyMode = getIceVerifyMode(mp)
  const now = new Date().toLocaleString('zh-CN', { hour12: false })

  if (verifyMode === 'pr') {
    const prevCount = Math.max(0, Number(app.videoSubmitCount || 0))
    applicants[idx] = {
      ...app,
      douyinPublishUrl: url,
      videoUrl: url,
      videoStatus: 'pending',
      videoRejectReason: undefined,
      videoSubmittedAt: now,
      videoSubmitCount: prevCount + 1,
      aiVerifyStatus: 'pending',
      aiVerifyNote: '待 PR 审核链接',
    }
    let next: RegistryMpRecruitmentOrder = {
      ...mp,
      applicants,
      iceVideoSlots: slots,
      updatedAt: now,
    }
    return { ok: true, mp: next, aiVerifyStatus: 'pending', message: '链接已提交，请等待 PR 审核' }
  }

  const aiCheck = await verifyIceDouyinPublishWithAi(mp, douyinPublishUrl, env)
  if (!aiCheck.passed) return { ok: false, error: aiCheck.note }

  applicants[idx] = {
    ...app,
    douyinPublishUrl: url,
    videoUrl: url,
    aiVerifyStatus: 'passed',
    videoStatus: 'passed',
    aiVerifyNote: aiCheck.note,
    completedAt: now,
  }

  let next: RegistryMpRecruitmentOrder = {
    ...mp,
    applicants,
    iceVideoSlots: slots,
    updatedAt: now,
  }
  next = maybeAdvanceIceMpToSettlement(next)
  return { ok: true, mp: next, aiVerifyStatus: 'passed', message: aiCheck.note }
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

  if (!dup) {
    const identityDup = findDuplicateApplicant(mp.applicants, row, mp.platform || '抖音')
    if (identityDup) {
      return { ok: false, error: '您已报名该招募，请勿重复提交', code: 'already_applied' }
    }
  }

  const claim = claimIceMpRecruitment(mp, row)
  if (!claim.ok) return claim
  const applicants = upsertApplicant(mp.applicants, claim.applicant)
  let next: RegistryMpRecruitmentOrder = {
    ...mp,
    applicants,
    iceVideoSlots: ensureIceVideoSlots(mp),
    status: mp.status === 'open' ? 'collecting' : mp.status,
    updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  }
  next = maybeCloseIceWhenFull(next)
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
  let next: RegistryMpRecruitmentOrder = {
    ...mp,
    applicants,
    iceVideoSlots: result.iceVideoSlots,
    updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  }
  next = maybeCloseIceWhenFull(next)
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
