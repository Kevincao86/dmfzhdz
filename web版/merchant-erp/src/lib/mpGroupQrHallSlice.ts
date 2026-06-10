import type { RegistryMpRecruitmentApplicant, RegistryMpTalentMember, RegistryMpRecruitmentOrder, RegistrySnapshot } from './opsRegistryTypes.js'
import { applicantsSamePerson } from './mpApplicantIdentity.js'

function groupQrFromOrderRaw(data: RegistrySnapshot, mpOrderId: string): string {
  const id = String(mpOrderId || '').trim()
  if (!id) return ''
  const o = (data.mpRecruitmentOrders ?? []).find((x) => x && x.id === id)
  if (!o) return ''
  const meta = o.mpPublishMeta && typeof o.mpPublishMeta === 'object' ? o.mpPublishMeta : {}
  return String(o.groupQrImage || (meta as { groupQrImage?: string }).groupQrImage || '').trim()
}

function selectedApplicantIds(mp: RegistryMpRecruitmentOrder): Set<string> {
  const fromField = Array.isArray(mp.selectedApplicantIds) ? mp.selectedApplicantIds : []
  if (fromField.length) return new Set(fromField.map(String))
  return new Set(
    (mp.applicants ?? [])
      .filter((a) => a && (a.prSelected === true || a.merchantSelected === true))
      .map((a) => String(a.id)),
  )
}

function pseudoApplicantFromMember(
  member: RegistryMpTalentMember,
  platform: string,
): RegistryMpRecruitmentApplicant {
  const plat = platform || '抖音'
  const pid =
    plat.includes('小红书') ? 'xiaohongshu' : plat.includes('快手') ? 'kuaishou' : 'douyin'
  const prof = member.platformProfiles?.[pid]
  return {
    id: 'pseudo',
    name: member.wxNickName || '',
    platformNickname: member.wxNickName || '',
    platform: plat,
    platformAccount: prof?.platformAccount || '',
    contact: member.contact || '',
    talentMemberId: member.id,
    wxOpenId: member.wxOpenId,
    followers: Number(prof?.followers) || 0,
    appliedAt: '',
  } as unknown as RegistryMpRecruitmentApplicant
}

function applicantSelectedForMember(
  mp: RegistryMpRecruitmentOrder,
  member: RegistryMpTalentMember,
): RegistryMpRecruitmentApplicant | null {
  const selected = selectedApplicantIds(mp)
  if (!selected.size) return null
  const pseudo = pseudoApplicantFromMember(member, mp.platform || '抖音')
  for (const a of mp.applicants ?? []) {
    if (!a?.id || !selected.has(String(a.id))) continue
    if (applicantsSamePerson(a, pseudo, mp.platform || '抖音')) return a
  }
  return null
}

/** 达人端可见：已入选商单的群二维码（大厅 sanitize 会去掉 order.groupQrImage） */
export function buildMpGroupQrByOrderIdForTalent(
  data: RegistrySnapshot,
  member: RegistryMpTalentMember | null,
): Record<string, string> {
  const out: Record<string, string> = {}
  if (!member) return out
  for (const mp of data.mpRecruitmentOrders ?? []) {
    if (!mp?.id) continue
    if (!applicantSelectedForMember(mp, member)) continue
    const qr = groupQrFromOrderRaw(data, mp.id)
    if (qr) out[String(mp.id)] = qr
  }
  for (const row of data.mpTalentInbox ?? []) {
    if (row.noticeType !== 'selection' && !/恭喜入选/.test(String(row.title || ''))) continue
    const mpOrderId = String(row.mpOrderId || '').trim()
    if (!mpOrderId || out[mpOrderId]) continue
    const qr = String(row.imageUrl || '').trim() || groupQrFromOrderRaw(data, mpOrderId)
    if (qr) out[mpOrderId] = qr
  }
  return out
}
