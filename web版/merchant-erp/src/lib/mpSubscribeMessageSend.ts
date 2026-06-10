import type {
  RegistryMpRecruitmentApplicant,
  RegistryMpRecruitmentOrder,
  RegistryMpTalentMember,
  RegistrySnapshot,
} from './opsRegistryTypes.js'
import type { MpTalentInboxEntryInput } from './mpTalentInboxMutations.js'
import { getMpMiniProgramAccessToken } from './mpWechatMiniProgramAccess.js'
import { MP_SUBSCRIBE_TEMPLATES, type MpSubscribeTemplateKey } from './mpSubscribeMessageTemplates.js'

type SubscribeData = Record<string, { value: string }>

function clipThing(text: unknown, max = 20): string {
  const s = String(text || '').trim()
  if (!s) return '—'
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

function clipPhrase(text: unknown, max = 5): string {
  const s = String(text || '').trim()
  if (!s) return '—'
  return s.length <= max ? s : s.slice(0, max)
}

function formatTimeCn(d = new Date()): string {
  return d.toLocaleString('zh-CN', { hour12: false })
}

function formatDateCn(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function normalizeAccount(v: unknown): string {
  return String(v || '').trim().toLowerCase()
}

function resolveMemberForApplicant(
  applicant: RegistryMpRecruitmentApplicant,
  members: RegistryMpTalentMember[],
): RegistryMpTalentMember | null {
  const contact = String(applicant.contact || '').trim()
  const account = normalizeAccount(applicant.platformAccount)
  const wxFromApplicant = String((applicant as { wxOpenId?: string }).wxOpenId || '').trim()
  for (const m of members) {
    if (applicant.talentMemberId && String(m.id) === String(applicant.talentMemberId)) return m
    if (applicant.talentMemberId && m.lingqiTalentId && String(m.lingqiTalentId) === String(applicant.talentMemberId)) {
      return m
    }
    if (wxFromApplicant && String(m.wxOpenId || '').trim() === wxFromApplicant) return m
    if (contact && String(m.contact || '').trim() === contact) return m
    const profs = m.platformProfiles || {}
    for (const p of Object.values(profs)) {
      if (!p) continue
      if (account && normalizeAccount(p.platformAccount) === account) return m
    }
  }
  return null
}

export function resolveOpenIdForApplicant(
  reg: RegistrySnapshot,
  applicant: RegistryMpRecruitmentApplicant,
): string {
  const members = Array.isArray(reg.mpTalentMembers) ? reg.mpTalentMembers : []
  const member = resolveMemberForApplicant(applicant, members)
  const fromMember = String(member?.wxOpenId || '').trim()
  if (fromMember) return fromMember
  const fromApplicant = String((applicant as { wxOpenId?: string }).wxOpenId || '').trim()
  return fromApplicant
}

function detailPagePath(_mpOrderId: string): string {
  return `pages/mine-notifications/mine-notifications`
}

function subscribeMiniprogramState(): 'formal' | 'trial' | 'developer' {
  const raw = String(process.env.MP_SUBSCRIBE_MINIPROGRAM_STATE || process.env.MP_MINIPROGRAM_STATE || '')
    .trim()
    .toLowerCase()
  if (raw === 'formal' || raw === 'release' || raw === '正式') return 'formal'
  if (raw === 'developer' || raw === 'develop' || raw === '开发') return 'developer'
  if (raw === 'trial' || raw === 'preview' || raw === '体验') return 'trial'
  // 未配置时默认 trial：体验版/开发者工具可收到；正式版上线请在 ECS 设 MP_SUBSCRIBE_MINIPROGRAM_STATE=formal
  return 'trial'
}

async function postSubscribeMessage(openId: string, templateId: string, data: SubscribeData, page: string) {
  const token = await getMpMiniProgramAccessToken()
  const res = await fetch(
    `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        touser: openId,
        template_id: templateId,
        page,
        miniprogram_state: subscribeMiniprogramState(),
        lang: 'zh_CN',
        data,
      }),
    },
  )
  const body = (await res.json()) as { errcode?: number; errmsg?: string }
  if (body.errcode && body.errcode !== 0) {
    throw new Error(`subscribe_send_${body.errcode}:${body.errmsg || 'failed'}`)
  }
}

export async function sendMpSubscribeMessage(opts: {
  openId: string
  templateKey: MpSubscribeTemplateKey
  data: SubscribeData
  page?: string
}): Promise<void> {
  const openId = String(opts.openId || '').trim()
  if (!openId) return
  const templateId = MP_SUBSCRIBE_TEMPLATES[opts.templateKey]
  await postSubscribeMessage(openId, templateId, opts.data, opts.page || 'pages/index/index')
}

export function orderTitle(mp: RegistryMpRecruitmentOrder): string {
  const title = String(mp.title || '').trim()
  if (title) return title
  const customer = String(mp.customerName || '').trim()
  const store = String(mp.storeName || '').trim()
  if (customer && store) return `${customer}·${store}达人招募`
  return customer || store || String(mp.id || '招募单')
}

export async function notifyAuditPassSubscribe(
  reg: RegistrySnapshot,
  mp: RegistryMpRecruitmentOrder,
  applicant: RegistryMpRecruitmentApplicant,
  auditedAt?: string,
): Promise<void> {
  const openId = resolveOpenIdForApplicant(reg, applicant)
  if (!openId) return
  await sendMpSubscribeMessage({
    openId,
    templateKey: 'auditPass',
    page: detailPagePath(mp.id),
    data: {
      thing12: { value: clipThing(orderTitle(mp)) },
      time17: { value: auditedAt || formatTimeCn() },
      thing14: { value: clipThing('已被入选') },
    },
  })
}

/** PR/商家点击「通知已选达人」时，对入选站内信条目发送报名审核通过订阅 */
export async function notifyAuditPassForSelectionInboxEntries(
  reg: RegistrySnapshot,
  entries: MpTalentInboxEntryInput[],
): Promise<{ sent: number; skipped: number; failed: string[] }> {
  const auditedAt = new Date().toLocaleString('zh-CN', { hour12: false })
  const seen = new Set<string>()
  let sent = 0
  let skipped = 0
  const failed: string[] = []
  for (const row of entries) {
    if (row.noticeType !== 'selection') continue
    const mpOrderId = String(row.mpOrderId || '').trim()
    if (!mpOrderId) continue
    const applicantId = String(row.applicantId || '').trim()
    const dedupeKey = applicantId ? `${mpOrderId}:${applicantId}` : `${mpOrderId}:${row.talentMemberId}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    const mp = (reg.mpRecruitmentOrders ?? []).find((o) => o && o.id === mpOrderId)
    if (!mp) {
      skipped += 1
      continue
    }

    let applicant: RegistryMpRecruitmentApplicant | undefined
    if (applicantId) {
      applicant = (mp.applicants ?? []).find((a) => String(a.id) === applicantId)
    }
    if (!applicant) {
      const contact = String(row.contact || '').trim()
      const account = normalizeAccount(row.platformAccount)
      applicant = (mp.applicants ?? []).find((a) => {
        if (contact && String(a.contact || '').trim() === contact) return true
        if (account && normalizeAccount(a.platformAccount) === account) return true
        return false
      })
    }
    if (!applicant) {
      skipped += 1
      continue
    }

    const openId = resolveOpenIdForApplicant(reg, applicant)
    if (!openId) {
      skipped += 1
      failed.push(`no_openid:${applicantId || contactKeyFromRow(row)}`)
      continue
    }

    try {
      await notifyAuditPassSubscribe(reg, mp, applicant, auditedAt)
      sent += 1
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      failed.push(msg.slice(0, 120))
      console.warn('[inbox] audit subscribe failed', msg)
    }
  }
  return { sent, skipped, failed }
}

function contactKeyFromRow(row: MpTalentInboxEntryInput): string {
  return String(row.contact || row.talentMemberId || '').trim()
}

export async function notifyVideoRejectSubscribe(
  reg: RegistrySnapshot,
  mp: RegistryMpRecruitmentOrder,
  applicant: RegistryMpRecruitmentApplicant,
  rejectReason?: string,
): Promise<void> {
  const openId = resolveOpenIdForApplicant(reg, applicant)
  if (!openId) return
  await sendMpSubscribeMessage({
    openId,
    templateKey: 'videoReject',
    page: 'pages/mine-applications/mine-applications',
    data: {
      thing3: { value: clipThing(orderTitle(mp)) },
      phrase1: { value: clipPhrase('审核不通过') },
      thing2: { value: clipThing(rejectReason || '请修改后重新提交') },
    },
  })
}

export async function notifyVideoPassSubscribe(
  reg: RegistrySnapshot,
  mp: RegistryMpRecruitmentOrder,
  applicant: RegistryMpRecruitmentApplicant,
  reviewedAt?: string,
): Promise<void> {
  const openId = resolveOpenIdForApplicant(reg, applicant)
  if (!openId) return
  await sendMpSubscribeMessage({
    openId,
    templateKey: 'videoPass',
    page: 'pages/mine-applications/mine-applications',
    data: {
      thing15: { value: clipThing(orderTitle(mp)) },
      date3: { value: formatDateCn(reviewedAt ? new Date(reviewedAt.replace(/-/g, '/')) : new Date()) },
      phrase1: { value: clipPhrase('审核通过') },
    },
  })
}

export function selectedApplicantIdSet(mp: RegistryMpRecruitmentOrder): Set<string> {
  const fromField = Array.isArray(mp.selectedApplicantIds) ? mp.selectedApplicantIds : []
  if (fromField.length) return new Set(fromField.map(String))
  const ids = (mp.applicants || []).filter((a) => a.prSelected || a.merchantSelected).map((a) => String(a.id))
  return new Set(ids)
}
