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
import { KUAISHOU_VIDEO_RISK_PHRASES } from './kuaishouVideoComplianceRules.js'
import { WECHAT_CHANNELS_VIDEO_RISK_PHRASES } from './wechatChannelsVideoComplianceRules.js'
import { transcribeRemoteVideoAudioDetailed } from './digitalHumanDouyinLinkCore.js'
import type { AsrTimedSegment } from './complianceHitLocations.js'

/** 抽帧 OCR 本地预扫：合并三端短视频词表（导流词各端已对齐） */
const FRAME_OCR_RISK_PHRASES = [
  ...new Set([
    ...DOUYIN_LIFE_VIDEO_RISK_PHRASES,
    ...KUAISHOU_VIDEO_RISK_PHRASES,
    ...WECHAT_CHANNELS_VIDEO_RISK_PHRASES,
  ]),
]

const VISION_FORCE_HIT_PHRASES = [
  '着装擦边',
  '姿态擦边',
  '二维码特写导流',
  '打码指认导流',
  '联系方式露出',
  '双关暗示话术',
  '色情导流风险',
] as const

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
  attireRisk?: string
  poseRisk?: string
  divertRisk?: string
} | null {
  const m = /\{[\s\S]*\}/.exec(String(raw || '').trim())
  if (!m) return null
  try {
    return JSON.parse(m[0]) as {
      ocrText?: string
      visualHits?: string[]
      visualNotes?: string
      hasPerson?: boolean
      attireRisk?: string
      poseRisk?: string
      divertRisk?: string
    }
  } catch {
    return null
  }
}

/** 结构化字段强制落 visualHits，避免模型只写 notes 不报 hits */
function forceHitsFromVisionFields(parsed: {
  ocrText?: string
  visualHits?: string[]
  hasPerson?: boolean
  attireRisk?: string
  poseRisk?: string
  divertRisk?: string
}): string[] {
  const hits: string[] = []
  const attire = String(parsed.attireRisk || 'none').toLowerCase()
  const pose = String(parsed.poseRisk || 'none').toLowerCase()
  const divert = String(parsed.divertRisk || 'none').toLowerCase()
  const ocr = String(parsed.ocrText || '')
  const hasPerson = parsed.hasPerson === true

  if (attire.includes('sheer') || attire.includes('deep') || attire.includes('both') || attire.includes('short')) {
    hits.push('着装擦边')
  }
  if (pose.includes('bend') || pose.includes('chest')) {
    hits.push('姿态擦边')
  }
  if (divert.includes('qr')) hits.push('二维码特写导流')
  if (divert.includes('blur')) hits.push('打码指认导流')
  if (divert.includes('contact')) hits.push('联系方式露出')

  if (Array.isArray(parsed.visualHits)) {
    for (const h of parsed.visualHits) {
      const s = String(h || '').trim()
      if (s) hits.push(s)
    }
  }

  if (hasPerson && /非常肥美|好大一只|duang大/i.test(ocr)) {
    hits.push('双关暗示话术')
  }

  const edge = hits.some((h) => /着装擦边|姿态擦边|双关暗示/.test(h))
  const divertHit = hits.some((h) => /二维码|打码|联系方式|导流/.test(h))
  if (edge && divertHit) hits.push('色情导流风险')
  // 人物擦边出镜本身按抖音口径也要升风险（即使暂未见导流码）
  if (edge && !hits.includes('色情导流风险')) {
    hits.push('色情导流风险')
  }

  return [...new Set(hits)].filter(Boolean).slice(0, 16)
}

