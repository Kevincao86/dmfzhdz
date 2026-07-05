/**
 * 定向邀约招募 — 核心业务（与公开招募并行，不改报名主链）
 */
import type {
  RegistryMpRecruitmentApplicant,
  RegistryMpRecruitmentOrder,
  RegistryMpTalentMember,
  RegistrySnapshot,
} from './opsRegistryTypes.js'
import { appendMpTalentInboxInSnapshot, type MpTalentInboxEntryInput } from './mpTalentInboxMutations.js'
import { notifyOrderMatchSubscribe } from './mpSubscribeMessageSend.js'
import { pruneApplicantIdRefsOnOrder } from './mpApplicantIdentity.js'

export type TargetedInviteStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'cancelled'

export type TargetedInviteRow = {
  id: string
  talentMemberId: string
  talentName: string
  platform?: string
  status: TargetedInviteStatus
  invitedAt: string
  respondedAt?: string
  rejectReason?: string
  applicantId?: string
}

export type TargetedRecruitMeta = {
  recruitScope?: 'open' | 'targeted'
  targetedStatus?: 'draft' | 'inviting' | 'fulfilling' | 'closed'
  inviteResponseHours?: number
  inviteDeadline?: string
  invitesSentAt?: string
  targetedInvites?: TargetedInviteRow[]
}

const DEFAULT_INVITE_HOURS = 72
const MAX_INVITES_PER_BATCH = 50

