/**
 * 商单群聊（小程序内群，非微信外部群）
 * 订单完成后 7 天自动关闭
 */
import type {
  RegistryMpRecruitmentApplicant,
  RegistryMpRecruitmentOrder,
  RegistryMpTalentMember,
  RegistrySnapshot,
} from './opsRegistryTypes.js'
import { appendMpTalentInboxInSnapshot, type MpTalentInboxEntryInput } from './mpTalentInboxMutations.js'
import { readPrWorkflowMeta } from './mpRecruitmentPrWorkflowCore.js'

export type OrderGroupChatMessageType = 'text' | 'image' | 'video'

export type OrderGroupChatMessage = {
  id: string
  fromParticipantKey: string
  fromName: string
  type: OrderGroupChatMessageType
  text?: string
  mediaUrl?: string
  ts: number
}

export type RegistryMpOrderGroupChat = {
  id: string
  mpOrderId: string
  title: string
  createdAt: string
  status: 'active' | 'closed'
  closedAt?: string
  closeReason?: string
  memberParticipantKeys: string[]
  memberNames: Record<string, string>
  messages: OrderGroupChatMessage[]
  lastMessageAt?: string
}

const MAX_MESSAGES = 400
const AUTO_CLOSE_DAYS = 7

function nowStr(): string {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatGroupTitle(orderTitle: string, atMs = Date.now()): string {
  const d = new Date(atMs)
  const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  const title = String(orderTitle || '商单').trim().slice(0, 40)
  return `${title}·${date}`
}

function orderDoneAt(mp: RegistryMpRecruitmentOrder): number | null {
  if (String(mp.status) !== 'done') return null
  const wf = readPrWorkflowMeta(mp)
  const raw = String(wf.completedAt || mp.updatedAt || '').trim()
  if (!raw) return Date.now()
  const t = new Date(raw.replace(/-/g, '/')).getTime()
  return Number.isFinite(t) ? t : Date.now()
}

export function shouldAutoCloseGroupChat(mp: RegistryMpRecruitmentOrder, group: RegistryMpOrderGroupChat): boolean {
  if (group.status === 'closed') return false
  const doneMs = orderDoneAt(mp)
  if (!doneMs) return false
  return Date.now() >= doneMs + AUTO_CLOSE_DAYS * 24 * 3600000
}

function findMemberByContact(data: RegistrySnapshot, contact: string): RegistryMpTalentMember | null {
  const c = String(contact || '').trim()
  if (!c) return null
  const members = Array.isArray(data.mpTalentMembers) ? data.mpTalentMembers : []
  return members.find((m) => m && String(m.contact || '').trim() === c) || null
}

function talentParticipantKey(memberId: string): string {
  return `talent_${String(memberId || '').trim()}`
}

function resolveApplicantParticipantKey(
  data: RegistrySnapshot,
  applicant: RegistryMpRecruitmentApplicant,
): string | null {
  const members = Array.isArray(data.mpTalentMembers) ? data.mpTalentMembers : []
  const contact = String(applicant.contact || '').trim()
  if (contact) {
    const hit = findMemberByContact(data, contact)
    if (hit?.id) return talentParticipantKey(hit.id)
  }
  for (const m of members) {
    if (!m?.id) continue
    const profs = m.platformProfiles && typeof m.platformProfiles === 'object' ? m.platformProfiles : {}
    for (const p of Object.values(profs)) {
      const prof = p as { platformAccount?: string; platformNickname?: string }
      if (
        applicant.platformAccount &&
        String(prof.platformAccount || '').trim() === String(applicant.platformAccount).trim()
      ) {
        return talentParticipantKey(m.id)
      }
      if (
        applicant.platformNickname &&
        String(prof.platformNickname || '').trim() === String(applicant.platformNickname).trim()
      ) {
        return talentParticipantKey(m.id)
      }
    }
  }
  return null
}

function prParticipantKeyFromOrder(mp: RegistryMpRecruitmentOrder): string {
  const meta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : {}
  return String(meta.prParticipantKey || '').trim()
}

function selectedApplicants(mp: RegistryMpRecruitmentOrder): RegistryMpRecruitmentApplicant[] {
  const ids = new Set((mp.selectedApplicantIds || []).map(String))
  const list = Array.isArray(mp.applicants) ? mp.applicants : []
  return list.filter(
    (a) =>
      a &&
      (a.prSelected || a.merchantSelected || ids.has(String(a.id))) &&
      a.taskStatus !== 'rejected',
  )
}

function listGroups(data: RegistrySnapshot): RegistryMpOrderGroupChat[] {
  const raw = (data as RegistrySnapshot & { mpOrderGroupChats?: RegistryMpOrderGroupChat[] }).mpOrderGroupChats
  return Array.isArray(raw) ? raw : []
}

function writeGroups(data: RegistrySnapshot, groups: RegistryMpOrderGroupChat[]): void {
  ;(data as RegistrySnapshot & { mpOrderGroupChats?: RegistryMpOrderGroupChat[] }).mpOrderGroupChats =
    groups.slice(0, 200)
}

export type OrderGroupChatResult =
  | { ok: true; data: RegistrySnapshot; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; message?: string }

function orderById(data: RegistrySnapshot, mpOrderId: string): RegistryMpRecruitmentOrder | null {
  const id = String(mpOrderId || '').trim()
  if (!id) return null
  return (data.mpRecruitmentOrders || []).find((o) => o && o.id === id) || null
}

function groupByOrderId(data: RegistrySnapshot, mpOrderId: string): RegistryMpOrderGroupChat | null {
  const id = String(mpOrderId || '').trim()
  return listGroups(data).find((g) => g && g.mpOrderId === id) || null
}

function maybeCloseGroup(mp: RegistryMpRecruitmentOrder, group: RegistryMpOrderGroupChat): RegistryMpOrderGroupChat {
  if (shouldAutoCloseGroupChat(mp, group)) {
    return {
      ...group,
      status: 'closed',
      closedAt: nowStr(),
      closeReason: 'order_done_7d',
    }
  }
  return group
}

export function createOrderGroupChatInSnapshot(
  data: RegistrySnapshot,
  mpOrderId: string,
  callerParticipantKey?: string,
): OrderGroupChatResult {
  const mp = orderById(data, mpOrderId)
  if (!mp) return { ok: false, status: 404, error: 'not_found', message: '招募单不存在' }

  const prKey = prParticipantKeyFromOrder(mp)
  if (!prKey) return { ok: false, status: 400, error: 'missing_pr_key', message: '无法识别 PR 身份' }
  const caller = String(callerParticipantKey || '').trim()
  if (caller && caller !== prKey) {
    return { ok: false, status: 403, error: 'not_owner', message: '仅发单 PR 可创建商单群' }
  }

  const existing = groupByOrderId(data, mpOrderId)
  if (existing) {
    return { ok: true, data, body: { ok: true, group: existing, existed: true } }
  }

  const selected = selectedApplicants(mp)
  if (!selected.length) {
    return { ok: false, status: 400, error: 'no_selected', message: '请先选择达人' }
  }

  const memberParticipantKeys = [prKey]
  const memberNames: Record<string, string> = {}
  const meta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : {}
  memberNames[prKey] = String(meta.prDisplayName || mp.customerName || 'PR').trim() || 'PR'

  const inboxRows: MpTalentInboxEntryInput[] = []
  for (const a of selected) {
    const tKey = resolveApplicantParticipantKey(data, a)
    if (!tKey || memberParticipantKeys.includes(tKey)) continue
    memberParticipantKeys.push(tKey)
    const name = String(a.platformNickname || a.name || '达人').trim()
    memberNames[tKey] = name
    const memberId = tKey.replace(/^talent_/, '')
    if (memberId) {
      inboxRows.push({
        talentMemberId: memberId,
        title: '商单协作群已创建',
        body: `您已被邀请加入「${formatGroupTitle(mp.title || mp.customerName || '')}」，点击进入群聊协作。`,
        category: 'order',
        mpOrderId: mp.id,
        noticeType: 'general',
      })
    }
  }

  if (memberParticipantKeys.length < 2) {
    return { ok: false, status: 400, error: 'no_talent_member', message: '已选达人缺少可识别的会员资料，无法拉群' }
  }

  const now = nowStr()
  const group: RegistryMpOrderGroupChat = {
    id: `ogc-${Date.now()}`,
    mpOrderId: mp.id,
    title: formatGroupTitle(mp.title || mp.customerName || ''),
    createdAt: now,
    status: 'active',
    memberParticipantKeys,
    memberNames,
    messages: [
      {
        id: `msg-${Date.now()}`,
        fromParticipantKey: prKey,
        fromName: memberNames[prKey] || 'PR',
        type: 'text',
        text: '商单协作群已创建，请在此沟通拍摄与交付事宜。',
        ts: Date.now(),
      },
    ],
    lastMessageAt: now,
  }

  const groups = listGroups(data)
  groups.unshift(group)
  writeGroups(data, groups)

  if (inboxRows.length) appendMpTalentInboxInSnapshot(data, inboxRows)

  return { ok: true, data, body: { ok: true, group, existed: false } }
}

export function getOrderGroupChatInSnapshot(
  data: RegistrySnapshot,
  mpOrderId: string,
  participantKey: string,
): OrderGroupChatResult {
  const mp = orderById(data, mpOrderId)
  if (!mp) return { ok: false, status: 404, error: 'not_found', message: '招募单不存在' }

  const groups = listGroups(data)
  const idx = groups.findIndex((g) => g && g.mpOrderId === mpOrderId)
  if (idx < 0) return { ok: false, status: 404, error: 'group_not_found', message: '尚未创建商单群' }

  let group = maybeCloseGroup(mp, groups[idx]!)
  groups[idx] = group
  writeGroups(data, groups)

  const key = String(participantKey || '').trim()
  if (!key || !group.memberParticipantKeys.includes(key)) {
    return { ok: false, status: 403, error: 'not_member', message: '您不在该商单群中' }
  }

  return {
    ok: true,
    data,
    body: {
      ok: true,
      group,
      orderStatus: mp.status,
      canSend: group.status === 'active',
    },
  }
}

export function sendOrderGroupChatMessageInSnapshot(
  data: RegistrySnapshot,
  mpOrderId: string,
  participantKey: string,
  payload: { type?: OrderGroupChatMessageType; text?: string; mediaUrl?: string },
): OrderGroupChatResult {
  const mp = orderById(data, mpOrderId)
  if (!mp) return { ok: false, status: 404, error: 'not_found', message: '招募单不存在' }

  const groups = listGroups(data)
  const idx = groups.findIndex((g) => g && g.mpOrderId === mpOrderId)
  if (idx < 0) return { ok: false, status: 404, error: 'group_not_found', message: '尚未创建商单群' }

  let group = maybeCloseGroup(mp, groups[idx]!)
  if (group.status === 'closed') {
    groups[idx] = group
    writeGroups(data, groups)
    return { ok: false, status: 410, error: 'group_closed', message: '商单群已关闭' }
  }

  const key = String(participantKey || '').trim()
  if (!key || !group.memberParticipantKeys.includes(key)) {
    return { ok: false, status: 403, error: 'not_member', message: '您不在该商单群中' }
  }

  const type = payload.type === 'image' || payload.type === 'video' ? payload.type : 'text'
  const text = String(payload.text || '').trim()
  const mediaUrl = String(payload.mediaUrl || '').trim()
  if (type === 'text' && !text) return { ok: false, status: 400, error: 'empty_text', message: '消息不能为空' }
  if ((type === 'image' || type === 'video') && !mediaUrl) {
    return { ok: false, status: 400, error: 'missing_media', message: '媒体地址无效' }
  }

  const msg: OrderGroupChatMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    fromParticipantKey: key,
    fromName: group.memberNames[key] || '成员',
    type,
    text: type === 'text' ? text.slice(0, 2000) : text || undefined,
    mediaUrl: mediaUrl || undefined,
    ts: Date.now(),
  }

  const messages = [...(group.messages || []), msg].slice(-MAX_MESSAGES)
  group = { ...group, messages, lastMessageAt: nowStr() }
  groups[idx] = group
  writeGroups(data, groups)

  return { ok: true, data, body: { ok: true, message: msg, group } }
}

export function listOrderGroupChatsForParticipant(
  data: RegistrySnapshot,
  participantKey: string,
): RegistryMpOrderGroupChat[] {
  const key = String(participantKey || '').trim()
  if (!key) return []
  const out: RegistryMpOrderGroupChat[] = []
  for (const g of listGroups(data)) {
    if (!g || !g.memberParticipantKeys.includes(key)) continue
    const mp = orderById(data, g.mpOrderId)
    if (mp) out.push(maybeCloseGroup(mp, g))
  }
  out.sort((a, b) => String(b.lastMessageAt || b.createdAt).localeCompare(String(a.lastMessageAt || a.createdAt)))
  return out
}
