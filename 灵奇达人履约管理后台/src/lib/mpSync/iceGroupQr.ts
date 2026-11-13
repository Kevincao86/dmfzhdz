import { isEditTeamIceMpOrder, getEditGroupQrFromMp, getTalentGroupQrFromMp } from './iceOrderDetect'
import { groupQrFromMp } from './mpGroupQr'

/** 认领确认后从注册表 mpGroupQrByOrderId 解析群码（剪辑师群 / 达人群分开） */
export function resolveClaimGroupQr(
  reg: Record<string, unknown> | null | undefined,
  mpOrderId: string,
  mp?: Record<string, unknown> | null,
): string {
  const id = String(mpOrderId || '').trim()
  if (!id) return ''
  const map =
    reg?.mpGroupQrByOrderId && typeof reg.mpGroupQrByOrderId === 'object'
      ? (reg.mpGroupQrByOrderId as Record<string, string>)
      : null
  if (map && map[id]) return String(map[id]).trim()
  if (!mp) return ''
  if (isEditTeamIceMpOrder(mp)) return getEditGroupQrFromMp(mp)
  return getTalentGroupQrFromMp(mp) || groupQrFromMp(mp)
}
