/**
 * 探店成片合规：从 videoUrl 提取口播 ASR + 关键帧 OCR/画面检核。
 */
import { routeAiChat } from '../../vite-plugins/aiGateway/chatRouter.js'
import {
  type AiTokenUsageRecordOpts,
  coerceLlmUsage,
  voidRecordLlmTokenUsage,
} from '../../vite-plugins/aiTokenUsageCore.js'
import { extractComplianceSampleFramesFromUrl } from '../../vite-plugins/videoConcatServer.js'
import { DOUYIN_LIFE_VIDEO_RISK_PHRASES } from './douyinLifeServiceVideoComplianceRules.js'
import { transcribeRemoteVideoAudio } from './digitalHumanDouyinLinkCore.js'

export type VideoMediaComplianceExtract = {
  asrText: string
  ocrText: string
  visualHits: string[]
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

const FRAME_VISION_SYSTEM = `你是抖音生活服务短视频合规审核助手。用户会提供从探店成片截取的关键帧（含字幕、价格贴纸、大字小字、画面元素）。
请完成：
1. OCR：识别各帧内所有可见中文/英文文字（含字幕、贴纸、价签、标题），合并到 ocrText；
2. 画面合规：检查大小字误导、未标注广告、绝对化/极限用语出现在画面文字、低俗/引战画面等；
3. visualHits 只列原文中出现的违规词或画面问题短语；无则空数组。
只输出 JSON，不要 Markdown：
{"ocrText":"…","visualHits":["…"],"visualNotes":"10-40字说明"}`

async function analyzeSampleFrames(
  frames: Array<{ slot: string; dataUrl: string }>,
  env: Record<string, string>,
  usageRecord?: AiTokenUsageRecordOpts & { token?: string },
): Promise<{ ocrText: string; visualHits: string[]; visualNotes: string }> {
  if (!frames.length) return { ocrText: '', visualHits: [], visualNotes: '' }
  const provider = (env.MERCHANT_AI_ICE_VERIFY_PROVIDER || env.MERCHANT_MP_AI_PROVIDER || 'doubao').trim()
  const model = (env.MERCHANT_AI_ICE_VERIFY_MODEL || '').trim() || undefined
  const slotLabels = frames.map((f, i) => `图${i + 1}（${f.slot}）`).join('、')
  const prompt = [
    `以下 ${frames.length} 张图来自同一支探店成片的关键帧：${slotLabels}。`,
    '请 OCR 全部可见文字，并检核画面文字/排版是否含抖音生活服务违规风险。',
  ].join('\n')
  try {
    const res = await routeAiChat(
      {
        provider: provider as 'doubao',
        model,
        temperature: 0,
        imageDataUrls: frames.map((f) => f.dataUrl),
        messages: [
          { role: 'system', content: FRAME_VISION_SYSTEM },
          { role: 'user', content: prompt },
        ],
      },
      env,
    )
    void voidRecordLlmTokenUsage(
      usageRecord
        ? { ...usageRecord, env, token: usageRecord.token }
        : { env, token: usageRecord?.token },
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
    return { asrText: '', ocrText: '', visualHits: [], mediaNotes: ['成片地址无效，未检核口播/画面'] }
  }

  const bearer = readVisionBearer(env)
  const [asrTextRaw, framePack] = await Promise.all([
    transcribeRemoteVideoAudio(url, env).catch(() => null),
    extractComplianceSampleFramesFromUrl(url, { bearer }),
  ])

  const asrText = String(asrTextRaw || '').trim()
  if (asrText.length >= 8) notes.push('已检核视频口播')
  else notes.push('口播 ASR 未识别（可能无旁白或 Key/时长限制）')

  let ocrText = ''
  let visualHits: string[] = []
  if (framePack.ok && framePack.frames.length) {
    const vision = await analyzeSampleFrames(
      framePack.frames.map((f) => ({
        slot: f.slot,
        dataUrl: `data:image/jpeg;base64,${f.buffer.toString('base64')}`,
      })),
      env,
      usageRecord,
    )
    ocrText = vision.ocrText
    visualHits = vision.visualHits
    if (ocrText.length >= 4) notes.push('已 OCR 画面字幕/贴纸文字')
    else notes.push('画面 OCR 未提取到有效文字')
    if (vision.visualNotes) notes.push(vision.visualNotes)
  } else {
    notes.push(
      framePack.ok ? '未能截取关键帧' : `关键帧截取失败：${'message' in framePack ? framePack.message : '未知'}`,
    )
  }

  const asrHits = localRiskScan(asrText)
  visualHits = [...new Set([...visualHits, ...asrHits])].slice(0, 12)

  return { asrText, ocrText, visualHits, mediaNotes: notes }
}
