import QRCode from 'qrcode'
import { fetchRecruitmentPosterDesign } from '../mpApi'
import { buildPrQrScanUrl } from './prRecruitQr'
import {
  buildPosterInput,
  defaultPosterDesign,
  extractPosterFieldsFromOrder,
  type PosterDesignTokens,
} from './recruitmentSharePosterCore'
import { renderRecruitmentPosterToDataUrl } from './recruitmentSharePosterRender'

export async function buildRecruitmentSharePosterDataUrl(
  order: Record<string, unknown>,
): Promise<{ dataUrl: string; design: PosterDesignTokens }> {
  const qrUrl = buildPrQrScanUrl(String(order.id || ''))
  const input = buildPosterInput(order, qrUrl)
  let design: PosterDesignTokens
  try {
    const out = await fetchRecruitmentPosterDesign(order)
    design = out.design || out.fallback
  } catch {
    const fields = extractPosterFieldsFromOrder(order)
    design = defaultPosterDesign(order, fields)
  }
  const qrDataUrl = await QRCode.toDataURL(qrUrl, {
    width: 200,
    margin: 1,
    color: { dark: '#1e293b', light: '#ffffff' },
  })
  const dataUrl = await renderRecruitmentPosterToDataUrl(input, design, qrDataUrl)
  return { dataUrl, design }
}
