import { isIceMpOrder } from '../mpRecruitment/orderCard'

function mpMeta(mp: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!mp?.mpPublishMeta || typeof mp.mpPublishMeta !== 'object') return {}
  return mp.mpPublishMeta as Record<string, unknown>
}

/** 剪辑师云剪（edit_ice）：认领后上传成片，非达人直派下载 */
export function isEditTeamIceMpOrder(mp: Record<string, unknown> | null | undefined): boolean {
  if (!isIceMpOrder(mp)) return false
  const meta = mpMeta(mp)
  const target = String(meta.recruitTarget || mp!.recruitTarget || '').trim()
  const mode = String(meta.recruitMode || '').trim()
  return target === 'edit' || mode === 'edit_ice'
}

export function getEditGroupQrFromMp(mp: Record<string, unknown> | null | undefined): string {
  if (!mp) return ''
  const meta = mpMeta(mp)
  return String(mp.editGroupQrImage || meta.editGroupQrImage || '').trim()
}

export function getTalentGroupQrFromMp(mp: Record<string, unknown> | null | undefined): string {
  if (!mp) return ''
  const meta = mpMeta(mp)
  return String(mp.groupQrImage || meta.groupQrImage || '').trim()
}