function nowStr(): string {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

export function readTargetedMeta(mp: RegistryMpRecruitmentOrder | null | undefined): TargetedRecruitMeta {
  const meta = mp?.mpPublishMeta
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {}
  const m = meta as Record<string, unknown>
  const invites = Array.isArray(m.targetedInvites) ? (m.targetedInvites as TargetedInviteRow[]) : []
  return {
    recruitScope: m.recruitScope === 'targeted' ? 'targeted' : 'open',
    targetedStatus:
      m.targetedStatus === 'draft' ||
      m.targetedStatus === 'inviting' ||
      m.targetedStatus === 'fulfilling' ||
      m.targetedStatus === 'closed'
        ? m.targetedStatus
        : undefined,
    inviteResponseHours: Number(m.inviteResponseHours) || DEFAULT_INVITE_HOURS,
    inviteDeadline: String(m.inviteDeadline || '').trim() || undefined,
    invitesSentAt: String(m.invitesSentAt || '').trim() || undefined,
    targetedInvites: invites,
  }
}

export function isTargetedRecruitOrder(mp: RegistryMpRecruitmentOrder | null | undefined): boolean {
  return readTargetedMeta(mp).recruitScope === 'targeted'
}

export function computeInviteDeadline(hours: number, fromMs = Date.now()): string {
  const h = Math.max(1, Math.min(720, Math.floor(Number(hours) || DEFAULT_INVITE_HOURS)))
  const d = new Date(fromMs + h * 3600000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}

export function isInviteExpired(invite: TargetedInviteRow, deadline?: string): boolean {
  if (invite.status !== 'pending') return false
  const dl = String(deadline || '').trim()
  if (!dl) return false
  const t = new Date(dl.replace(/-/g, '/')).getTime()
  return Number.isFinite(t) && Date.now() > t
}

export function expirePendingInvites(invites: TargetedInviteRow[], deadline?: string): TargetedInviteRow[] {
  return invites.map((inv) => {
    if (isInviteExpired(inv, deadline)) return { ...inv, status: 'expired', respondedAt: nowStr() }
    return inv
  })
}

function readPrWorkflow(mp: RegistryMpRecruitmentOrder): Record<string, unknown> {
  const meta = mp.mpPublishMeta
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {}
  const wf = (meta as Record<string, unknown>).prWorkflow
  return wf && typeof wf === 'object' && !Array.isArray(wf) ? (wf as Record<string, unknown>) : {}
}

function isInviteDeadlinePassed(deadline?: string): boolean {
  const dl = String(deadline || '').trim()
  if (!dl) return false
  const t = new Date(dl.replace(/-/g, '/')).getTime()
  return Number.isFinite(t) && Date.now() > t
}

function isTargetedInvitePhaseAlreadyFinalized(mp: RegistryMpRecruitmentOrder): boolean {
  const prevMeta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' && !Array.isArray(mp.mpPublishMeta)
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : {}
  const prevWf = readPrWorkflow(mp)
  if (String(prevWf.targetedInviteFinalizedAt || prevMeta.targetedInviteFinalizedAt || '').trim()) return true
  return String(prevWf.stage || '') === 'pending_schedule'
}

/** 邀约阶段结束且已有同意达人 → 写入待排期工作流 */
export function maybeFinalizeTargetedInvitePhaseInSnapshot(
  data: RegistrySnapshot,
  mpOrderId: string,
): { data: RegistrySnapshot; changed: boolean; finalized: boolean } {
  const idx = orderIdx(data, mpOrderId)
  if (idx < 0) return { data, changed: false, finalized: false }
  let mp = data.mpRecruitmentOrders![idx]!
  if (!isTargetedRecruitOrder(mp)) return { data, changed: false, finalized: false }
  if (isTargetedInvitePhaseAlreadyFinalized(mp)) return { data, changed: false, finalized: true }

  const meta = readTargetedMeta(mp)
  let invites = expirePendingInvites(meta.targetedInvites || [], meta.inviteDeadline)
  let changed = JSON.stringify(invites) !== JSON.stringify(meta.targetedInvites || [])
  const stats = targetedInviteStats(invites)

  if (!stats.invited || stats.accepted === 0) {
    if (changed) {
      mp = mergeMetaPatch(mp, { targetedInvites: invites })
      data.mpRecruitmentOrders![idx] = mp
    }
    return { data, changed, finalized: false }
  }

  const deadlinePassed = isInviteDeadlinePassed(meta.inviteDeadline)
  const shouldFinalize =
    (stats.pending === 0 && stats.accepted > 0) || (deadlinePassed && stats.accepted > 0)
  if (!shouldFinalize) {
    if (changed) {
      mp = mergeMetaPatch(mp, { targetedInvites: invites })
      data.mpRecruitmentOrders![idx] = mp
    }
    return { data, changed, finalized: false }
  }

  const acceptedApplicantIds = invites
    .filter((i) => i.status === 'accepted' && i.applicantId)
    .map((i) => String(i.applicantId))
  const notified = [...new Set([...(mp.notifiedApplicantIds || []).map(String), ...acceptedApplicantIds])]
  const now = nowStr()
  const prevWf = readPrWorkflow(mp)

  mp = mergeMetaPatch(mp, {
    targetedInvites: invites,
    targetedStatus: 'fulfilling',
    targetedInviteFinalizedAt: now,
    prWorkflow: {
      ...prevWf,
      stage: 'pending_schedule',
      scheduleQueueConfirmedAt: String(prevWf.scheduleQueueConfirmedAt || now),
      targetedInviteFinalizedAt: now,
    },
  })
  mp = { ...mp, notifiedApplicantIds: notified }
  data.mpRecruitmentOrders![idx] = mp
  return { data, changed: true, finalized: true }
}

export function targetedInviteStats(invites: TargetedInviteRow[]) {
  const list = invites || []
  return {
    invited: list.filter((i) => i.status !== 'cancelled').length,
    accepted: list.filter((i) => i.status === 'accepted').length,
    rejected: list.filter((i) => i.status === 'rejected').length,
    pending: list.filter((i) => i.status === 'pending').length,
    expired: list.filter((i) => i.status === 'expired').length,
    cancelled: list.filter((i) => i.status === 'cancelled').length,
  }
}

function primaryPlatformProfile(member: RegistryMpTalentMember, orderPlatform?: string) {
  const platform = String(orderPlatform || '抖音').trim()
  const profiles = member.platformProfiles
  if (profiles && typeof profiles === 'object') {
    const douyin = profiles.douyin
    const xhs = profiles.xiaohongshu
    if (platform.includes('红') && xhs) return { platform: '小红书', profile: xhs }
    if (douyin) return { platform: '抖音', profile: douyin }
    if (xhs) return { platform: '小红书', profile: xhs }
  }
  if (member.douyin) return { platform: '抖音', profile: member.douyin }
  if (member.xiaohongshu) return { platform: '小红书', profile: member.xiaohongshu }
  return { platform: platform || '抖音', profile: null }
}

function talentDisplayName(member: RegistryMpTalentMember): string {
  const { profile } = primaryPlatformProfile(member)
  const nick = profile && String(profile.platformNickname || '').trim()
  return nick || String(member.wxNickName || '').trim() || '达人'
}

function findTalentMember(data: RegistrySnapshot, memberId: string): RegistryMpTalentMember | null {
  const id = String(memberId || '').trim()
  if (!id) return null
  const members = Array.isArray(data.mpTalentMembers) ? data.mpTalentMembers : []
  return members.find((m) => m && String(m.id) === id) || null
}

function mergeMetaPatch(mp: RegistryMpRecruitmentOrder, patch: Record<string, unknown>): RegistryMpRecruitmentOrder {
  const prev =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' && !Array.isArray(mp.mpPublishMeta)
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : {}
  return {
    ...mp,
    updatedAt: nowStr(),
    mpPublishMeta: { ...prev, ...patch },
  }
}

function buildApplicantFromMember(
  member: RegistryMpTalentMember,
  mp: RegistryMpRecruitmentOrder,
  inviteId: string,
): RegistryMpRecruitmentApplicant {
  const { platform, profile } = primaryPlatformProfile(member, mp.platform)
  const p = profile || {}
  const nick = String(p.platformNickname || member.wxNickName || '').trim() || '达人'
  const applicantId = `app-targeted-${inviteId}`
  return {
    id: applicantId,
    name: nick,
    platform,
    platformAccount: String(p.platformAccount || '').trim(),
    platformNickname: nick,
    followers: Number(p.followers) || 0,
    douyinSalesLevel: String(p.douyinSalesLevel || '').trim() || undefined,
    contact: String(member.contact || '').trim(),
    wechatId: String(member.wechatId || '').trim(),
    alipayAccount: String(member.alipayAccount || '').trim(),
    mpOrderId: mp.id,
    merchantOrderNo: mp.sourceMerchantOrderId,
    wxOpenId: String(member.wxOpenId || '').trim() || undefined,
    appliedAt: nowStr(),
    province: member.province,
    city: member.city,
    gender: member.gender,
    accountTags: Array.isArray(member.accountTags) ? member.accountTags : [],
    prSelected: true,
    taskStatus: 'shortlisted',
  }
}

function inboxEntriesForInvites(
  mp: RegistryMpRecruitmentOrder,
  invites: TargetedInviteRow[],
  prName: string,
): MpTalentInboxEntryInput[] {
  const title = String(mp.title || mp.customerName || '定向招募').trim()
  return invites.map((inv) => ({
    talentMemberId: inv.talentMemberId,
    title: '定向合作邀约',
    body: `${prName || 'PR'} 邀请您参与「${title}」，请在有效期内确认是否接受。`,
    category: 'order',
    mpOrderId: mp.id,
    noticeType: 'general',
  }))
}

export type TargetedRecruitActionResult =
  | { ok: true; data: RegistrySnapshot; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; message?: string }

function orderIdx(data: RegistrySnapshot, mpOrderId: string): number {
  return (data.mpRecruitmentOrders ?? []).findIndex((o) => o && o.id === mpOrderId)
}

export function sendTargetedInvitesInSnapshot(
  data: RegistrySnapshot,
  mpOrderId: string,
  talentMemberIds: string[],
  opts?: { inviteResponseHours?: number },
): TargetedRecruitActionResult {
  const idx = orderIdx(data, mpOrderId)
  if (idx < 0) return { ok: false, status: 404, error: 'not_found', message: '招募单不存在' }
  let mp = data.mpRecruitmentOrders![idx]!
  if (!isTargetedRecruitOrder(mp)) {
    return { ok: false, status: 400, error: 'not_targeted', message: '非定向招募单' }
  }

  const ids = [...new Set((talentMemberIds || []).map((x) => String(x).trim()).filter(Boolean))].slice(
    0,
    MAX_INVITES_PER_BATCH,
  )
  if (!ids.length) return { ok: false, status: 400, error: 'empty_talents', message: '请选择至少一位达人' }

  const meta = readTargetedMeta(mp)
  let invites = expirePendingInvites(meta.targetedInvites || [], meta.inviteDeadline)
  const existingIds = new Set(invites.map((i) => i.talentMemberId))
  const newInvites: TargetedInviteRow[] = []
  const now = nowStr()

  for (const memberId of ids) {
    if (existingIds.has(memberId)) continue
    const member = findTalentMember(data, memberId)
    if (!member) continue
    const inv: TargetedInviteRow = {
      id: `tinv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      talentMemberId: memberId,
      talentName: talentDisplayName(member),
      platform: primaryPlatformProfile(member, mp.platform).platform,
      status: 'pending',
      invitedAt: now,
    }
    newInvites.push(inv)
    invites.push(inv)
  }

  if (!newInvites.length) {
    return { ok: false, status: 409, error: 'no_new_invites', message: '所选达人已在邀约名单中' }
  }

  const hours = opts?.inviteResponseHours || meta.inviteResponseHours || DEFAULT_INVITE_HOURS
  const inviteDeadline = meta.inviteDeadline || computeInviteDeadline(hours)
  const prName =
    String(
      (mp.mpPublishMeta as Record<string, unknown> | undefined)?.prDisplayName || mp.customerName || '',
    ).trim() || 'PR'

  const inboxRes = appendMpTalentInboxInSnapshot(data, inboxEntriesForInvites(mp, newInvites, prName))
  if (!inboxRes.ok) return { ok: false, status: inboxRes.status, error: inboxRes.error }

  const stats = targetedInviteStats(invites)
  const targetedStatus = stats.accepted > 0 ? 'fulfilling' : 'inviting'
  mp = mergeMetaPatch(mp, {
    recruitScope: 'targeted',
    targetedStatus,
    inviteResponseHours: hours,
    inviteDeadline,
    invitesSentAt: meta.invitesSentAt || now,
    targetedInvites: invites,
  })
  data.mpRecruitmentOrders![idx] = mp

  return {
    ok: true,
    data,
    body: {
      ok: true,
      added: newInvites.length,
      stats,
      inviteDeadline,
      newInvites,
    },
  }
}

export async function pushSubscribeForTargetedInvites(
  data: RegistrySnapshot,
  mp: RegistryMpRecruitmentOrder,
  newInvites: TargetedInviteRow[],
): Promise<{ sent: number; failed: string[] }> {
  let sent = 0
  const failed: string[] = []
  for (const inv of newInvites) {
    const member = findTalentMember(data, inv.talentMemberId)
    const openId = String(member?.wxOpenId || '').trim()
    if (!openId) continue
    try {
      await notifyOrderMatchSubscribe(mp, openId)
      sent += 1
    } catch (e) {
      failed.push(e instanceof Error ? e.message : String(e))
    }
  }
  return { sent, failed }
}

export function respondTargetedInviteInSnapshot(
  data: RegistrySnapshot,
  mpOrderId: string,
  talentMemberId: string,
  action: 'accept' | 'reject',
  rejectReason?: string,
): TargetedRecruitActionResult {
  const idx = orderIdx(data, mpOrderId)
  if (idx < 0) return { ok: false, status: 404, error: 'not_found', message: '招募单不存在' }
  let mp = data.mpRecruitmentOrders![idx]!
  if (!isTargetedRecruitOrder(mp)) {
    return { ok: false, status: 400, error: 'not_targeted', message: '非定向招募单' }
  }

  const memberId = String(talentMemberId || '').trim()
  const meta = readTargetedMeta(mp)
  let invites = expirePendingInvites(meta.targetedInvites || [], meta.inviteDeadline)
  const invIdx = invites.findIndex((i) => i.talentMemberId === memberId)
  if (invIdx < 0) {
    return { ok: false, status: 403, error: 'not_invited', message: '您不在该单的邀约名单中' }
  }

  const inv = invites[invIdx]!
  if (inv.status !== 'pending') {
    return { ok: false, status: 409, error: 'already_responded', message: '您已处理过该邀约' }
  }
  if (isInviteExpired(inv, meta.inviteDeadline)) {
    invites[invIdx] = { ...inv, status: 'expired', respondedAt: nowStr() }
    mp = mergeMetaPatch(mp, { targetedInvites: invites })
    data.mpRecruitmentOrders![idx] = mp
    return { ok: false, status: 410, error: 'invite_expired', message: '邀约已过期' }
  }

  const now = nowStr()
  let applicants = Array.isArray(mp.applicants) ? [...mp.applicants] : []
  let selectedIds = Array.isArray(mp.selectedApplicantIds) ? [...mp.selectedApplicantIds] : []

  if (action === 'reject') {
    invites[invIdx] = {
      ...inv,
      status: 'rejected',
      respondedAt: now,
      rejectReason: String(rejectReason || '').trim().slice(0, 200) || undefined,
    }
  } else {
    const member = findTalentMember(data, memberId)
    if (!member) return { ok: false, status: 404, error: 'talent_not_found', message: '达人资料不存在' }
    const applicant = buildApplicantFromMember(member, mp, inv.id)
    const existAppIdx = applicants.findIndex((a) => a && String(a.id) === applicant.id)
    if (existAppIdx >= 0) applicants[existAppIdx] = applicant
    else applicants.push(applicant)
    if (!selectedIds.includes(applicant.id)) selectedIds.push(applicant.id)
    invites[invIdx] = {
      ...inv,
      status: 'accepted',
      respondedAt: now,
      applicantId: applicant.id,
    }
  }

  const stats = targetedInviteStats(invites)
  const targetedStatus = stats.accepted > 0 ? 'fulfilling' : stats.pending > 0 ? 'inviting' : 'inviting'

  mp = {
    ...mergeMetaPatch(mp, {
      targetedInvites: invites,
      targetedStatus,
    }),
    applicants,
    selectedApplicantIds: selectedIds,
  }
  data.mpRecruitmentOrders![idx] = mp

  return {
    ok: true,
    data,
    body: {
      ok: true,
      action,
      stats,
      invite: invites[invIdx],
    },
  }
}

export function cancelTargetedInviteInSnapshot(
  data: RegistrySnapshot,
  mpOrderId: string,
  inviteId: string,
): TargetedRecruitActionResult {
  const idx = orderIdx(data, mpOrderId)
  if (idx < 0) return { ok: false, status: 404, error: 'not_found', message: '招募单不存在' }
  let mp = data.mpRecruitmentOrders![idx]!
  if (!isTargetedRecruitOrder(mp)) {
    return { ok: false, status: 400, error: 'not_targeted', message: '非定向招募单' }
  }

  const iid = String(inviteId || '').trim()
  const meta = readTargetedMeta(mp)
  const invites = [...(meta.targetedInvites || [])]
  const invIdx = invites.findIndex((i) => i.id === iid)
  if (invIdx < 0) return { ok: false, status: 404, error: 'invite_not_found', message: '邀约记录不存在' }

  const inv = invites[invIdx]!
  if (inv.status === 'cancelled') {
    return { ok: false, status: 409, error: 'already_cancelled', message: '已取消' }
  }

  invites[invIdx] = { ...inv, status: 'cancelled', respondedAt: nowStr() }

  let applicants = Array.isArray(mp.applicants) ? [...mp.applicants] : []
  let selectedIds = Array.isArray(mp.selectedApplicantIds) ? [...mp.selectedApplicantIds] : []

  if (inv.status === 'accepted' && inv.applicantId) {
    const aid = String(inv.applicantId)
    applicants = applicants.filter((a) => !a || String(a.id) !== aid)
    mp = pruneApplicantIdRefsOnOrder({ ...mp, applicants }, { removedIds: [aid] })
    applicants = Array.isArray(mp.applicants) ? [...mp.applicants] : applicants
    selectedIds = Array.isArray(mp.selectedApplicantIds) ? [...mp.selectedApplicantIds] : []
  }

  const stats = targetedInviteStats(invites)
  mp = {
    ...mergeMetaPatch(mp, {
      targetedInvites: invites,
      targetedStatus: stats.accepted > 0 ? 'fulfilling' : stats.pending > 0 ? 'inviting' : 'inviting',
    }),
    applicants,
    selectedApplicantIds: selectedIds,
  }
  data.mpRecruitmentOrders![idx] = mp

  return { ok: true, data, body: { ok: true, stats, invite: invites[invIdx] } }
}

export function listTargetedInvitesForTalent(
  data: RegistrySnapshot,
  talentMemberId: string,
): TargetedInviteRow[] {
  const memberId = String(talentMemberId || '').trim()
  if (!memberId) return []
  const orders = Array.isArray(data.mpRecruitmentOrders) ? data.mpRecruitmentOrders : []
  const out: (TargetedInviteRow & { mpOrderId: string; orderTitle: string })[] = []
  for (const mp of orders) {
    if (!mp || !isTargetedRecruitOrder(mp)) continue
    const meta = readTargetedMeta(mp)
    const invites = expirePendingInvites(meta.targetedInvites || [], meta.inviteDeadline)
    for (const inv of invites) {
      if (inv.talentMemberId !== memberId) continue
      if (inv.status === 'cancelled') continue
      out.push({
        ...inv,
        mpOrderId: mp.id,
        orderTitle: String(mp.title || mp.customerName || '定向招募').trim(),
      })
    }
  }
  out.sort((a, b) => String(b.invitedAt).localeCompare(String(a.invitedAt)))
  return out
}

export function talentCanViewTargetedOrder(
  mp: RegistryMpRecruitmentOrder,
  talentMemberId: string,
): boolean {
  if (!isTargetedRecruitOrder(mp)) return true
  const memberId = String(talentMemberId || '').trim()
  if (!memberId) return false
  const meta = readTargetedMeta(mp)
  return (meta.targetedInvites || []).some(
    (i) =>
      i.talentMemberId === memberId &&
      (i.status === 'pending' || i.status === 'accepted' || i.status === 'rejected'),
  )
}
