/**
 * 探店成片合规：从 videoUrl 提取口播 ASR + 关键帧 OCR/画面检核。
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
import { transcribeRemoteVideoAudioDetailed } from './digitalHumanDouyinLinkCore.js'
import type { AsrTimedSegment } from './complianceHitLocations.js'

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
  for (const phrase of DOUYIN_LIFE_VIDEO_RISK_PHRASES) {
    if (t.includes(phrase.toLowerCase())) hits.push(phrase)
  }
  return hits
}

function parseVisionComplianceJson(raw: string): {
  ocrText?: string
  visualHits?: string[]
  visualNotes?: string
} | null {
  const m = /\{[\s\S]*\}/.exec(String(raw || '').trim())
  if (!m) return null
  try {
    return JSON.parse(m[0]) as {
      ocrText?: string
      visualHits?: string[]
      visualNotes?: string
    }
  } catch {
    return null
  }
}

const FRAME_VISION_SYSTEM = `你是抖音生活服务短视频合规审核助手。用户会提供从探店成片截取的 1 张关键帧（含字幕、价格贴纸、大字小字、画面元素）。
请完成：
1. OCR：识别帧内所有可见中文/英文文字（含字幕、贴纸、价签、标题），写入 ocrText；
2. 画面合规：检查大小字误导、未标注广告、绝对化/极限用语出现在画面文字等；
3. visualHits 只列本帧 OCR 原文中出现的违规词或画面问题短语；无则空数组。
只输出 JSON，不要 Markdown：
{"ocrText":"…","visualHits":["…"],"visualNotes":"10-40字说明"}`

async function analyzeSingleFrame(
  slot: ComplianceSampleFrameSlot,
  dataUrl: string,
  env: Record<string, string>,
  usageRecord?: AiTokenUsageRecordOpts & { token?: string },
): Promise<{ ocrText: string; visualHits: string[]; visualNotes: string }> {
  const provider = (env.MERCHANT_AI_ICE_VERIFY_PROVIDER || env.MERCHANT_MP_AI_PROVIDER || 'doubao').trim()
  const model = (env.MERCHANT_AI_ICE_VERIFY_MODEL || '').trim() || undefined
  const slotLabel =
    slot === 'opening' ? '开头' : slot === 'middle' ? '中段' : '结尾'
  const prompt = `这是探店成片的${slotLabel}关键帧，请 OCR 全部可见文字并检核画面违规风险。`
  try {
    const res = await routeAiChat(
      {
        provider: provider as 'doubao',
        model,
        temperature: 0,
        imageDataUrls: [dataUrl],
        messages: [
          { role: 'system', content: FRAME_VISION_SYSTEM },
          { role: 'user', content: prompt },
        ],
      },
      env,
    )
    void voidRecordLlmTokenUsage(
      usageRecord ? { ...usageRecord, env, token: usageRecord.token } : { env, token: usageRecord?.token },
      {
        provider: res.provider || provider,
        model: res.model,
        usage: coerceLlmUsage(res.usage),
        inputText: `${FRAME_VISION_SYSTEM}\n${prompt}`,
        outputText: String(res.content ?? ''),
        token: usageRecord?.token,
      },
    )
    const parsed = parseVisionComplianceJson(res.content || '')
    const ocrText = String(parsed?.ocrText || res.content || '').trim()
    const visualHits = Array.isArray(parsed?.visualHits)
      ? parsed!.visualHits!.map((h) => String(h).trim()).filter(Boolean).slice(0, 12)
      : []
    const visualNotes = String(parsed?.visualNotes || '').trim()
    const ocrHits = localRiskScan(ocrText)
    return {
      ocrText,
      visualHits: [...new Set([...visualHits, ...ocrHits])].slice(0, 12),
      visualNotes,
    }
  } catch {
    return { ocrText: '', visualHits: [], visualNotes: '' }
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

  const durationSec = framePack.ok ? framePack.durationSec : undefined
  let ocrText = ''
  let visualHits: string[] = []
  const frameSlotHits: VideoMediaComplianceExtract['frameSlotHits'] = []

  if (framePack.ok && framePack.frames.length) {
    const ocrParts: string[] = []
    for (const f of framePack.frames) {
      const vision = await analyzeSingleFrame(
        f.slot,
        `data:image/jpeg;base64,${f.buffer.toString('base64')}`,
        env,
        usageRecord,
      )
      if (vision.ocrText) ocrParts.push(`【${f.slot}】${vision.ocrText}`)
      const slotOcr = String(vision.ocrText || '').trim()
      const slotHits = vision.visualHits.length ? vision.visualHits : localRiskScan(slotOcr)
      if (slotOcr || slotHits.length) {
        frameSlotHits.push({ slot: f.slot, hits: slotHits, ocrText: slotOcr })
      }
      if (vision.visualHits.length) visualHits.push(...vision.visualHits)
      if (vision.visualNotes) notes.push(vision.visualNotes)
    }
    ocrText = ocrParts.join('\n')
    if (ocrText.length >= 4) notes.push('已 OCR 画面字幕/贴纸文字')
    else notes.push('画面 OCR 未提取到有效文字')
  } else {
    notes.push(
      framePack.ok ? '未能截取关键帧' : `关键帧截取失败：${'message' in framePack ? framePack.message : '未知'}`,
    )
  }

  return {
    asrText,
    asrSegments,
    ocrText,
    visualHits: [...new Set(visualHits)].slice(0, 12),
    frameSlotHits,
    durationSec,
    mediaNotes: notes,
  }
}
