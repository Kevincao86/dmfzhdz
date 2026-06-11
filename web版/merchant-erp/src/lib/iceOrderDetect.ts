import type { RegistryMpRecruitmentOrder } from './opsRegistryTypes.js'

export type IceVerifyMode = 'ai' | 'pr'

export function isIceMpOrder(mp: Record<string, unknown> | null | undefined): boolean {
  if (!mp) return false
  if (mp.hall === 'ice' || mp.orderKind === 'recruitment_ice' || mp.orderKind === 'ice') return true
  const id = String(mp.id || '').trim()
  if (/^MP-ICE-/i.test(id)) return true
  if (String(mp.category || '').trim() === '云剪') return true
  const meta = mp.mpPublishMeta as Record<string, unknown> | undefined
  const mode = String(meta?.recruitMode || '').trim()
  if (mode === 'ice' || mode === 'edit_ice') return true
  return false
}

export function getIceVerifyMode(mp: RegistryMpRecruitmentOrder | Record<string, unknown>): IceVerifyMode {
  const meta = (mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
    ? mp.mpPublishMeta
    : {}) as Record<string, unknown>
  const raw = String(meta.iceVerifyMode || meta.iceAuditMode || 'ai').trim().toLowerCase()
  return raw === 'pr' ? 'pr' : 'ai'
}

export function iceVerifyModeLabel(mode: IceVerifyMode): string {
  return mode === 'pr' ? 'PR 审核' : 'AI 核查'
}

/** 剪辑师云剪（edit_ice）：认领后上传成片，非达人直派下载 */
export function isEditTeamIceMpOrder(mp: Record<string, unknown> | null | undefined): boolean {
  if (!isIceMpOrder(mp)) return false
  const meta = (mp?.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
    ? mp.mpPublishMeta
    : {}) as Record<string, unknown>
  const target = String(meta.recruitTarget || mp?.recruitTarget || '').trim()
  const mode = String(meta.recruitMode || '').trim()
  return target === 'edit' || mode === 'edit_ice'
}

/** 多成片位云剪包：按条数认领/统计（含 edit_ice 与 iceVideoSlots>1） */
export function isPackSlotIceOrder(mp: Record<string, unknown> | null | undefined): boolean {
  if (!isIceMpOrder(mp)) return false
  if (isEditTeamIceMpOrder(mp)) return true
  const slots = Array.isArray(mp?.iceVideoSlots) ? mp!.iceVideoSlots : []
  return slots.length > 1
}

export function getEditGroupQrFromMp(mp: Record<string, unknown> | null | undefined): string {
  if (!mp) return ''
  const meta = (mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
    ? mp.mpPublishMeta
    : {}) as Record<string, unknown>
  return String(
    (mp as { editGroupQrImage?: string }).editGroupQrImage ||
      meta.editGroupQrImage ||
      '',
  ).trim()
}

/** 达人云剪直发群二维码（与剪辑师群分开） */
export function getTalentGroupQrFromMp(mp: Record<string, unknown> | null | undefined): string {
  if (!mp) return ''
  const meta = (mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
    ? mp.mpPublishMeta
    : {}) as Record<string, unknown>
  return String(mp.groupQrImage || meta.groupQrImage || '').trim()
}
