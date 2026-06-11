import { groupQrFromMp } from './mpGroupQr'
import { getEditGroupQrFromMp, getTalentGroupQrFromMp, isEditTeamIceMpOrder } from './iceOrderDetect'

/** 认领成功后展示：剪辑师群 / 达人群分开 */
export function resolveClaimGroupQr(
  mp: Record<string, unknown> | null | undefined,
  reg: Record<string, unknown> | null | undefined,
  mpOrderId: string,
  identity?: string,
): string {
  const id = String(mpOrderId || '').trim()
  if (!id || !mp) return ''
  const map = reg?.mpGroupQrByOrderId
  if (map && typeof map === 'object' && (map as Record<string, string>)[id]) {
    return String((map as Record<string, string>)[id]).trim()
  }
  const isEditOrder = isEditTeamIceMpOrder(mp)
  if (identity === 'edit' && isEditOrder) return getEditGroupQrFromMp(mp)
  if (identity === 'talent' && isEditOrder) return ''
  if (isEditOrder) return getEditGroupQrFromMp(mp)
  return getTalentGroupQrFromMp(mp) || groupQrFromMp(mp)
}
