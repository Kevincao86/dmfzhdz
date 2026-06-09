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
