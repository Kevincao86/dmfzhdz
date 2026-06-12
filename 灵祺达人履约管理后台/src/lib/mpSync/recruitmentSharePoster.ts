import QRCode from 'qrcode'
import { fetchRecruitmentPosterDesign } from '../mpApi'
import { buildPrQrScanUrl } from './prRecruitQr'
import {
  buildPosterInput,
  resolvePosterDesign,
  type PosterDesignTokens,
} from './recruitmentSharePosterCore'
import { normalizePosterStyleIndex } from './recruitmentSharePosterTemplates'
import { renderRecruitmentPosterToDataUrl } from './recruitmentSharePosterRender'

function mergeRemotePosterDesign(
  remote: PosterDesignTokens | null | undefined,
  local: PosterDesignTokens,
): PosterDesignTokens {
  if (!remote) return local
  return {
    ...local,
    ...remote,
    template: local.template,
    templateId: local.templateId,
    styleIndex: local.styleIndex,
    styleLabel: local.styleLabel,
    tags: local.tags,
    footerPanel: remote.footerPanel || local.footerPanel,
  }
}

async function resolvePosterDesignForRender(
  order: Record<string, unknown>,
  styleIndex: number,
): Promise<PosterDesignTokens> {
  const local = resolvePosterDesign(order, styleIndex)
  try {
    const remote = await fetchRecruitmentPosterDesign(order, styleIndex)
    if (remote?.design) return mergeRemotePosterDesign(remote.design, local)
  } catch {
    /* 离线或 AI 不可用时用本地 footerPanel */
  }
  return local
}

export async function buildRecruitmentSharePosterDataUrl(
  order: Record<string, unknown>,
  styleIndex = 0,
): Promise<{ dataUrl: string; design: PosterDesignTokens }> {
  const qrUrl = buildPrQrScanUrl(String(order.id || ''))
  const input = buildPosterInput(order, qrUrl)
  const styleIdx = normalizePosterStyleIndex(styleIndex)
  const design = await resolvePosterDesignForRender(order, styleIdx)
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
