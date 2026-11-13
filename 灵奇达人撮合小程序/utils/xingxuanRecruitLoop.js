/** 星选招募履约：仅显式 fulfillmentLoop=open 视为开环。缺省/闭环保持现网路径。 */

function readLoopRaw(mp) {
  if (!mp || typeof mp !== 'object') return ''
  const top = String(mp.fulfillmentLoop || '').trim()
  if (top) return top
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  return String(meta.fulfillmentLoop || '').trim()
}

function isXingxuanOpenLoop(mp) {
  return readLoopRaw(mp) === 'open'
}

function resolvePublishFulfillmentLoop(recruitModeId, formLoop) {
  if (recruitModeId === 'ice' || recruitModeId === 'edit_ice') return 'closed'
  if (formLoop === 'open') return 'open'
  return ''
}

module.exports = {
  isXingxuanOpenLoop,
  resolvePublishFulfillmentLoop,
}
