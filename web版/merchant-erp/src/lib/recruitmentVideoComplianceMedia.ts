/**
 * 探店成片合规：从 videoUrl 提取口播 ASR + 关键帧 OCR/画面敏感分类检核。
 */
import { routeAiChat } from '../../vite-plugins/aiGateway/chatRouter.js'
import {
  type AiTokenUsageRecordOpts,
  coerceLlmUsage,
  voidRecordLlmTokenUsage,
} from '../../vite-plugins/aiTokenUsageCore.js'
import {
  extractComplianceSampleFramesFromUrl,
  type ComplianceSampleFrameSlot,
} from '../../vite-plugins/videoConcatServer.js'
import { DOUYIN_LIFE_VIDEO_RISK_PHRASES } from './douyinLifeServiceVideoComplianceRules.js'
import { KUAISHOU_VIDEO_RISK_PHRASES } from './kuaishouVideoComplianceRules.js'
import { WECHAT_CHANNELS_VIDEO_RISK_PHRASES } from './wechatChannelsVideoComplianceRules.js'
import { transcribeRemoteVideoAudioDetailed } from './digitalHumanDouyinLinkCore.js'
import type { AsrTimedSegment } from './complianceHitLocations.js'
import {
  FRAME_VISION_RISK_SYSTEM,
  VISUAL_FORCE_HIT_LABELS,
  forceHitsFromVisionRiskFields,
  isVisualForceHitPhrase,
  scanSensitiveMediaPhrases,
} from './videoVisualRiskTaxonomy.js'

/** 抽帧 OCR 本地预扫：合并三端短视频词表（导流词各端已对齐） */
const FRAME_OCR_RISK_PHRASES = [
  ...new Set([
    ...DOUYIN_LIFE_VIDEO_RISK_PHRASES,
    ...KUAISHOU_VIDEO_RISK_PHRASES,
    ...WECHAT_CHANNELS_VIDEO_RISK_PHRASES,
  ]),
]

export type VideoMediaComplianceExtract = {
  asrText: string
  asrSegments: AsrTimedSegment[]
  ocrText: string
  visualHits: string[]
  frameSlotHits: Array<{ slot: ComplianceSampleFrameSlot; hits: string[]; ocrText: string }>
  durationSec?: number
  mediaNotes: string[]
}

function readVisionBearer(env: Record<string, string>): string | undefined {
  return (env.MERCHANT_AI_DOUBAO_KEY ?? env.ARK_API_KEY ?? '').trim() || undefined
}

function localRiskScan(text: string): string[] {
  const t = text.toLowerCase()
  const hits: string[] = []
  for (const phrase of FRAME_OCR_RISK_PHRASES) {
    if (t.includes(phrase.toLowerCase())) hits.push(phrase)
  }
  return hits
}

function parseVisionComplianceJson(raw: string): {
  ocrText?: string
  visualHits?: string[]
  visualNotes?: string
  hasPerson?: boolean
  riskClasses?: unknown
  attireRisk?: string
  poseRisk?: string
  divertRisk?: string
  violenceRisk?: string
  dangerRisk?: string
} | null {
  const m = /\{[\s\S]*\}/.exec(String(raw || '').trim())
  if (!m) return null
  try {
    return JSON.parse(m[0]) as {
      ocrText?: string
      visualHits?: string[]
      visualNotes?: string
      hasPerson?: boolean
      riskClasses?: unknown
      attireRisk?: string
      poseRisk?: string
      divertRisk?: string
      violenceRisk?: string
      dangerRisk?: string
    }
  } catch {
    return null
  }
}

function slotLabel(slot: ComplianceSampleFrameSlot, atSec?: number): string {
  if (slot === 'opening') return '开头'
  if (slot === 'middle') return '中段'
  if (slot === 'closing') return '结尾'
  if (typeof atSec === 'number' && Number.isFinite(atSec)) return `约${Math.round(atSec)}秒`
  const m = /^t(\d+)s$/i.exec(slot)
  if (m) return `约${m[1]}秒`
  return String(slot)
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++
      out[idx] = await fn(items[idx]!, idx)
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1))
  await Promise.all(Array.from({ length: n }, () => worker()))
  return out
}

async function analyzeSingleFrame(
  slot: ComplianceSampleFrameSlot,
  dataUrl: string,
  env: Record<string, string>,
  usageRecord?: AiTokenUsageRecordOpts & { token?: string },
  atSec?: number,
): Promise<{ ocrText: string; visualHits: string[]; visualNotes: string; hasPerson: boolean }> {
  const provider = (env.MERCHANT_AI_ICE_VERIFY_PROVIDER || env.MERCHANT_MP_AI_PROVIDER || 'doubao').trim()
  const model = (env.MERCHANT_AI_ICE_VERIFY_MODEL || '').trim() || undefined
  const prompt = `这是成片${slotLabel(slot, atSec)}关键帧。请 OCR，并输出 riskClasses（擦边/暴力/血腥/危险/导流必须报，勿用探店豁免）。`
  try {
    const res = await routeAiChat(
      {
        provider: provider as 'doubao',
        model,
        temperature: 0,
        imageDataUrls: [dataUrl],
        messages: [
          { role: 'system', content: FRAME_VISION_RISK_SYSTEM },
          { role: 'user', content: prompt },
        ],
      },
      env,
    )
    void voidRecordLlmTokenUsage(usageRecord ? { ...usageRecord, env } : { env }, {
      provider: res.provider || provider,
      model: res.model,
      usage: coerceLlmUsage(res.usage),
      inputText: `${FRAME_VISION_RISK_SYSTEM}\n${prompt}`,
      outputText: String(res.content ?? ''),
      token: usageRecord?.token,
    })
    const parsed = parseVisionComplianceJson(res.content || '')
    const ocrText = String(parsed?.ocrText || '').trim() || String(res.content || '').trim()
    const forced = forceHitsFromVisionRiskFields(parsed || { ocrText })
    const ocrHits = localRiskScan(ocrText)
    const mediaSense = scanSensitiveMediaPhrases(ocrText)
    const visualNotes = String(parsed?.visualNotes || '').trim()
    return {
      ocrText,
      visualHits: [...new Set([...forced, ...ocrHits, ...mediaSense])].slice(0, 16),
      visualNotes,
      hasPerson: parsed?.hasPerson === true,
    }
  } catch {
    return { ocrText: '', visualHits: [], visualNotes: '', hasPerson: false }
  }
}

