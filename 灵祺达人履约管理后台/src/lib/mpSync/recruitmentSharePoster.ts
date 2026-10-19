import { fetchMpApplyWxacode } from '../mpApi'
import { buildRecruitmentMpPath } from './recruitmentShareCopy'
import {
  buildPosterInput,
  resolvePosterDesign,
  type PosterDesignTokens,
} from './recruitmentSharePosterCore'
import { normalizePosterStyleIndex } from './recruitmentSharePosterTemplates'
import { renderRecruitmentPosterToDataUrl } from './recruitmentSharePosterRender'

export async function buildRecruitmentSharePosterDataUrl(
  order: Record<string, unknown>,
  styleIndex = 0,
  opts?: { accentColor?: string; accentLight?: string; themeLabel?: string; festivalUrl?: string },
): Promise<{ dataUrl: string; design: PosterDesignTokens }> {
  const orderId = String(order.id || '').trim()
  const qrUrl = buildRecruitmentMpPath(orderId) || orderId
  const input = buildPosterInput(order, qrUrl)
  const styleIdx = normalizePosterStyleIndex(styleIndex)
  const design = resolvePosterDesign(order, styleIdx)
  if (opts && (opts.accentColor || opts.themeLabel)) {
    if (opts.accentColor) {
      design.accentColor = opts.accentColor
      design.frameColor = opts.accentColor
      design.accentLight = opts.accentLight || design.accentLight
      design.template = {
        ...design.template,
        outerBg: opts.accentLight || design.template.outerBg,
        bgGradient: [opts.accentColor, opts.accentColor, opts.accentLight || '#FFFFFF'],
      }
    }
    design.forceGradientHero = !opts.festivalUrl
    design.shareThemeLabel = opts.themeLabel || ''
    design.festivalUrl = opts.festivalUrl || ''
  }

  let qrDataUrl = ''
  try {
    const wx = await fetchMpApplyWxacode(orderId)
    qrDataUrl = wx.dataUrl
  } catch {
    /* 无小程序码时 render 会跳过二维码区 */
  }
  if (!qrDataUrl) {
    throw new Error('wxacode_unavailable')
  }

  const dataUrl = await renderRecruitmentPosterToDataUrl(input, design, qrDataUrl)
  return { dataUrl, design }
}

export { normalizePosterStyleIndex, getPosterTemplateCount } from './recruitmentSharePosterTemplates'
export { resolvePosterDesign, resolvePosterThemeColor } from './recruitmentSharePosterCore'
