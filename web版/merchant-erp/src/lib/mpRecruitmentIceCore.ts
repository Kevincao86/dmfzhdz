import type {
  RegistryFile,
  RegistryIceVideoSlot,
  RegistryMpRecruitmentApplicant,
  RegistryMpRecruitmentOrder,
} from './opsRegistryTypes.js'
import { extractDouyinShareFromText, resolveDouyinVideoPublishUrl } from './digitalHumanDouyinLinkCore.js'
import { getIceVerifyMode, isEditTeamIceMpOrder, isPackSlotIceOrder } from './iceOrderDetect.js'
import { verifyIceDouyinPublishWithAi } from './iceDouyinAiVerifyCore.js'
import { findDuplicateApplicant, applicantsSamePerson } from './mpApplicantIdentity.js'

export { isIceMpOrder, getIceVerifyMode, iceVerifyModeLabel, isEditTeamIceMpOrder, isPackSlotIceOrder, getEditGroupQrFromMp, getTalentGroupQrFromMp } from './iceOrderDetect.js'
export type { IceVerifyMode } from './iceOrderDetect.js'

export function parseIceRecruitCapacity(mp: RegistryMpRecruitmentOrder): number {
  if (isPackSlotIceOrder(mp as unknown as Record<string, unknown>)) {
    return Math.max(1, (mp.iceVideoSlots ?? []).length)
  }
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

export function countFreeEditPackSlots(mp: RegistryMpRecruitmentOrder): number {
  const cap = parseIceRecruitCapacity(mp)
  if (!isPackSlotIceOrder(mp as unknown as Record<string, unknown>)) {
    return Math.max(0, cap - countActiveIceApplicants(mp))
  }
  return Math.max(0, cap - countEditPackClaimedSlots(mp))
}

function countEditIceReservedSlots(mp: RegistryMpRecruitmentOrder): number {
  let reserved = 0
  for (const a of mp.applicants ?? []) {
    if (!a || a.taskStatus === 'rejected') continue
    const ts = String(a.taskStatus || '')
    const assignedN = a.assignedIceSlotIds?.length ?? 0
    if (assignedN > 0 || ts === 'confirmed') continue
    if ((ts === 'pending_confirm' || ts === 'applied' || !ts) && String(a.appliedAt || '').trim()) {
      reserved += Math.max(1, Number.parseInt(String(a.claimedSlotCount ?? 1), 10) || 1)
    }
  }
  return reserved
}

function countEditPackClaimedSlots(mp: RegistryMpRecruitmentOrder): number {
  const assigned = (mp.iceVideoSlots ?? []).filter((s) => String(s.assignedApplicantId || '').trim()).length
  return assigned + countEditIceReservedSlots(mp)
}

export function isVideoDeliverUrl(raw: string): boolean {
  return /^https?:\/\/.+/i.test(String(raw || '').trim())
}

/** 从批量粘贴文本中识别 https 链接（去重保序） */
export function parseBatchDeliverUrls(raw: string | string[]): string[] {
  const parts = Array.isArray(raw)
    ? raw
    : String(raw || '')
        .split(/[\n\r,，;；|\t]+/)
        .flatMap((line) => line.split(/\s+/))
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of parts) {
    const t = String(p || '').trim()
    if (!isVideoDeliverUrl(t)) continue
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

export function verifyVideoDeliverLink(raw: string): { passed: boolean; note: string; normalizedUrl?: string } {
  const url = String(raw || '').trim()
  if (!isVideoDeliverUrl(url)) {
    return { passed: false, note: '请填写有效的 https 成片链接' }
  }
  if (url.length < 12) return { passed: false, note: '链接过短' }
  return { passed: true, note: '链接格式有效', normalizedUrl: url }
}

function isEditPackFull(mp: RegistryMpRecruitmentOrder): boolean {
  const cap = parseIceRecruitCapacity(mp)
  if (cap <= 0) return false
  return countEditPackClaimedSlots(mp) >= cap
}

function allEditPackSlotsReviewed(mp: RegistryMpRecruitmentOrder): boolean {
  const slots = mp.iceVideoSlots ?? []
  if (!slots.length) return false
  if (!isEditPackFull(mp)) return false
  return slots.every((s) => s.deliverStatus === 'passed')
}

function markEditSlotsPassedForApplicant(
  mp: RegistryMpRecruitmentOrder,
  applicantId: string,
): RegistryIceVideoSlot[] {
  const aid = String(applicantId || '').trim()
  return (mp.iceVideoSlots ?? []).map((s) => {
    if (String(s.assignedApplicantId || '').trim() !== aid) return s
    return { ...s, deliverStatus: 'passed' as const }
  })
}

function releaseEditSlotsForApplicant(
  slots: RegistryIceVideoSlot[],
  applicantId: string,
): RegistryIceVideoSlot[] {
  const aid = String(applicantId || '').trim()
  return slots.map((s) => {
    if (String(s.assignedApplicantId || '').trim() !== aid) return s
    return {
      ...s,
      assignedApplicantId: undefined,
      assignedAt: undefined,
      deliverUrl: undefined,
      deliverStatus: undefined,
    }
  })
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
  const isPack = isPackSlotIceOrder(mp as unknown as Record<string, unknown>)
  const cap = parseIceRecruitCapacity(mp)
  if (cap <= 0) return false
  if (isPack) return countEditPackClaimedSlots(mp) >= cap
  return countActiveIceApplicants(mp) >= cap
}

/** 云剪满额：大厅展示已停止，PR 发单仍履约中 */
export function maybeCloseIceWhenFull(mp: RegistryMpRecruitmentOrder): RegistryMpRecruitmentOrder {
  const isPack = isPackSlotIceOrder(mp as unknown as Record<string, unknown>)
  const full = isPack ? isEditPackFull(mp) : isIceRecruitFull(mp)
  if (!full) return mp
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
  const isPack = isPackSlotIceOrder(mp as unknown as Record<string, unknown>)
  const slots = mp.iceVideoSlots ?? []
  if (!slots.length) return mp

  if (isPack) {
    if (!allEditPackSlotsReviewed(mp)) return mp
    if (mp.status === 'done' || mp.status === 'closed') return mp
    const verifyMode = getIceVerifyMode(mp)
    return {
      ...mp,
      status: verifyMode === 'ai' ? 'done' : 'pending_settlement',
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    }
  }

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

/** 闭环第一步：认领任务，待确认接收（剪辑师可指定认领条数） */
export function claimIceMpRecruitment(
  mp: RegistryMpRecruitmentOrder,
  applicant: RegistryMpRecruitmentApplicant,
  claimSlotCount?: number,
): ClaimIceMpResult {
  const isPack = isPackSlotIceOrder(mp as unknown as Record<string, unknown>)
  const packSlots = [...(mp.iceVideoSlots ?? [])]
  const slots = isPack ? packSlots : ensureIceVideoSlots(mp)
  if (isPack) {
    if (!packSlots.length) return { ok: false, error: '任务未配置成片位', code: 'no_slots' }
  } else if (!slots.length || !resolveIceReferenceDownloadUrl(mp)) {
    return { ok: false, error: '云剪任务未配置成片', code: 'no_slots' }
  }

  const existing = (mp.applicants ?? []).find((a) => a.id === applicant.id)
  if (existing) {
    if (existing.taskStatus === 'confirmed' && (existing.assignedIceSlotIds?.length || existing.assignedIceSlotId)) {
      const slotId = existing.assignedIceSlotIds?.[0] || existing.assignedIceSlotId
      const slot = slots.find((s) => s.slotId === slotId)
      if (slot) {
        return { ok: true, applicant: existing, needConfirm: false, slot }
      }
    }
    if (existing.taskStatus === 'pending_confirm' || !existing.taskStatus) {
      return { ok: true, applicant: existing, needConfirm: true }
    }
  }

  if (isPack) {
    const n = Math.max(1, Number.parseInt(String(claimSlotCount ?? applicant.claimedSlotCount ?? 1), 10) || 1)
    const free = countFreeEditPackSlots(mp)
    if (n > free) {
      return { ok: false, error: `剩余可认领 ${free} 条，无法认领 ${n} 条`, code: 'slots_insufficient' }
    }
    const now = new Date().toLocaleString('zh-CN', { hour12: false })
    const row: RegistryMpRecruitmentApplicant = {
      ...applicant,
      taskStatus: 'pending_confirm',
      claimedSlotCount: n,
      assignedIceSlotId: undefined,
      assignedIceSlotIds: undefined,
      assignedVideoDownloadUrl: undefined,
      assignedVideoLabel: undefined,
      editDeliverLinks: undefined,
      videoStatus: undefined,
      videoRejectReason: undefined,
      aiVerifyStatus: 'pending',
      appliedAt: applicant.appliedAt || now,
    }
    return { ok: true, applicant: row, needConfirm: true }
  }

  const capacity = parseIceRecruitCapacity(mp)
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

function dropRejectedIdentityPeers(
  applicants: RegistryMpRecruitmentApplicant[] | undefined,
  incoming: RegistryMpRecruitmentApplicant,
  platform: string,
): RegistryMpRecruitmentApplicant[] {
  return (applicants ?? []).filter(
    (a) => !(a?.taskStatus === 'rejected' && applicantsSamePerson(a, incoming, platform)),
  )
}

/** 闭环第二步：确认接收并分配成片槽位 */
export function confirmIceMpReceipt(
  mp: RegistryMpRecruitmentOrder,
  applicantId: string,
): ConfirmIceMpResult {
  const isPack = isPackSlotIceOrder(mp as unknown as Record<string, unknown>)
  const slots = isPack ? [...(mp.iceVideoSlots ?? [])] : ensureIceVideoSlots(mp)
  const applicants = [...(mp.applicants ?? [])]
  const idx = applicants.findIndex((a) => a.id === applicantId)
  if (idx < 0) return { ok: false, error: '未找到认领记录', code: 'not_found' }

  const app = applicants[idx]!
  if (app.taskStatus === 'rejected') return { ok: false, error: '任务已拒绝', code: 'rejected' }
  if (app.taskStatus === 'confirmed' && (app.assignedIceSlotIds?.length || app.assignedIceSlotId)) {
    const slotId = app.assignedIceSlotIds?.[0] || app.assignedIceSlotId
    const slot = slots.find((s) => s.slotId === slotId)
    if (slot) return { ok: true, applicant: app, slot, iceVideoSlots: slots }
  }
  if (app.taskStatus !== 'pending_confirm' && app.taskStatus !== 'applied' && !app.taskStatus) {
    return { ok: false, error: '当前状态不可确认接收', code: 'invalid_state' }
  }

  if (isPack) {
    const n = Math.max(1, Number.parseInt(String(app.claimedSlotCount ?? 1), 10) || 1)
    const freeCount = slots.filter((s) => !String(s.assignedApplicantId || '').trim()).length
    if (freeCount < n) return { ok: false, error: `剩余名额不足，仅剩 ${freeCount} 条`, code: 'slots_full' }
    const now = new Date().toLocaleString('zh-CN', { hour12: false })
    const assignedIds: string[] = []
    for (let i = 0; i < n; i++) {
      const si = slots.findIndex((s) => !String(s.assignedApplicantId || '').trim())
      if (si < 0) break
      const slot = slots[si]!
      slots[si] = { ...slot, assignedApplicantId: applicantId, assignedAt: now }
      assignedIds.push(slot.slotId)
    }
    const row: RegistryMpRecruitmentApplicant = {
      ...app,
      taskStatus: 'confirmed',
      claimedSlotCount: assignedIds.length,
      assignedIceSlotIds: assignedIds,
      assignedIceSlotId: assignedIds[0],
      aiVerifyStatus: 'pending',
    }
    applicants[idx] = row
    const firstSlot = slots.find((s) => s.slotId === assignedIds[0]) || slots[0] || { slotId: '', label: '', downloadUrl: '', iceJobId: '' }
    return { ok: true, applicant: row, slot: firstSlot, iceVideoSlots: slots }
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
  const slotIds = app.assignedIceSlotIds?.length
    ? app.assignedIceSlotIds
    : app.assignedIceSlotId
      ? [app.assignedIceSlotId]
      : []
  for (const sid of slotIds) {
    const si = slots.findIndex((s) => s.slotId === sid)
    if (si >= 0) {
      slots[si] = {
        ...slots[si]!,
        assignedApplicantId: undefined,
        assignedAt: undefined,
        deliverUrl: undefined,
        deliverStatus: undefined,
      }
    }
  }
  if (!slotIds.length && app.assignedIceSlotId) {
    slots = releaseEditSlotsForApplicant(slots, applicantId)
  }

  applicants[idx] = {
    ...app,
    taskStatus: 'rejected',
    assignedIceSlotId: undefined,
    assignedIceSlotIds: undefined,
    claimedSlotCount: undefined,
    editDeliverLinks: undefined,
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

export function syncEditSlotReviewFromApplicant(
  mp: RegistryMpRecruitmentOrder,
  applicantId: string,
  action: 'pass' | 'reject',
): RegistryMpRecruitmentOrder {
  if (!isEditTeamIceMpOrder(mp as unknown as Record<string, unknown>)) return mp
  let next = { ...mp, iceVideoSlots: [...(mp.iceVideoSlots ?? [])] }
  if (action === 'pass') {
    next.iceVideoSlots = markEditSlotsPassedForApplicant(next, applicantId)
  } else {
    next.iceVideoSlots = (next.iceVideoSlots ?? []).map((s) => {
      if (String(s.assignedApplicantId || '').trim() !== String(applicantId || '').trim()) return s
      return { ...s, deliverStatus: 'rejected' as const }
    })
  }
  return maybeAdvanceIceMpToSettlement(next)
}

/** 剪辑师批量回传成片链接（条数须等于认领条数） */
export async function submitEditTeamDeliverLinks(
  mp: RegistryMpRecruitmentOrder,
  applicantId: string,
  rawLinks: string | string[],
  env: Record<string, string> = process.env as Record<string, string>,
): Promise<
  | { ok: true; mp: RegistryMpRecruitmentOrder; aiVerifyStatus: 'passed' | 'pending'; message?: string }
  | { ok: false; error: string }
> {
  if (!isEditTeamIceMpOrder(mp as unknown as Record<string, unknown>)) {
    return { ok: false, error: '非剪辑云剪任务' }
  }
  const applicants = [...(mp.applicants ?? [])]
  const idx = applicants.findIndex((a) => a.id === applicantId)
  if (idx < 0) return { ok: false, error: '未找到认领记录' }
  const app = applicants[idx]!
  if (app.taskStatus !== 'confirmed') {
    return { ok: false, error: '请先确认认领后再回传成片' }
  }
  const need = Math.max(1, Number.parseInt(String(app.claimedSlotCount ?? app.assignedIceSlotIds?.length ?? 1), 10) || 1)
  const links = parseBatchDeliverUrls(rawLinks)
  if (links.length < need) {
    return { ok: false, error: `还需 ${need - links.length} 条链接，当前 ${links.length}/${need}` }
  }
  if (links.length > need) {
    return { ok: false, error: `链接数 ${links.length} 超过认领条数 ${need}，请只提交 ${need} 条` }
  }
  const slotIds = app.assignedIceSlotIds?.length
    ? app.assignedIceSlotIds
    : app.assignedIceSlotId
      ? [app.assignedIceSlotId]
      : []
  if (slotIds.length < need) {
    return { ok: false, error: '成片位未正确分配，请联系 PR' }
  }

  const verifyMode = getIceVerifyMode(mp)
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  let slots = [...(mp.iceVideoSlots ?? [])]

  for (let i = 0; i < need; i++) {
    const verify = verifyVideoDeliverLink(links[i]!)
    if (!verify.passed) return { ok: false, error: `第 ${i + 1} 条：${verify.note}` }
  }

  if (verifyMode === 'pr') {
    for (let i = 0; i < need; i++) {
      const sid = slotIds[i]!
      const si = slots.findIndex((s) => s.slotId === sid)
      if (si < 0) continue
      slots[si] = {
        ...slots[si]!,
        deliverUrl: links[i],
        downloadUrl: links[i]!,
        deliverStatus: 'pending',
      }
    }
    applicants[idx] = {
      ...app,
      editDeliverLinks: links,
      videoUrl: links[0],
      videoStatus: 'pending',
      videoRejectReason: undefined,
      videoSubmittedAt: now,
      videoSubmitCount: Math.max(0, Number(app.videoSubmitCount || 0)) + 1,
      aiVerifyStatus: 'pending',
      aiVerifyNote: '待 PR 审核成片',
    }
    return {
      ok: true,
      mp: { ...mp, applicants, iceVideoSlots: slots, updatedAt: now },
      aiVerifyStatus: 'pending',
      message: '成片已提交，请等待 PR 审核',
    }
  }

  for (let i = 0; i < need; i++) {
    const sid = slotIds[i]!
    const si = slots.findIndex((s) => s.slotId === sid)
    if (si < 0) continue
    slots[si] = {
      ...slots[si]!,
      deliverUrl: links[i],
      downloadUrl: links[i]!,
      deliverStatus: 'passed',
    }
  }
  applicants[idx] = {
    ...app,
    editDeliverLinks: links,
    videoUrl: links[0],
    videoStatus: 'passed',
    aiVerifyStatus: 'passed',
    aiVerifyNote: 'AI 已核查链接格式',
    completedAt: now,
  }
  let next: RegistryMpRecruitmentOrder = { ...mp, applicants, iceVideoSlots: slots, updatedAt: now }
  next = maybeAdvanceIceMpToSettlement(next)
  return { ok: true, mp: next, aiVerifyStatus: 'passed', message: 'AI 核查通过，已提交' }
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
  claimSlotCount?: number,
):
  | { ok: true; mp: RegistryMpRecruitmentOrder; body: Record<string, unknown> }
  | { ok: false; error: string; code?: string } {
  const isPack = isPackSlotIceOrder(mp as unknown as Record<string, unknown>)
  let dup = (mp.applicants ?? []).find((a) => a.id === row.id)
  if (dup?.taskStatus === 'confirmed' && (dup.assignedIceSlotIds?.length || dup.assignedVideoDownloadUrl)) {
    return {
      ok: true,
      mp,
      body: {
        ok: true,
        needConfirm: false,
        taskStatus: 'confirmed',
        claimedSlotCount: dup.claimedSlotCount,
        assignedVideoDownloadUrl: dup.assignedVideoDownloadUrl,
      },
    }
  }
  if (dup?.taskStatus === 'pending_confirm') {
    if (isPack && claimSlotCount != null) {
      const n = Math.max(1, Number.parseInt(String(claimSlotCount), 10) || 1)
      const prev = Math.max(1, Number.parseInt(String(dup.claimedSlotCount ?? 1), 10) || 1)
      if (n !== prev) {
        const free = countFreeEditPackSlots(mp) + prev
        if (n > free) {
          return {
            ok: false,
            error: `剩余可认领 ${Math.max(0, free - prev)} 条，无法认领 ${n} 条`,
            code: 'slots_insufficient',
          }
        }
        const updated: RegistryMpRecruitmentApplicant = { ...dup, claimedSlotCount: n }
        const applicants = upsertApplicant(mp.applicants, updated)
        const next: RegistryMpRecruitmentOrder = {
          ...mp,
          applicants,
          updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
        }
        return {
          ok: true,
          mp: next,
          body: { ok: true, needConfirm: true, taskStatus: 'pending_confirm', claimedSlotCount: n },
        }
      }
    }
    return {
      ok: true,
      mp,
      body: {
        ok: true,
        needConfirm: true,
        taskStatus: 'pending_confirm',
        claimedSlotCount: dup.claimedSlotCount,
      },
    }
  }
  if (dup?.taskStatus === 'rejected') {
    dup = undefined
  }

  if (!dup) {
    const identityDup = findDuplicateApplicant(mp.applicants, row, mp.platform || '抖音')
    if (identityDup) {
      return { ok: false, error: '您已报名该招募，请勿重复提交', code: 'already_applied' }
    }
  }

  const platform = mp.platform || '抖音'
  const cleanedApplicants = dropRejectedIdentityPeers(mp.applicants, row, platform)
  const claim = claimIceMpRecruitment(
    { ...mp, applicants: cleanedApplicants },
    row,
    claimSlotCount ?? row.claimedSlotCount,
  )
  if (!claim.ok) return claim
  const applicants = upsertApplicant(cleanedApplicants, claim.applicant)
  let next: RegistryMpRecruitmentOrder = {
    ...mp,
    applicants,
    iceVideoSlots: isPack ? [...(mp.iceVideoSlots ?? [])] : ensureIceVideoSlots(mp),
    status: mp.status === 'open' ? 'collecting' : mp.status,
    updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  }
  next = maybeCloseIceWhenFull(next)
  return {
    ok: true,
    mp: next,
    body: {
      ok: true,
      needConfirm: true,
      taskStatus: 'pending_confirm',
      claimedSlotCount: claim.applicant.claimedSlotCount,
    },
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
