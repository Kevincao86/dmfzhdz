import QRCode from 'qrcode'
import { buildPrQrScanUrl } from './prRecruitQr'
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
  const qrUrl = buildPrQrScanUrl(String(order.id || ''))
  const input = buildPosterInput(order, qrUrl)
  const design = resolvePosterDesign(order, normalizePosterStyleIndex(styleIndex))
  const qrDataUrl = await QRCode.toDataURL(qrUrl, {
    width: 220,
    margin: 1,
    color: { dark: '#0f172a', light: '#ffffff' },
  })
  const dataUrl = await renderRecruitmentPosterToDataUrl(input, design, qrDataUrl)
  return { dataUrl, design }
}

export { normalizePosterStyleIndex, getPosterTemplateCount } from './recruitmentSharePosterTemplates'
export { resolvePosterDesign } from './recruitmentSharePosterCore'
