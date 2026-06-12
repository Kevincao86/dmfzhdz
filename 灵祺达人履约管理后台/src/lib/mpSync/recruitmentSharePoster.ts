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
): Promise<{ dataUrl: string; design: PosterDesignTokens }> {
  const orderId = String(order.id || '').trim()
  const qrUrl = buildRecruitmentMpPath(orderId) || orderId
  const input = buildPosterInput(order, qrUrl)
  const styleIdx = normalizePosterStyleIndex(styleIndex)
  const design = resolvePosterDesign(order, styleIdx)

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
