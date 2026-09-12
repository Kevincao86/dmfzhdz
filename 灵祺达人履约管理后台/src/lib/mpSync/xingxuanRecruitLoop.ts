/** 星选招募履约：仅显式 fulfillmentLoop=open 视为开环。缺省/闭环保持现网路径。 */

export function isXingxuanOpenLoop(mp: Record<string, unknown> | null | undefined): boolean {
  if (!mp) return false
  const top = String(mp.fulfillmentLoop || '').trim()
  if (top === 'open') return true
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? (mp.mpPublishMeta as Record<string, unknown>) : null
  return String(meta?.fulfillmentLoop || '').trim() === 'open'
}

export function resolvePublishFulfillmentLoop(
  recruitModeId: string,
  formLoop?: string,
): 'open' | 'closed' | '' {
  if (recruitModeId === 'ice' || recruitModeId === 'edit_ice') return 'closed'
  if (formLoop === 'open') return 'open'
  return ''
}
