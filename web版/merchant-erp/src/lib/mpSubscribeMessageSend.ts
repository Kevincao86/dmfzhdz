import type {
  RegistryMpRecruitmentApplicant,
  RegistryMpRecruitmentOrder,
  RegistryMpTalentMember,
  RegistrySnapshot,
} from './opsRegistryTypes.js'
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
  for (const m of members) {
    if (applicant.talentMemberId && String(m.id) === String(applicant.talentMemberId)) return m
    if (contact && String(m.contact || '').trim() === contact) return m
    const wxOpenId = String(m.wxOpenId || '').trim()
    if (wxOpenId && applicant.talentMemberId && String(m.lingqiTalentId || m.id) === String(applicant.talentMemberId)) {
      return m
    }
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

function detailPagePath(mpOrderId: string): string {
  const id = encodeURIComponent(String(mpOrderId || '').trim())
  return `pages/detail/detail?id=${id}`
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
        miniprogram_state: 'formal',
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