/** 从成片 URL 提取口播 + 画面文字/视觉风险（失败项留空，不阻断整体检核） */
export async function extractVideoMediaForCompliance(
  videoUrl: string,
  env: Record<string, string>,
  usageRecord?: AiTokenUsageRecordOpts & { token?: string },
): Promise<VideoMediaComplianceExtract> {
  const url = String(videoUrl || '').trim()
  const notes: string[] = []
  if (!/^https?:\/\//i.test(url)) {
    return {
      asrText: '',
      asrSegments: [],
      ocrText: '',
      visualHits: [],
      frameSlotHits: [],
      mediaNotes: ['成片地址无效，未检核口播/画面'],
    }
  }

  const bearer = readVisionBearer(env)
  const [asrDetailed, framePack] = await Promise.all([
    transcribeRemoteVideoAudioDetailed(url, env).catch(() => null),
    extractComplianceSampleFramesFromUrl(url, { bearer }),
  ])

  const asrText = String(asrDetailed?.text || '').trim()
  const asrSegments = asrDetailed?.segments ?? []
  if (asrText.length >= 8) {
    notes.push(asrSegments.some((s) => s.beginMs > 0) ? '已检核视频口播（含时间轴）' : '已检核视频口播')
  } else {
    notes.push('口播 ASR 未识别（可能无旁白或 Key/时长限制）')
  }

  if (/非常肥美|好大一只/.test(asrText)) {
    notes.push('口播含可能双关表述，将结合画面人物出镜综合判定')
  }

  const durationSec = framePack.ok ? framePack.durationSec : undefined
  let ocrText = ''
  let visualHits: string[] = []
  let anyPerson = false
  const frameSlotHits: VideoMediaComplianceExtract['frameSlotHits'] = []

  if (framePack.ok && framePack.frames.length) {
    notes.push(`已加密抽帧 ${framePack.frames.length} 张做画面敏感分类`)
    const ocrParts: string[] = []
    const batchSize = 2
    for (let i = 0; i < framePack.frames.length; i += batchSize) {
      const batch = framePack.frames.slice(i, i + batchSize)
      const visionResults = await mapPool(batch, batchSize, async (f) => {
        const vision = await analyzeSingleFrame(
          f.slot,
          `data:image/jpeg;base64,${f.buffer.toString('base64')}`,
          env,
          usageRecord,
          'atSec' in f ? Number((f as { atSec?: number }).atSec) : undefined,
        )
        return { frame: f, vision }
      })
      for (const { frame: f, vision } of visionResults) {
        if (vision.hasPerson) anyPerson = true
        if (vision.ocrText) ocrParts.push(`【${f.slot}】${vision.ocrText}`)
        const slotOcr = String(vision.ocrText || '').trim()
        const slotHits = vision.visualHits.length ? vision.visualHits : localRiskScan(slotOcr)
        if (slotOcr || slotHits.length) {
          frameSlotHits.push({ slot: f.slot, hits: slotHits, ocrText: slotOcr })
        }
        if (vision.visualHits.length) visualHits.push(...vision.visualHits)
        if (vision.visualNotes) notes.push(`${slotLabel(f.slot)}：${vision.visualNotes}`)
      }
      if (
        visualHits.some((h) => isVisualForceHitPhrase(h)) &&
        i + batchSize < framePack.frames.length
      ) {
        notes.push('画面已命中敏感分类，提前结束剩余抽帧视觉以控制耗时')
        break
      }
    }
    ocrText = ocrParts.join('\n')
    if (ocrText.length >= 4) notes.push('已 OCR 画面字幕/贴纸文字')
    else notes.push('画面 OCR 未提取到有效文字')

    // 人物出镜 + 口播/字幕双关 → 升色情导流（不依赖模型报 attire）
    if (anyPerson && /非常肥美|好大一只|duang大|闭眼入啊/i.test(`${asrText}\n${ocrText}`)) {
      visualHits.push('双关暗示话术', '色情导流风险')
      notes.push('人物出镜+双关话术组合，已强制升色情导流风险')
    }

    // 口播暴力等敏感词兜底
    visualHits.push(...scanSensitiveMediaPhrases(asrText))
  } else {
    notes.push(
      framePack.ok ? '未能截取关键帧' : `关键帧截取失败：${'message' in framePack ? framePack.message : '未知'}`,
    )
  }

  const mergedVisual = [...new Set(visualHits)].slice(0, 16)
  const forceLabs = mergedVisual.filter((h) => isVisualForceHitPhrase(h))
  if (forceLabs.length) {
    notes.push(`画面视觉命中：${forceLabs.join('、')}`)
  }

  return {
    asrText,
    asrSegments,
    ocrText,
    visualHits: mergedVisual,
    frameSlotHits,
    durationSec,
    mediaNotes: notes,
  }
}

export { VISUAL_FORCE_HIT_LABELS, isVisualForceHitPhrase }