const FRAME_VISION_SYSTEM = `你是本地生活探店短视频合规审核助手（适用抖音/快手/视频号）。用户提供 1 张成片关键帧。
必须从严识别「低俗擦边 / 色情导流」视觉风险，对齐抖音专项口径：重点不是裸露，而是擦边出镜吸引流量。

请完成并只输出 JSON（不要 Markdown）：
{
  "ocrText":"帧内全部可见文字",
  "hasPerson":true或false,
  "attireRisk":"none|sheer_or_deep_neck|short_bottoms|both",
  "poseRisk":"none|bend_over|chest_closeup",
  "divertRisk":"none|qr_closeup|blur_point|contact_shown",
  "visualHits":["着装擦边等标准短语"],
  "visualNotes":"10-40字"
}

强制规则：
1. OCR：字幕/贴纸/价签/标题全部写入 ocrText。
2. 出镜人穿薄透白衣/明显透视、深V或大领口露出大片上胸 → attireRisk=sheer_or_deep_neck 或 both，visualHits 必含「着装擦边」。
3. 超短热裤突出身体 → attireRisk 含 short_bottoms，visualHits 必含「着装擦边」。
4. 弯腰俯拍导致领口敞开/胸口或臀部构图 → poseRisk=bend_over 或 chest_closeup，visualHits 必含「姿态擦边」。
5. 清晰二维码被特写/强调 → divertRisk=qr_closeup，visualHits 必含「二维码特写导流」。
6. 故意打码区+手指指认 → divertRisk=blur_point，visualHits 必含「打码指认导流」。
7. 画面露出微信号/手机号 → divertRisk=contact_shown，visualHits 必含「联系方式露出」。
8. 仅食物/货架无人出镜 → hasPerson=false，attire/pose 为 none。
9. 正常着装探店（不透、领口正常、无弯腰怼胸）→ attire/pose 可为 none；不要因「有美女出镜」误报。
10. 广告极限用语出现在画面文字时，visualHits 可附带该词原文。`

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
): Promise<{ ocrText: string; visualHits: string[]; visualNotes: string }> {
  const provider = (env.MERCHANT_AI_ICE_VERIFY_PROVIDER || env.MERCHANT_MP_AI_PROVIDER || 'doubao').trim()
  const model = (env.MERCHANT_AI_ICE_VERIFY_MODEL || '').trim() || undefined
  const prompt = `这是探店成片的${slotLabel(slot, atSec)}关键帧。请 OCR 全部可见文字，并按强制规则输出 attireRisk/poseRisk/divertRisk 与 visualHits（有擦边必须报，勿漏报）。`
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
    void voidRecordLlmTokenUsage(usageRecord ? { ...usageRecord, env } : { env }, {
      provider: res.provider || provider,
      model: res.model,
      usage: coerceLlmUsage(res.usage),
      inputText: `${FRAME_VISION_SYSTEM}\n${prompt}`,
      outputText: String(res.content ?? ''),
      token: usageRecord?.token,
    })
    const parsed = parseVisionComplianceJson(res.content || '')
    const ocrText = String(parsed?.ocrText || '').trim() || String(res.content || '').trim()
    const forced = forceHitsFromVisionFields(parsed || { ocrText })
    const ocrHits = localRiskScan(ocrText)
    const visualNotes = String(parsed?.visualNotes || '').trim()
    return {
      ocrText,
      visualHits: [...new Set([...forced, ...ocrHits])].slice(0, 16),
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

  // 口播双关：有人物向字幕常见夸赞时，留给视觉帧与 ASR 组合；ASR 单独命中双关+后续视觉擦边会在 core 合并
  if (/非常肥美|好大一只/.test(asrText)) {
    notes.push('口播含可能双关表述，将结合画面人物出镜综合判定')
  }

  const durationSec = framePack.ok ? framePack.durationSec : undefined
  let ocrText = ''
  let visualHits: string[] = []
  const frameSlotHits: VideoMediaComplianceExtract['frameSlotHits'] = []

  if (framePack.ok && framePack.frames.length) {
    notes.push(`已加密抽帧 ${framePack.frames.length} 张做画面检核`)
    const visionResults = await mapPool(framePack.frames, 3, async (f) => {
      const vision = await analyzeSingleFrame(
        f.slot,
        `data:image/jpeg;base64,${f.buffer.toString('base64')}`,
        env,
        usageRecord,
        'atSec' in f ? Number((f as { atSec?: number }).atSec) : undefined,
      )
      return { frame: f, vision }
    })

    const ocrParts: string[] = []
    for (const { frame: f, vision } of visionResults) {
      if (vision.ocrText) ocrParts.push(`【${f.slot}】${vision.ocrText}`)
      const slotOcr = String(vision.ocrText || '').trim()
      const slotHits = vision.visualHits.length ? vision.visualHits : localRiskScan(slotOcr)
      if (slotOcr || slotHits.length) {
        frameSlotHits.push({ slot: f.slot, hits: slotHits, ocrText: slotOcr })
      }
      if (vision.visualHits.length) visualHits.push(...vision.visualHits)
      if (vision.visualNotes) notes.push(`${slotLabel(f.slot)}：${vision.visualNotes}`)
    }
    ocrText = ocrParts.join('\n')
    if (ocrText.length >= 4) notes.push('已 OCR 画面字幕/贴纸文字')
    else notes.push('画面 OCR 未提取到有效文字')

    // ASR 双关 + 任意帧着装/姿态擦边 → 升色情导流
    const edgeVisual = visualHits.some((h) => /着装擦边|姿态擦边/.test(h))
    if (edgeVisual && /非常肥美|好大一只|duang大/i.test(asrText)) {
      visualHits.push('双关暗示话术', '色情导流风险')
    }
  } else {
    notes.push(
      framePack.ok ? '未能截取关键帧' : `关键帧截取失败：${'message' in framePack ? framePack.message : '未知'}`,
    )
  }

  const mergedVisual = [...new Set(visualHits)].slice(0, 16)
  if (mergedVisual.some((h) => VISION_FORCE_HIT_PHRASES.some((p) => h.includes(p)))) {
    notes.push(`画面视觉命中：${mergedVisual.filter((h) => VISION_FORCE_HIT_PHRASES.some((p) => h.includes(p))).join('、')}`)
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
