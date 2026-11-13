/**
 * 招募大厅卡片图标：达人单用平台 logo；拍摄/剪辑/AI 云剪用分类徽标
 */
const hallFilters = require('./recruitmentHallFilters.js')
const { recruitTargetFromMp } = require('./recruitTarget.js')

const HALL_BADGE_ICONS = {
  shoot_visit: { text: '跟拍', className: 'hall-icon-badge--shoot-visit' },
  shoot_event: { text: '活动', className: 'hall-icon-badge--shoot-event' },
  shoot_product: { text: '静物', className: 'hall-icon-badge--shoot-product' },
  edit_visit: { text: '探剪', className: 'hall-icon-badge--edit-visit' },
  edit_brand: { text: '品剪', className: 'hall-icon-badge--edit-brand' },
  edit_ice: { text: 'AI', className: 'hall-icon-badge--edit-ai' },
}

function isIceMpOrder(mp) {
  if (!mp) return false
  if (mp.hall === 'ice' || mp.orderKind === 'recruitment_ice' || mp.orderKind === 'ice') return true
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  const mode = String(meta.recruitMode || '').trim()
  return mode === 'ice' || mode === 'edit_ice'
}

function recruitModeFromMp(mp) {
  const meta = mp && mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  return String(meta.recruitMode || '').trim()
}

function resolveHallBadgeKey(mp) {
  if (isIceMpOrder(mp)) return 'edit_ice'
  const target = recruitTargetFromMp(mp)
  const mode = recruitModeFromMp(mp)
  if (target === 'shoot') {
    if (mode === 'shoot_event') return 'shoot_event'
    if (mode === 'shoot_product') return 'shoot_product'
    return 'shoot_visit'
  }
  if (target === 'edit') {
    if (mode === 'edit_brand') return 'edit_brand'
    return 'edit_visit'
  }
  return ''
}

function resolveHallOrderIcon(mp, platform) {
  const badgeKey = resolveHallBadgeKey(mp)
  if (badgeKey && HALL_BADGE_ICONS[badgeKey]) {
    const badge = HALL_BADGE_ICONS[badgeKey]
    return {
      hallIconKind: 'badge',
      hallIconText: badge.text,
      hallIconClass: badge.className,
      platformIcon: '',
    }
  }
  const p = hallFilters.normalizeHallPlatform(platform || (mp && mp.platform) || '抖音')
  return {
    hallIconKind: 'image',
    hallIconText: '',
    hallIconClass: '',
    platformIcon: hallFilters.platformIcon(p),
  }
}

module.exports = {
  HALL_BADGE_ICONS,
  resolveHallOrderIcon,
  resolveHallBadgeKey,
  isIceMpOrder,
}
