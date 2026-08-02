/**
 * 与 web `mpPointsEconomics.ts` 消耗规则保持一致（ERP 租户积分）
 */
const MP_POINTS_SHORTVIDEO_PER_SEC = 80
const MP_POINTS_SHORTVIDEO_MIN_CHARGE = 400

/** 数字人口播成片：80 积分/秒（与 CS Web 一致）；小程序当前为 TTS 试听，成片在电脑端扣费 */
const MP_POINTS_DIGITAL_HUMAN_PER_SEC = 80
const MP_POINTS_DIGITAL_HUMAN_MIN_CHARGE = 320

const MP_POINTS_CLOUD_EDIT_FLAT_PER_CLIP = 80
const MP_POINTS_CLOUD_EDIT_MAX_SEC = 60

const MP_POINTS_CLOUD_EDIT_SMART_PER_SEC = 5
const MP_POINTS_CLOUD_EDIT_SMART_MIN_CHARGE = 5

const MP_POINTS_MIX_MATERIAL_ANALYZE_PER_USE = 15

const MP_POINTS_VISUAL_STUDIO_COPY_PER_USE = 3
const MP_POINTS_VISUAL_STUDIO_IMAGE_PER_USE = 8
/** 高级生图 GPT Image 2 high：150 积分/张（与 Web mpPointsEconomics 一致） */
const MP_POINTS_VISUAL_STUDIO_IMAGE_PRO_PER_USE = 150
const VISUAL_STUDIO_PRO_IMAGE_MODEL = 'gpt-image-2'

const MP_POINTS_PER_SEC_BY_KIND = {
  shortvideo: MP_POINTS_SHORTVIDEO_PER_SEC,
  cloud_edit_smart: MP_POINTS_CLOUD_EDIT_SMART_PER_SEC,
  digital_human: MP_POINTS_DIGITAL_HUMAN_PER_SEC,
}

const MP_POINTS_USAGE_KIND_LABELS = {
  shortvideo: '短视频 AI 处理',
  cloud_edit: '灵祺 AI 云剪',
  cloud_edit_smart: '智能一键成片',
  digital_human: '数字人口播',
  mix_material_analyze: 'AI 混剪素材分析',
  visual_studio_copy: 'AI 视觉工坊文案',
  visual_studio_image: 'AI 视觉工坊常规生图',
  visual_studio_image_pro: 'AI 视觉工坊高级生图',
}

function mpPointsPerSecForKind(kind) {
  return MP_POINTS_PER_SEC_BY_KIND[kind] ?? null
}

function mpPointsCostForAddonDuration(kind, durationSec) {
  if (kind === 'cloud_edit') return MP_POINTS_CLOUD_EDIT_FLAT_PER_CLIP
  const sec = Math.max(1, Math.ceil(Number(durationSec) || 1))
  const rate = mpPointsPerSecForKind(kind) || 0
  const raw = sec * rate
  const min =
    kind === 'cloud_edit_smart'
      ? MP_POINTS_CLOUD_EDIT_SMART_MIN_CHARGE
      : kind === 'shortvideo'
        ? MP_POINTS_SHORTVIDEO_MIN_CHARGE
        : kind === 'digital_human'
          ? MP_POINTS_DIGITAL_HUMAN_MIN_CHARGE
          : 0
  return Math.max(min, raw)
}

function mpPointsCostForUsage(kind, opts) {
  if (
    kind === 'shortvideo' ||
    kind === 'cloud_edit' ||
    kind === 'cloud_edit_smart' ||
    kind === 'digital_human'
  ) {
    return mpPointsCostForAddonDuration(kind, (opts && opts.durationSec) || 1)
  }
  if (kind === 'mix_material_analyze') return MP_POINTS_MIX_MATERIAL_ANALYZE_PER_USE
  if (kind === 'visual_studio_copy') return MP_POINTS_VISUAL_STUDIO_COPY_PER_USE
  if (kind === 'visual_studio_image') {
    const n = Math.max(1, Math.ceil(Number((opts && opts.count) || 1) || 1))
    return n * MP_POINTS_VISUAL_STUDIO_IMAGE_PER_USE
  }
  if (kind === 'visual_studio_image_pro') {
    const n = Math.max(1, Math.ceil(Number((opts && opts.count) || 1) || 1))
    return n * MP_POINTS_VISUAL_STUDIO_IMAGE_PRO_PER_USE
  }
  return 0
}

function formatMpPointsRateLabel(kind) {
  if (kind === 'cloud_edit') {
    return `${MP_POINTS_CLOUD_EDIT_FLAT_PER_CLIP} 积分/条（≤${MP_POINTS_CLOUD_EDIT_MAX_SEC} 秒）`
  }
  if (kind === 'mix_material_analyze') {
    return `${MP_POINTS_MIX_MATERIAL_ANALYZE_PER_USE} 积分/次`
  }
  if (kind === 'visual_studio_copy') {
    return `${MP_POINTS_VISUAL_STUDIO_COPY_PER_USE} 积分/次`
  }
  if (kind === 'visual_studio_image') {
    return `${MP_POINTS_VISUAL_STUDIO_IMAGE_PER_USE} 积分/张`
  }
  if (kind === 'visual_studio_image_pro') {
    return `${MP_POINTS_VISUAL_STUDIO_IMAGE_PRO_PER_USE} 积分/张`
  }
  const rate = mpPointsPerSecForKind(kind)
  if (rate != null) return `${rate} 积分/秒`
  return '按积分扣费'
}

function formatAddonSpendHint(kind, result, durationSec) {
  if (!result || (result.pointsCharged <= 0 && !result.already)) return ''
  const sec =
    kind !== 'cloud_edit' && durationSec > 0 ? `（${Math.ceil(durationSec)} 秒）` : ''
  const label = MP_POINTS_USAGE_KIND_LABELS[kind] || kind
  return ` · ${label}${sec} 消耗 ${result.pointsCharged} 积分，余额 ${result.balance}`
}

function insufficientMessage(kind, required, balance) {
  const label = MP_POINTS_USAGE_KIND_LABELS[kind] || '该功能'
  return `积分不足（当前 ${balance}，需要 ${required}），请先充值后再使用${label}`
}

module.exports = {
  MP_POINTS_SHORTVIDEO_PER_SEC,
  MP_POINTS_DIGITAL_HUMAN_PER_SEC,
  MP_POINTS_DIGITAL_HUMAN_MIN_CHARGE,
  MP_POINTS_CLOUD_EDIT_FLAT_PER_CLIP,
  MP_POINTS_CLOUD_EDIT_MAX_SEC,
  MP_POINTS_CLOUD_EDIT_SMART_PER_SEC,
  MP_POINTS_MIX_MATERIAL_ANALYZE_PER_USE,
  MP_POINTS_VISUAL_STUDIO_COPY_PER_USE,
  MP_POINTS_VISUAL_STUDIO_IMAGE_PER_USE,
  MP_POINTS_VISUAL_STUDIO_IMAGE_PRO_PER_USE,
  VISUAL_STUDIO_PRO_IMAGE_MODEL,
  mpPointsCostForUsage,
  formatMpPointsRateLabel,
  formatAddonSpendHint,
  insufficientMessage,
}
