/**
 * 短视频：可灵 JWT + 异步任务轮询（仅 Vite Node 中间层）。
 * Seedance（豆包）：火山方舟 /api/v3/contents/generations/tasks + 查询任务。
 */
import type { ServerResponse } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

import { applyRegistryVendorKeysToMerchantEnv } from './merchantRegistryVendorEnv.js'
import type { RegistryFile } from '../src/lib/opsRegistryTypes.js'
import {
  isArkQuotaHopableError,
  isQwenVideoModelHopableError,
  isQwenVideoTaskId,
  stripQwenVideoTaskPrefix,
  wrapQwenVideoTaskId,
} from '../src/lib/arkModelCatalog.js'
import { qwenVideoModelCandidates, qwenDhS2vModelCandidates } from '../src/lib/qwenVisionCatalog.js'
import {
  buildQwenVisionVideoRequest,
  buildQwenDhS2vRequest,
  isQwenDhS2vCompatibleModel,
  isQwenSingleFrameI2vModel,
  isQwenWan27I2vModel,
  isQwenWan27VideoModel,
  sortQwenSingleFrameI2vModels,
} from '../src/lib/qwenVisionApi.js'
import { normalizePortraitBufferForS2v } from './dhS2vPortraitNormalize.js'
import {
  DEFAULT_SEEDANCE_VIDEO_MODEL_ID,
  describeArkVideoSetupIssue,
  isArkVideoEndpointId,
  isDoubaoSeedanceModelId,
  listArkVideoModelsForPicker,
  looksLikeArkPlaceholderEndpointId,
  looksLikeDoubaoChatModelId,
  normalizeArkVideoModelParam,
  parseSeedanceCliFlags,
  stripSeedanceDurFlag,
} from '../src/lib/arkVideoEndpointsConfig.js'
import {
  parseVideoDurationFromFlags,
  resolveSeedancePayloadDuration,
  videoModelSupportsDuration,
  clampI2vImagesForApi,
  parseI2vMaxImagesFromBody,
  type VideoGenMode,
} from '../src/lib/videoModelDuration.js'
import { buildArkVideoModelTryOrder, isArkVideoFailoverError } from '../src/lib/arkVideoModelRouter.js'
import { applyRegistryVideoAiToMerchantEnv } from './registryVideoAiEnvMerge.js'
import {
  anyLongformPlannerConfigured,
  longformPlannerModelIds,
  longformPlannerVendorAvailability,
  longformPlannerVendorSlots,
  LONGFORM_PLANNER_FAILOVER_ORDER_LABEL,
  runLongformPlannerWithSlotFailover,
  type LongformPlannerVendorId,
  merchantChatCompletion,
  type MerchantAiEnv,
} from './merchantAiUpstream.js'
import {
  recordAiTokenUsageFromHttpRequest,
  estimateVideoGenerationTokens,
} from './aiTokenUsageCore.js'
import { handleAliyunIceRoutes } from './aliyunIceGateway.js'
import { concatLocalMp4Buffers, concatRemoteMp4Urls, extractLastFrameJpegFromUrl } from './videoConcatServer.js'
import {
  clampSeedanceContentText,
  extractShortVideoNarrationScript,
  sanitizePromptForVideoModel,
  SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX,
  SEEDANCE_I2V_MAX_CONTENT_TEXT,
  SEEDANCE_EMERGENCY_I2V_PROMPT,
} from '../src/lib/shortVideoNarrationExtract.js'
import { appendAspectToVideoPrompt } from '../src/lib/shortVideoRenderFlags.js'
import {
  buildPlanFromScriptRows,
  buildVideoPromptFromScriptRow,
  scriptSegmentsFromPayload,
  scriptRowsFromLongformSegments,
  scriptRowsFromVideoPrompts,
  parseScriptRowsFromPlainText,
  isScriptRowsUsable,
  scriptRowsHaveExplicitTimeRanges,
  effectiveScriptRowCount,
  segmentCountFromTargetTotalSec,
  resolveLongformPlannerParams,
  maxScriptTimeRangeEndSec,
  expandScriptRowsFromGuidance,
  finalizePlannedScriptRows,
  validateStoryboardRows,
  scriptRowsFullyFilled,
  ensureScriptRowsForTargetDuration,
} from '../src/lib/shortVideoScriptTable.js'
import { fetchRemoteVideoBuffer } from './videoDownloadProxyCore.js'

function tenantIdFromParsed(parsed: Record<string, unknown>): string | undefined {
  const t = parsed.tenantId ?? parsed.tenant_id
  return typeof t === 'string' && t.trim() ? t.trim() : undefined
}

function voidRecordVideoAiUsage(
  req: import('node:http').IncomingMessage | undefined,
  env: MerchantAiEnv,
  parsed: Record<string, unknown>,
  provider: string,
  model: string | undefined,
  usage?: Record<string, number> | null,
  inputText?: string,
  outputText?: string,
): void {
  void recordAiTokenUsageFromHttpRequest({
    req,
    env: env as Record<string, string>,
    provider,
    model,
    usage,
    tenantIdHint: tenantIdFromParsed(parsed),
    mpOrderId: typeof parsed.mpOrderId === 'string' ? parsed.mpOrderId : undefined,
    inputText,
    outputText,
  })
}

function applyRegistrySliceToVideoAiEnv(
  out: MerchantAiEnv,
  reg: Partial<Pick<RegistryFile, 'videoAi' | 'vendorKeys'>>,
): void {
  applyRegistryVideoAiToMerchantEnv(out, reg)
}

/**
 * 与环境变量合并：非空 env 优先生效；否则使用项目根 `.meoo-dev-sync/registry.json`
 * 运营管控台写入的 `videoAi` 与注册表内 `vendorKeys.doubao`。
 */
export function mergeVideoAiMerchantEnv(
  viteRoot: string | undefined,
  base: MerchantAiEnv,
): MerchantAiEnv {
  const out: MerchantAiEnv = { ...base }
  if (!viteRoot) return out
  const registryPath = path.join(path.resolve(viteRoot, '..', '..', '.meoo-dev-sync'), 'registry.json')
  try {
    if (!fs.existsSync(registryPath)) return out
    const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as Partial<RegistryFile>
    applyRegistrySliceToVideoAiEnv(out, reg)
    applyRegistryVendorKeysToMerchantEnv(out, reg.vendorKeys)
  } catch {
    return out
  }

  return out
}

/**
 * 本地 registry.json 之上，再合并 Supabase `ops_registry_snapshot`（与商品 AI 同源）。
 * 线上 Vercel 无 `.meoo-dev-sync` 时依赖此路径读取运营台「短视频 / 视频模型 API」绑定。
 */
export async function mergeVideoAiMerchantEnvWithSnapshot(
  viteRoot: string | undefined,
  base: MerchantAiEnv,
): Promise<MerchantAiEnv> {
  const out = mergeVideoAiMerchantEnv(viteRoot, base)
  try {
    const { loadRegistrySnapshotForServer } = await import('../src/lib/registrySnapshotServerLoad.js')
    const data = await loadRegistrySnapshotForServer(viteRoot)
    if (data) {
      applyRegistrySliceToVideoAiEnv(out, { videoAi: data.videoAi, vendorKeys: data.vendorKeys })
      applyRegistryVendorKeysToMerchantEnv(out, data.vendorKeys)
    }
  } catch {
    /* 未配 Supabase / erp-api 不可达时保留 .env / 本地 registry 结果 */
  }
  return out
}

export type ArkVideoModelOption = { label: string; endpointId: string }

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function arkApiV3Root(env: MerchantAiEnv): string {
  const raw = (env.MERCHANT_AI_DOUBAO_ARK_BASE ?? '').trim().replace(/\/$/, '')
  if (!raw) return 'https://ark.cn-beijing.volces.com/api/v3'
  if (raw.endsWith('/api/v3')) return raw
  return `${raw}/api/v3`
}

function doubaoBearerKey(env: MerchantAiEnv): string | null {
  const x = env.MERCHANT_AI_DOUBAO_KEY ?? env.ARK_API_KEY
  const t = (x ?? '').trim()
  return t || null
}

function arkCreateTaskHttpStatus(upstreamStatus?: number): number {
  if (upstreamStatus === 404) return 400
  if (upstreamStatus != null && upstreamStatus >= 400 && upstreamStatus < 600) return upstreamStatus
  return 400
}

function arkCreateTaskUserMessage(msg: string, endpointId: string, upstreamStatus?: number): string {
  if (looksLikeArkPlaceholderEndpointId(endpointId)) {
    return `视频推理接入点「${endpointId}」为占位示例，不可用。请到运营管控台「AI模型 → 短视频 API」或 Vercel 环境变量 MERCHANT_AI_ARK_VIDEO_ENDPOINTS 填写火山方舟控制台真实的 ep- 接入点（形如 ep-2024xxxxxxxx）。`
  }
  if (/does not support content generation/i.test(msg)) {
    const underlying = msg.match(/specified model\s+([^\s]+)/i)?.[1] ?? ''
    return (
      `当前所选接入点绑定了对话模型${underlying ? `（${underlying}）` : ''}，无法用于 Seedance 视频生成。` +
      `请在火山方舟控制台新建「Seedance / 视频生成」推理接入点（勿选 Doubao-Seed 对话模型），` +
      `或在运营台填写 Seedance 模型 ID，例如：Seedance 2.0|${DEFAULT_SEEDANCE_VIDEO_MODEL_ID}；` +
      `也可在 Vercel 设置 MERCHANT_AI_SEEDANCE_VIDEO_MODEL=${DEFAULT_SEEDANCE_VIDEO_MODEL_ID} 后重试。`
    )
  }
  if (looksLikeDoubaoChatModelId(endpointId)) {
    return (
      `「${endpointId}」为对话模型，不能用于视频生成。请改用 Seedance 模型（如 ${DEFAULT_SEEDANCE_VIDEO_MODEL_ID}）或 Seedance 专用 ep- 接入点。`
    )
  }
  if (/has not activated the model/i.test(msg)) {
    const modelId = msg.match(/model\s+([^\s.]+)/i)?.[1] ?? endpointId
    return (
      `当前 API Key 所属火山方舟账号尚未开通视频模型「${modelId}」。` +
      `请登录火山方舟控制台 → 模型广场 / 开通管理 → 找到 Seedance 并开通该模型（或创建基于已开通模型的推理接入点 ep-），` +
      `然后在运营台「短视频 API」填写已开通的模型 ID 或 ep（须与 API Key 同账号）。` +
      `控制台：https://console.volcengine.com/ark/region:ark+cn-beijing/model`
    )
  }
  if (/inference limit|Safe Experience Mode|model service has been paused/i.test(msg)) {
    const modelId =
      msg.match(/\*\*([^*]+)\*\*/)?.[1]?.trim() ||
      msg.match(/for the\s+\*?\*?([^\s*.]+)\*?\*?\s+model/i)?.[1]?.trim() ||
      msg.match(/model[「\s]+([^」\s.]+)/i)?.[1]?.trim() ||
      endpointId
    return (
      `火山方舟账号对 Seedance 模型「${modelId}」已达推理限额（安全体验模式），视频生成已暂停。` +
      `系统已尝试切换同账号其它 Seedance 模型；若仍失败请到火山方舟控制台关闭或调高「安全体验模式」，或开通正式计费。` +
      `控制台：https://console.volcengine.com/ark/region:ark+cn-beijing/model`
    )
  }
  if (upstreamStatus === 404 || /does not exist|not have access/i.test(msg)) {
    const kind = /^ep-/i.test(endpointId) ? '推理接入点 ep' : '模型'
    return `方舟视频${kind}无效或无权访问（${endpointId}）：${msg}。请在火山方舟控制台确认已开通 Seedance 视频服务，且与运营台配置的 API Key 为同一账号。`
  }
  return msg
}

const LONGFORM_PLAN_SYSTEM = `你是短视频编导。用户给的是「执导/制作指导文案」，不是口播稿原文。

【强制流程】
1. 必须先完整阅读 user 消息中「指导文案原文」全文（含 Markdown 分镜表、时间段、剪辑备注、旁白/字幕规范），理解商业信息、叙事顺序与全部镜头意图；
2. 阅读完成后，再输出 JSON；禁止未通读全文就规划，禁止只保留前几段示例时间段（如仅 0-2s、5-8s）就停止。

你需要拆成：
1. narration：自然口语口播稿（仅观众应听到的话，不含 AI 技巧、上传说明、分镜操作提示、参数设置）
2. segments：每段给 AI 视频模型的画面指令（prompt=画面/光线/构图，action=人物动作与运镜；不要写口播逐字稿）

硬性规则：
- 若任务指定目标总时长（如 15 秒），segments 的时间段必须从 0 秒连续覆盖至该总时长，最后一段 timeRange 的结束秒数须达到目标时长；不得只规划前几段（如仅 0-2s、5-8s）就停止。
- 指导文案中的表格每一行通常对应一段；须覆盖表内全部时间段（含 8-11s、11-13s、13-15s 等后段），不得遗漏。
- 各段 dialogue 与 narration 分段一致；无口播的段落 dialogue 可留空。
- 每段 prompt/action 合并为画面描述时须 ≥10 字；每段 dialogue 须 ≥6 字（无口播段写「（无口播）」），禁止留空。

只输出 JSON，不要 Markdown：
{"narration":"口播全文…","segments":[{"timeRange":"0-10秒","prompt":"画面…","action":"动作运镜…","dialogue":"该段口播…"},...]}`

const LONGFORM_PLAN_REVIEW_SYSTEM = `你是短视频分镜质检编导。输入包含「指导文案原文」与「当前分镜草稿 JSON」。

【强制任务】
1. 逐段检查：每段 timeRange、visual（画面）、dialogue（口播）必须全部非空；画面 ≥10 字，口播 ≥6 字（纯 B-roll 可写「（无口播）」）。
2. 时间段须与指导文案分镜表一一对应；若无完整表，则须从 0 秒连续覆盖至目标总时长，最后一段结束秒数须达到目标时长。
3. 补全所有空白段，删除重复/无效时间段，修正乱序或重叠。
4. 不得保留空行；不得输出占位符如「待填画面」。
5. 通读指导文案后再修正，确保各段画面/口播与原文意图一致。

只输出 JSON，不要 Markdown：
{"narration":"口播全文…","segments":[{"timeRange":"0-2秒","prompt":"画面…","action":"运镜…","dialogue":"口播…"},...]}`

const NARRATION_EXTRACT_SYSTEM = `你是短视频文案编辑。把用户的「执导/制作指导文案」改写成可直接 TTS 朗读的口播稿（中文）。
要求：只保留对观众说的话；删除 AI 生成技巧、上传参考图说明、分镜操作、模型/时长/画幅等技术描述、画面/运镜/人物/风格等制作说明。
若原文有「口播文案」「旁白」「字幕文案」等段落，只提取该段；若无明确口播，根据卖点写 2–4 句口语（约 40–120 字），勿照读分镜表。
只输出口播正文，不要 JSON、不要 markdown。`

const VIDEO_PROMPT_SUFFIX =
  '【画面约束】禁止在视频画面内渲染任何文字、字幕、标题、Logo 字样或乱码字符；口播与字幕由后期合成。'

function stripJsonFences(text: string): string {
  let t = text.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t)
  if (fenced) t = fenced[1]!.trim()
  t = t.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
  // 模型常在 JSON 前后加说明文字，取首个 {…} 或 […] 块
  const objStart = t.indexOf('{')
  const objEnd = t.lastIndexOf('}')
  const arrStart = t.indexOf('[')
  const arrEnd = t.lastIndexOf(']')
  if (objStart >= 0 && objEnd > objStart) {
    if (arrStart < 0 || objStart <= arrStart) return t.slice(objStart, objEnd + 1)
  }
  if (arrStart >= 0 && arrEnd > arrStart) return t.slice(arrStart, arrEnd + 1)
  return t
}

function fixCommonJsonSyntax(raw: string): string {
  return raw
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/\r\n/g, '\n')
}

function parseJsonLenient(raw: string): unknown | null {
  const base = fixCommonJsonSyntax(stripJsonFences(raw.trim()))
  const tries = [base]
  const s = base.indexOf('{')
  const e = base.lastIndexOf('}')
  if (s >= 0 && e > s) tries.push(base.slice(s, e + 1))
  const a0 = base.indexOf('[')
  const a1 = base.lastIndexOf(']')
  if (a0 >= 0 && a1 > a0) tries.push(base.slice(a0, a1 + 1))
  for (const candidate of tries) {
    try {
      return JSON.parse(candidate)
    } catch {
      /* next */
    }
  }
  return null
}

function extractLongformSegmentPrompt(row: unknown): string {
  if (typeof row === 'string') return row.trim()
  if (row && typeof row === 'object') {
    const o = row as Record<string, unknown>
    for (const k of ['prompt', 'text', 'content', 'description', 'script', 'scene', 'action']) {
      const v = o[k]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
  }
  return ''
}

function buildVideoPromptFromSegmentRow(row: unknown): string {
  if (typeof row === 'string') {
    const t = row.trim()
    return t.includes('【画面约束】') ? t : `${t}\n${VIDEO_PROMPT_SUFFIX}`
  }
  if (!row || typeof row !== 'object') return ''
  const o = row as Record<string, unknown>
  const timeRange = typeof o.timeRange === 'string' ? o.timeRange.trim() : ''
  const visual =
    (typeof o.prompt === 'string' && o.prompt.trim()) ||
    (typeof o.visual === 'string' && o.visual.trim()) ||
    (typeof o.scene === 'string' && o.scene.trim()) ||
    ''
  const action = typeof o.action === 'string' ? o.action.trim() : ''
  const camera = typeof o.camera === 'string' ? o.camera.trim() : ''
  const parts: string[] = []
  if (timeRange) parts.push(`【时段】${timeRange}`)
  if (visual) parts.push(`【画面】${visual}`)
  if (action) parts.push(`【动作运镜】${action}`)
  if (camera) parts.push(`【镜头】${camera}`)
  if (!parts.length) {
    if (action) {
      return `【动作运镜】${action}\n${VIDEO_PROMPT_SUFFIX}`
    }
    const fallback = extractLongformSegmentPrompt(row)
    if (!fallback) return ''
    return fallback.includes('【画面约束】') ? fallback : `${fallback}\n${VIDEO_PROMPT_SUFFIX}`
  }
  return `${parts.join('\n')}\n${VIDEO_PROMPT_SUFFIX}`
}

function extractNarrationFromPlanJson(j: Record<string, unknown>, segments: unknown[]): string {
  for (const k of ['narration', 'narrationScript', 'voiceover', 'voiceOver', 'script']) {
    const v = j[k]
    if (typeof v === 'string' && v.trim().length >= 4) return v.trim()
  }
  const lines: string[] = []
  for (const row of segments) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const d = o.dialogue ?? o.narration ?? o.voiceover
    if (typeof d === 'string' && d.trim()) lines.push(d.trim())
  }
  return lines.join('。').replace(/。+/g, '。').trim()
}

function normalizeLongformVideoPrompts(raw: unknown[], targetN: number): string[] | null {
  let prompts = raw.map(buildVideoPromptFromSegmentRow).filter((p) => p.length > 0)
  if (prompts.length < 2) return null
  if (targetN <= 0) {
    return prompts.length > 12 ? prompts.slice(0, 12) : prompts
  }
  if (prompts.length > targetN) prompts = prompts.slice(0, targetN)
  while (prompts.length < targetN) {
    prompts.push(prompts[prompts.length - 1]!)
  }
  return prompts
}

type LongformPlanScriptSegment = { timeRange: string; visual: string; dialogue: string }

type LongformPlanParsed = {
  prompts: string[]
  narrationScript: string
  scriptSegments: LongformPlanScriptSegment[]
}

function normalizeLongformSegmentsArray(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    const vals = Object.values(o).filter((v) => v != null)
    if (vals.length >= 2) return vals
  }
  return null
}

function toLongformScriptSegments(
  segs: unknown[],
  segmentSec: number,
): LongformPlanScriptSegment[] {
  return scriptRowsFromLongformSegments(segs, segmentSec).map((r) => ({
    timeRange: r.timeRange,
    visual: r.visual,
    dialogue: r.dialogue,
  }))
}

function parseLongformPlan(
  text: string,
  n: number,
  segmentSec: number,
  autoSegmentCount = false,
): LongformPlanParsed | null {
  const targetN = autoSegmentCount ? 0 : n
  const parsed = parseJsonLenient(text)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const j = parsed as Record<string, unknown>
    const segs = normalizeLongformSegmentsArray(j.segments ?? j.prompts ?? j.scenes ?? j.shots)
    if (segs) {
      const prompts = normalizeLongformVideoPrompts(segs, targetN)
      if (prompts) {
        const narrationScript = extractNarrationFromPlanJson(j, segs) || ''
        return {
          prompts,
          narrationScript,
          scriptSegments: toLongformScriptSegments(segs, segmentSec),
        }
      }
    }
  }
  if (Array.isArray(parsed)) {
    const prompts = normalizeLongformVideoPrompts(parsed, targetN)
    if (prompts) {
      return {
        prompts,
        narrationScript: '',
        scriptSegments: toLongformScriptSegments(parsed, segmentSec),
      }
    }
  }
  return null
}

function pickLongformPlannerSlotIndex(
  slots: ReturnType<typeof longformPlannerVendorSlots>,
  stage: 'draft' | 'review',
  reviewPass: number,
): number {
  if (!slots.length) return 0
  return stage === 'draft' ? 0 : reviewPass >= 2 ? 2 : 1
}

function buildLongformReviewUserMsg(
  overallPrompt: string,
  draftSegments: LongformPlanScriptSegment[],
  effectiveTargetSec: number,
  reviewPass: 1 | 2,
  issues?: string[],
): string {
  const draftJson = JSON.stringify(
    {
      narration: draftSegments.map((s) => s.dialogue.trim()).filter(Boolean).join('。'),
      segments: draftSegments.map((s) => ({
        timeRange: s.timeRange,
        prompt: s.visual,
        action: '',
        dialogue: s.dialogue,
      })),
    },
    null,
    2,
  )
  const issueBlock =
    issues?.length ? `\n\n【上轮问题】\n${issues.map((x) => `- ${x}`).join('\n')}` : ''
  const passLabel = reviewPass === 2 ? '第三轮（最终复核）' : '第二轮（检查补全）'
  return `【${passLabel}】请通读指导文案并修正下方分镜草稿。

--- 指导文案原文 ---
${overallPrompt}
--- 指导文案结束 ---

目标成片总时长：${effectiveTargetSec >= 10 ? `${effectiveTargetSec} 秒` : '按文案节奏'}。
${issueBlock}

--- 当前分镜草稿 ---
${draftJson}
--- 草稿结束 ---

请输出修正后的完整 JSON（每段画面与口播均须填满，时间段与指导文案一致或连续覆盖全片）。`
}

function segmentsToPlanResponse(
  segments: LongformPlanScriptSegment[],
  overallPrompt: string,
  effectiveTargetSec: number,
  _segmentSec: number,
  meta: {
    usedRuleBasedFallback?: boolean
    usedAiPlanner?: boolean
    plannerVendor?: import('./merchantAiUpstream.js').LongformPlannerVendorId
    plannerModelId?: string
    planStage?: string
    reviewPass?: number
    validationIssues?: string[]
  },
): Record<string, unknown> {
  const finalized = ensureScriptRowsForTargetDuration(
    finalizePlannedScriptRows(
      segments.map((s) => ({
        timeRange: s.timeRange,
        visual: s.visual,
        dialogue: s.dialogue,
      })),
      overallPrompt,
      effectiveTargetSec,
    ),
    effectiveTargetSec,
    _segmentSec,
  )
  const validation = validateStoryboardRows(finalized, effectiveTargetSec)
  const expandedDirect = buildPlanFromScriptRows(finalized, finalized.length)
  const prompts =
    expandedDirect?.prompts.map((p) =>
      p.includes('【画面约束】') ? p : `${p}\n${VIDEO_PROMPT_SUFFIX}`,
    ) ??
    finalized
      .map((r) => buildVideoPromptFromScriptRow(r))
      .filter((p) => p.length > 0)
      .map((p) => (p.includes('【画面约束】') ? p : `${p}\n${VIDEO_PROMPT_SUFFIX}`))
  return {
    ok: true,
    prompts,
    narrationScript: expandedDirect?.narrationScript ?? '',
    scriptSegments: finalized.map((r) => ({
      timeRange: r.timeRange,
      visual: r.visual,
      dialogue: r.dialogue,
    })),
    validationOk: validation.ok,
    validationIssues: validation.issues,
    rowsFullyFilled: scriptRowsFullyFilled(finalized),
    ...meta,
  }
}

/** AI 分镜 JSON 失败时：生成通用画面指令，禁止把执导全文拆段喂给视频模型 */
function fallbackSplitLongformPrompt(overallPrompt: string, n: number): string[] {
  const sanitized = sanitizePromptForVideoModel(overallPrompt)
  const hint =
    sanitized
      .replace(SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX, '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length >= 6 && !/^(基础设定|总时长|BGM|人物|风格|全局)/i.test(l))
      .slice(0, 2)
      .join('，')
      .slice(0, 180) || '品牌宣传短视频，明亮办公场景，人物自然互动'
  return Array.from({ length: n }, (_, i) => {
    const seg = `【画面】${hint}，第 ${i + 1}/${n} 段，镜头连贯衔接。\n${VIDEO_PROMPT_SUFFIX}`
    return seg.includes('【画面约束】') ? seg : `${seg}`
  })
}

function plannerVendorOrder(
  env: MerchantAiEnv,
  preferred: 'doubao' | 'qwen' | 'auto',
): ('doubao' | 'qwen')[] {
  const hasDoubao = !!doubaoBearerKey(env)
  const hasQwen = !!qwenBearerKey(env)
  const order: ('doubao' | 'qwen')[] = []
  if (preferred === 'auto') {
    if (hasQwen) order.push('qwen')
    if (hasDoubao) order.push('doubao')
  } else {
    if (preferred === 'doubao' && hasDoubao) order.push('doubao')
    if (preferred === 'qwen' && hasQwen) order.push('qwen')
    const alt: 'doubao' | 'qwen' = preferred === 'doubao' ? 'qwen' : 'doubao'
    if (alt === 'doubao' && hasDoubao && !order.includes('doubao')) order.push('doubao')
    if (alt === 'qwen' && hasQwen && !order.includes('qwen')) order.push('qwen')
  }
  return order
}

function klingBase(env: MerchantAiEnv): string {
  const b = (env.KLING_API_BASE ?? '').trim().replace(/\/$/, '')
  return b || 'https://api-beijing.klingai.com'
}

function seedanceVideoModelFromEnv(env: MerchantAiEnv): string {
  const fromEnv = String(
    (env as Record<string, string>).MERCHANT_AI_SEEDANCE_VIDEO_MODEL ?? '',
  ).trim()
  return fromEnv || DEFAULT_SEEDANCE_VIDEO_MODEL_ID
}

function parseArkVideoModelList(env: MerchantAiEnv): ArkVideoModelOption[] {
  const raw = (
    env.MERCHANT_AI_ARK_VIDEO_ENDPOINTS ??
    env.MERCHANT_AI_SEEDANCE_VIDEO_MODELS ??
    ''
  ).trim()
  const fb = String((env as Record<string, string>).MERCHANT_AI_ARK_VIDEO_FALLBACK_ENDPOINT ?? '').trim()
  return listArkVideoModelsForPicker(raw, fb, seedanceVideoModelFromEnv(env))
}

const SEEDANCE_SERVER_AUTO = '__server_auto__'

function resolvePreferredVideoModel(raw: unknown): string {
  const t = typeof raw === 'string' ? raw.trim() : ''
  if (!t || t === SEEDANCE_SERVER_AUTO) return ''
  return normalizeArkVideoModelParam(t)
}

function qwenBearerKey(env: MerchantAiEnv): string | null {
  const t = (env.MERCHANT_AI_QWEN_KEY ?? env.DASHSCOPE_API_KEY ?? '').trim()
  return t || null
}

function detectVideoInputMode(body: Record<string, unknown>): 't2v' | 'i2v' {
  const images = body.images_base64
  if (Array.isArray(images)) {
    for (const row of images) {
      if (typeof row === 'string' && row.trim()) return 'i2v'
    }
  }
  if (Array.isArray(body.content)) {
    for (const row of body.content) {
      if (row && typeof row === 'object' && String((row as { type?: unknown }).type) === 'image_url') {
        return 'i2v'
      }
    }
  }
  return 't2v'
}

function arkVideoModelCandidates(
  env: MerchantAiEnv,
  body: Record<string, unknown>,
  preferred?: string,
  durationSec?: number,
  preferQuotaStable?: boolean,
): string[] {
  const mode = detectVideoInputMode(body)
  const dur =
    typeof durationSec === 'number' && Number.isFinite(durationSec)
      ? Math.round(durationSec)
      : parseVideoDurationFromFlags(typeof body.flags === 'string' ? body.flags : '')
  const envRaw = (
    env.MERCHANT_AI_ARK_VIDEO_ENDPOINTS ??
    env.MERCHANT_AI_SEEDANCE_VIDEO_MODELS ??
    ''
  ).trim()
  const fromList = parseArkVideoModelList(env).map((m) => m.endpointId)
  return buildArkVideoModelTryOrder({
    envRaw,
    poolModels: fromList,
    preferred,
    durationSec: dur,
    mode,
    preferQuotaStable,
  })
}

function qwenVideoCandidatesFromEnv(env: MerchantAiEnv, mode: 't2v' | 'i2v'): string[] {
  const e = env as Record<string, string | undefined>
  return qwenVideoModelCandidates(
    e.MERCHANT_AI_QWEN_VIDEO_MODELS ?? e.MERCHANT_AI_QWEN_VISION_MODELS,
    e.MERCHANT_AI_QWEN_VIDEO_MODEL,
    mode,
  )
}

function firstImageUrlFromBody(body: Record<string, unknown>): string | undefined {
  const images = body.images_base64
  if (Array.isArray(images)) {
    for (const row of images) {
      if (typeof row !== 'string') continue
      const t = row.trim()
      if (!t) continue
      if (t.startsWith('data:image') || /^https?:\/\//i.test(t)) return t
      return `data:image/jpeg;base64,${t.replace(/\s/g, '')}`
    }
  }
  return undefined
}

function parseImageRefToBuffer(
  imgUrl: string,
): { buffer: Buffer; contentType: string; fileName: string } | null {
  const t = imgUrl.trim()
  if (!t) return null
  const dataMatch = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(t)
  if (dataMatch) {
    const contentType = dataMatch[1]!.toLowerCase()
    const b64 = dataMatch[2]!.replace(/\s/g, '')
    if (!b64) return null
    const buffer = Buffer.from(b64, 'base64')
    if (!buffer.length) return null
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
    return { buffer, contentType, fileName: `qwen-i2v-${Date.now()}.${ext}` }
  }
  if (/^https?:\/\//i.test(t)) return null
  const pure = t.replace(/\s/g, '')
  if (!/^[a-z0-9+/=]+$/i.test(pure)) return null
  const buffer = Buffer.from(pure, 'base64')
  if (!buffer.length) return null
  return { buffer, contentType: 'image/jpeg', fileName: `qwen-i2v-${Date.now()}.jpg` }
}

async function ensurePublicHttpsImageUrl(
  viteRoot: string | undefined,
  env: MerchantAiEnv,
  imgUrl: string,
): Promise<string | null> {
  const t = imgUrl.trim()
  if (/^https?:\/\//i.test(t)) return t
  const parsed = parseImageRefToBuffer(t)
  if (!parsed) return null
  try {
    const { loadIceGatewayConfig } = await import('./aliyunIceGateway.js')
    const { putIceSourceObject } = await import('./aliyunOssIceUpload.js')
    const cfg = await loadIceGatewayConfig(viteRoot ?? process.cwd(), env as Record<string, string | undefined>)
    if (!cfg) return null
    const put = await putIceSourceObject(cfg, env as Record<string, string | undefined>, {
      fileName: parsed.fileName,
      contentType: parsed.contentType,
      buffer: parsed.buffer,
    })
    return put.ok ? put.mediaUrl : null
  } catch {
    return null
  }
}

function extractQwenApiErrorMessage(j: Record<string, unknown>, fallback: string): string {
  const direct = typeof j.message === 'string' ? j.message.trim() : ''
  if (direct) return direct
  const code = typeof j.code === 'string' ? j.code.trim() : ''
  if (code) return code
  const details = j.details
  if (Array.isArray(details)) {
    for (const row of details) {
      if (!row || typeof row !== 'object') continue
      const msg = (row as { message?: unknown }).message
      if (typeof msg === 'string' && msg.trim()) return msg.trim()
    }
  }
  return fallback
}

function isQwenVideoTaskHopableError(msg: string): boolean {
  return isArkQuotaHopableError(msg) || isQwenVideoModelHopableError(msg)
}

function parseQwenVideoTaskPoll(j: Record<string, unknown>): ArkPollState {
  const output = j.output as Record<string, unknown> | undefined
  const status = String(output?.task_status ?? j.task_status ?? '').toUpperCase()
  const videoUrl = extractQwenVideoTaskUrl(j)
  if (status === 'SUCCEEDED' && videoUrl) {
    return { phase: 'succeeded', statusLabel: status, videoUrl }
  }
  if (status === 'SUCCEEDED') {
    /** 云端已标记成功但 video_url 可能延迟数秒写入，继续轮询且勿展示误导性 SUCCEEDED */
    return { phase: 'running', statusLabel: '收尾中（等待视频地址）', videoUrl: undefined }
  }
  if (status === 'FAILED' || status === 'UNKNOWN') {
    const failReason =
      (typeof output?.message === 'string' && output.message) ||
      (typeof j.message === 'string' && j.message) ||
      '千问视频任务失败'
    return { phase: 'failed', statusLabel: status, failReason }
  }
  const phase: ArkPollPhase =
    status === 'PENDING' || status === 'QUEUED' || status === 'SUBMITTED' ? 'queued' : 'running'
  return { phase, statusLabel: status || 'RUNNING', videoUrl: videoUrl || undefined }
}

/** 单次查询千问异步任务（供客户端轮询；禁止在 status 接口内阻塞长轮询） */
async function qwenGetVideoTaskOnce(apiKey: string, taskId: string): Promise<ArkPollState> {
  const url = `https://dashscope.aliyuncs.com/api/v1/tasks/${encodeURIComponent(taskId)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
  const j = await readJsonResponse(res)
  if (!res.ok) {
    const msg = (typeof j.message === 'string' && j.message) || `千问任务查询 HTTP ${res.status}`
    throw new Error(msg)
  }
  return parseQwenVideoTaskPoll(j)
}

async function qwenPostVideoTask(
  env: MerchantAiEnv,
  body: Record<string, unknown>,
  viteRoot?: string,
): Promise<{ ok: false; msg: string } | { ok: true; taskId: string; modelUsed: string }> {
  const key = qwenBearerKey(env)
  if (!key) {
    return {
      ok: false,
      msg: '未配置通义千问 Key，无法切换千问视频。请在运营台配置 MERCHANT_AI_QWEN_KEY 或 DASHSCOPE_API_KEY。',
    }
  }
  const mode = detectVideoInputMode(body)
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  const flags = parseSeedanceCliFlags(typeof body.flags === 'string' ? body.flags : '')
  const durationSec = flags.duration ?? parseVideoDurationFromFlags(typeof body.flags === 'string' ? body.flags : '')
  const rawImgUrl = mode === 'i2v' ? firstImageUrlFromBody(body) : undefined
  if (mode === 'i2v' && !rawImgUrl) {
    return { ok: false, msg: '图生视频缺少参考图，无法切换千问 i2v 模型。' }
  }
  if (!prompt && mode === 't2v') {
    return { ok: false, msg: '文生视频缺少提示词。' }
  }

  let lastMsg = '千问视频生成失败'
  const reqModel = typeof body.model === 'string' ? body.model.trim() : ''
  const fromEnv = qwenVideoCandidatesFromEnv(env, mode).filter((id) =>
    videoModelSupportsDuration(id, durationSec, mode),
  )
  let candidates = fromEnv
  if (
    reqModel &&
    reqModel !== SEEDANCE_SERVER_AUTO &&
    !isDoubaoSeedanceModelId(reqModel) &&
    !isArkVideoEndpointId(reqModel) &&
    videoModelSupportsDuration(reqModel, durationSec, mode)
  ) {
    candidates = [reqModel, ...fromEnv.filter((id) => id !== reqModel)]
  }
  if (mode === 'i2v') {
    candidates = candidates.filter((id) => isQwenSingleFrameI2vModel(id))
    candidates = sortQwenSingleFrameI2vModels(candidates)
    const preferQuotaStable =
      body.prefer_quota_stable === true || String(body.prefer_quota_stable ?? '').trim() === 'true'
    if (preferQuotaStable) {
      candidates = candidates.filter((id) => !isQwenWan27VideoModel(id))
    }
  }
  for (const modelId of candidates) {
    let imgUrl = rawImgUrl
    const needsWan27Media = isQwenWan27VideoModel(modelId) && isQwenWan27I2vModel(modelId)
    if (needsWan27Media) {
      const publicUrl = await ensurePublicHttpsImageUrl(viteRoot, env, imgUrl!)
      if (!publicUrl) {
        lastMsg =
          '千问 wan2.7 图生视频需要公网 https 参考图，临时上传 OSS 失败。请在运营台配置云剪 OSS 前缀后重试。'
        continue
      }
      imgUrl = publicUrl
    }
    if (mode === 'i2v' && needsWan27Media && !imgUrl) continue
    const built = buildQwenVisionVideoRequest(modelId, prompt, {
      imgUrl,
      duration: durationSec,
      ratio: flags.ratio,
    })
    if (needsWan27Media) {
      const input = built.body.input as Record<string, unknown> | undefined
      const media = input?.media
      if (!Array.isArray(media) || media.length === 0) continue
    }
    try {
      const res = await fetch(built.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable',
        },
        body: JSON.stringify(built.body),
      })
      const j = await readJsonResponse(res)
      if (!res.ok) {
        lastMsg = extractQwenApiErrorMessage(j, `千问视频创建失败 HTTP ${res.status}`)
        if (!isQwenVideoTaskHopableError(lastMsg)) continue
        continue
      }
      const output = j.output as Record<string, unknown> | undefined
      const taskId = String(output?.task_id ?? j.task_id ?? '').trim()
      if (!taskId) {
        lastMsg = '千问视频未返回 task_id'
        continue
      }
      return { ok: true, taskId, modelUsed: modelId }
    } catch (e) {
      lastMsg = e instanceof Error ? e.message : String(e)
      if (!isQwenVideoTaskHopableError(lastMsg)) continue
    }
  }
  return {
    ok: false,
    msg: `${lastMsg}。豆包视频模型额度已用尽或不可用，已尝试切换千问视频模型仍失败；请充值火山方舟或百炼账户后重试。`,
  }
}

function parseMediaRefToBuffer(
  raw: string,
  defaultMime: string,
  defaultExt: string,
): { buffer: Buffer; contentType: string; fileName: string } | null {
  const t = raw.trim()
  if (!t) return null
  const dataMatch = /^data:([^;]+);base64,(.+)$/i.exec(t)
  if (dataMatch) {
    const contentType = dataMatch[1]!.toLowerCase()
    const b64 = dataMatch[2]!.replace(/\s/g, '')
    if (!b64) return null
    const buffer = Buffer.from(b64, 'base64')
    if (!buffer.length) return null
    const ext = contentType.includes('mpeg') || contentType.includes('mp3') ? 'mp3' : defaultExt
    return { buffer, contentType, fileName: `dh-s2v-${Date.now()}.${ext}` }
  }
  if (/^https?:\/\//i.test(t)) return null
  const pure = t.replace(/\s/g, '')
  if (!/^[a-z0-9+/=]+$/i.test(pure)) return null
  const buffer = Buffer.from(pure, 'base64')
  if (!buffer.length) return null
  return {
    buffer,
    contentType: defaultMime,
    fileName: `dh-s2v-${Date.now()}.${defaultExt}`,
  }
}

async function ensurePublicHttpsMediaUrl(
  viteRoot: string | undefined,
  env: MerchantAiEnv,
  raw: string,
  kind: 'image' | 'audio',
  opts?: { normalizeS2vPortrait?: boolean; frameMode?: 'half' | 'full' },
): Promise<string | null> {
  const t = raw.trim()
  if (/^https?:\/\//i.test(t)) return t
  const parsed =
    kind === 'image'
      ? parseImageRefToBuffer(t)
      : parseMediaRefToBuffer(t, 'audio/mpeg', 'mp3')
  if (!parsed) return null
  let upload = parsed
  if (kind === 'image' && opts?.normalizeS2vPortrait) {
    upload = await normalizePortraitBufferForS2v(
      parsed.buffer,
      parsed.contentType,
      parsed.fileName,
      opts.frameMode === 'full' ? 'full' : 'half',
    )
  }
  try {
    const { loadIceGatewayConfig } = await import('./aliyunIceGateway.js')
    const { putIceSourceObject } = await import('./aliyunOssIceUpload.js')
    const cfg = await loadIceGatewayConfig(viteRoot ?? process.cwd(), env as Record<string, string | undefined>)
    if (!cfg) return null
    const put = await putIceSourceObject(cfg, env as Record<string, string | undefined>, {
      fileName: upload.fileName,
      contentType: upload.contentType,
      buffer: upload.buffer,
    })
    return put.ok ? put.mediaUrl : null
  } catch {
    return null
  }
}

async function qwenPostS2vVideoTask(
  env: MerchantAiEnv,
  body: Record<string, unknown>,
  viteRoot?: string,
): Promise<{ ok: false; msg: string } | { ok: true; taskId: string; modelUsed: string }> {
  const key = qwenBearerKey(env)
  if (!key) {
    return {
      ok: false,
      msg: '未配置通义千问 Key，无法使用 wan2.2-s2v 口型驱动。请在运营台配置 MERCHANT_AI_QWEN_KEY。',
    }
  }
  const imageRaw =
    (typeof body.image_base64 === 'string' && body.image_base64.trim()) ||
    (Array.isArray(body.images_base64) &&
      typeof body.images_base64[0] === 'string' &&
      body.images_base64[0].trim()) ||
    ''
  const audioRaw = typeof body.audio_base64 === 'string' ? body.audio_base64.trim() : ''
  if (!imageRaw) {
    return { ok: false, msg: '口型驱动缺少人像参考图，请先选择形象或上传正面照片。' }
  }
  if (!audioRaw) {
    return { ok: false, msg: '口型驱动缺少口播音频。' }
  }
  const resolution =
    body.resolution === '480P' || body.resolution === '720P' ? body.resolution : '720P'
  const frameMode = body.frame_mode === 'full' ? 'full' : 'half'
  const imageUrl = await ensurePublicHttpsMediaUrl(viteRoot, env, imageRaw, 'image', {
    normalizeS2vPortrait: true,
    frameMode,
  })
  if (!imageUrl) {
    return {
      ok: false,
      msg: '人像参考图上传 OSS 失败。请在运营台「短视频 API」配置云剪 OSS 前缀后重试。',
    }
  }
  const audioUrl = await ensurePublicHttpsMediaUrl(viteRoot, env, audioRaw, 'audio')
  if (!audioUrl) {
    return {
      ok: false,
      msg: '口播音频上传 OSS 失败。请在运营台配置云剪 OSS 前缀后重试。',
    }
  }
  const e = env as Record<string, string | undefined>
  const envRaw = (e.MERCHANT_AI_QWEN_VIDEO_MODELS ?? e.MERCHANT_AI_QWEN_VISION_MODELS ?? '').trim()
  const preferred = (e.MERCHANT_AI_QWEN_PORTRAIT_MODEL ?? 'wan2.2-s2v').trim()
  const candidates = qwenDhS2vModelCandidates(envRaw, preferred).filter(isQwenDhS2vCompatibleModel)

  let lastMsg = '千问口型驱动失败'
  const tried: string[] = []

  for (const modelId of candidates) {
    tried.push(modelId)
    let built: { url: string; body: Record<string, unknown> }
    try {
      built = await buildQwenDhS2vRequest(key, modelId, {
        imageUrl,
        audioUrl,
        resolution,
        frameMode,
      })
    } catch (e) {
      lastMsg = e instanceof Error ? e.message : String(e)
      if (!isQwenVideoTaskHopableError(lastMsg)) continue
      continue
    }
    try {
      const res = await fetch(built.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable',
        },
        body: JSON.stringify(built.body),
      })
      const j = await readJsonResponse(res)
      if (!res.ok) {
        lastMsg = extractQwenApiErrorMessage(j, `千问口型驱动创建失败 HTTP ${res.status}`)
        if (!isQwenVideoTaskHopableError(lastMsg)) continue
        continue
      }
      const output = j.output as Record<string, unknown> | undefined
      const taskId = String(output?.task_id ?? j.task_id ?? '').trim()
      if (!taskId) {
        lastMsg = '千问口型驱动未返回 task_id'
        continue
      }
      return { ok: true, taskId, modelUsed: modelId }
    } catch (e) {
      lastMsg = e instanceof Error ? e.message : String(e)
      if (!isQwenVideoTaskHopableError(lastMsg)) continue
    }
  }

  const summary =
    tried.length > 1
      ? `${lastMsg}（已依次尝试 ${tried.length} 个千问口型模型：${tried.slice(0, 6).join(' → ')}${tried.length > 6 ? '…' : ''}）`
      : lastMsg
  return { ok: false, msg: summary }
}

function signKlingJwt(accessKey: string, secretKey: string): string {
  const headers = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const payload = Buffer.from(
    JSON.stringify({
      iss: accessKey,
      sub: accessKey,
      iat: now,
      exp: now + 1800,
      nbf: now - 5,
    }),
  ).toString('base64url')
  const signingInput = `${headers}.${payload}`
  const sig = crypto.createHmac('sha256', secretKey).update(signingInput).digest('base64url')
  return `${signingInput}.${sig}`
}

function extractKlingApiMessage(j: Record<string, unknown>): string {
  const data = j.data
  const dataObj =
    data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null
  const candidates = [
    j.message,
    j.msg,
    j.error,
    j.error_message,
    dataObj?.message,
    dataObj?.msg,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return ''
}

function orderedKlingApiBases(env: MerchantAiEnv): string[] {
  const custom = (env.KLING_API_BASE ?? '').trim().replace(/\/$/, '')
  const pool = custom
    ? [custom, 'https://api-beijing.klingai.com', 'https://api.klingai.com']
    : ['https://api-beijing.klingai.com', 'https://api.klingai.com']
  const out: string[] = []
  for (const b of pool) {
    if (b && !out.includes(b)) out.push(b)
  }
  return out
}

function klingUpstreamUserMessage(
  status: number,
  j: Record<string, unknown>,
  apiBase: string,
): { message: string; httpStatus: number } {
  const code = j.code ?? j.error_code
  const msg = extractKlingApiMessage(j)
  const baseHint = apiBase.includes('beijing') ? '国内节点' : '国际节点'

  if (
    status === 429 ||
    status === 402 ||
    /balance|额度|余额|不足|quota|rate limit|resource exhausted/i.test(msg)
  ) {
    return {
      httpStatus: 402,
      message:
        `可灵账户余额或套餐额度不足（${baseHint}，HTTP ${status}${msg ? `：${msg}` : ''}）。` +
        '密钥已生效，请到 app.klingai.com 控制台为对应 Access Key 充值/开通视频额度后重试。',
    }
  }

  if (status === 401 || /auth|unauthorized|invalid token/i.test(msg)) {
    return {
      httpStatus: 401,
      message:
        `可灵鉴权失败（${baseHint}，HTTP ${status}${msg ? `：${msg}` : ''}${code != null ? `，code=${code}` : ''}）。` +
        '国内账号请设置 KLING_API_BASE=https://api-beijing.klingai.com；核对 AK/SK 勿填反、勿含空格。',
    }
  }

  return {
    httpStatus: status >= 400 && status < 600 ? status : 502,
    message: msg ? `${msg}（${baseHint} HTTP ${status}）` : `可灵接口错误 HTTP ${status}（${baseHint}）`,
  }
}

function pickKlingCreds(env: MerchantAiEnv): { ok: false; msg: string } | { ok: true; jwt: string } {
  const ak = (env.KLING_ACCESS_KEY ?? '').trim().replace(/\s+/g, '')
  const sk = (env.KLING_SECRET_KEY ?? '').trim().replace(/\s+/g, '')
  if (!ak || !sk) {
    return {
      ok: false,
      msg:
        '未配置可灵鉴权：请到运营管控台「AI模型 → 短视频 / 视频模型 API」维护 Access Key 与 Secret，或在服务端环境变量 KLING_ACCESS_KEY / KLING_SECRET_KEY 配置。',
    }
  }
  return { ok: true, jwt: signKlingJwt(ak, sk) }
}

async function readJsonResponse(res: globalThis.Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

function looksLikePlayableVideoUrl(raw: string): boolean {
  const t = raw.trim()
  if (!/^https?:\/\/\S+/i.test(t)) return false
  if (/\.(mp4|webm|mov)(\?\S*)?$/i.test(t)) return true
  if (/blob|vod|tos|tos-cn|cdn|video|seedance|dashscope|aliyuncs|oss-/i.test(t)) return true
  return false
}

/** 千问异步视频任务：output 字段名因模型版本而异 */
function extractQwenVideoTaskUrl(j: Record<string, unknown>): string | undefined {
  const output = j.output as Record<string, unknown> | undefined
  if (!output) return extractHttpVideoUrl(j)

  const direct = normalizeHttpUrl(output.video_url) || normalizeHttpUrl(output.videoUrl)
  if (direct) return direct

  const results = output.results
  if (results && typeof results === 'object' && !Array.isArray(results)) {
    const ro = results as Record<string, unknown>
    const nested = normalizeHttpUrl(ro.video_url) || normalizeHttpUrl(ro.videoUrl)
    if (nested) return nested
  }
  if (Array.isArray(results)) {
    for (const row of results) {
      if (!row || typeof row !== 'object') continue
      const ro = row as Record<string, unknown>
      const nested =
        normalizeHttpUrl(ro.url) || normalizeHttpUrl(ro.video_url) || normalizeHttpUrl(ro.videoUrl)
      if (nested) return nested
    }
  }

  const choices = output.choices
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      if (!choice || typeof choice !== 'object') continue
      const msg = (choice as Record<string, unknown>).message
      if (!msg || typeof msg !== 'object') continue
      const content = (msg as Record<string, unknown>).content
      if (!Array.isArray(content)) continue
      for (const part of content) {
        if (!part || typeof part !== 'object') continue
        const po = part as Record<string, unknown>
        const nested =
          normalizeHttpUrl(po.video) ||
          normalizeHttpUrl(po.url) ||
          normalizeHttpUrl(po.video_url) ||
          normalizeHttpUrl(po.videoUrl)
        if (nested) return nested
      }
    }
  }

  return extractHttpVideoUrl(j)
}

/** 从方舟「查询视频任务」等大 JSON 中提取 mp4/https 播放地址（字段名多端差异较大） */
function extractHttpVideoUrl(depth: unknown, dep = 0): string | undefined {
  if (dep > 12) return undefined
  if (typeof depth === 'string') {
    return looksLikePlayableVideoUrl(depth) ? depth.trim() : undefined
  }
  if (!depth || typeof depth !== 'object') return undefined
  if (Array.isArray(depth)) {
    for (const x of depth) {
      const u = extractHttpVideoUrl(x, dep + 1)
      if (u) return u
    }
    return undefined
  }
  const o = depth as Record<string, unknown>
  for (const k of [
    'video_url',
    'videoUrl',
    'preview_video_url',
    'previewVideoUrl',
    'output_url',
    'outputUrl',
    'url',
  ]) {
    const u = extractHttpVideoUrl(o[k], dep + 1)
    if (u) return u
  }
  for (const v of Object.values(o)) {
    const u = extractHttpVideoUrl(v, dep + 1)
    if (u) return u
  }
  return undefined
}

function normalizeHttpUrl(s: unknown): string | null {
  if (typeof s !== 'string') return null
  const t = s.trim()
  if (!/^https?:\/\/\S+/i.test(t)) return null
  return t
}

function klingData(obj: Record<string, unknown>): Record<string, unknown> | null {
  const d = obj.data
  return d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, unknown>) : null
}

function unwrapKlingTask(obj: Record<string, unknown>): {
  taskId?: string
  taskStatus?: string
  videoUrl?: string
  rawMessage?: string
} {
  const nested = klingData(obj) ?? {}
  const tidPick = nested.task_id ?? obj.task_id
  const taskId = typeof tidPick === 'string' ? tidPick : undefined
  const tstPick = nested.task_status ?? obj.task_status
  const taskStatus = typeof tstPick === 'string' ? tstPick : undefined
  const tr = nested.task_result
  if (tr && typeof tr === 'object' && !Array.isArray(tr)) {
    const videos = (tr as { videos?: unknown }).videos
    if (Array.isArray(videos) && videos[0] && typeof videos[0] === 'object') {
      const u = normalizeHttpUrl((videos[0] as { url?: unknown }).url)
      if (u) return { taskId, taskStatus, videoUrl: u }
    }
  }
  const message = typeof obj.message === 'string' ? obj.message : undefined
  return { taskId, taskStatus, rawMessage: message }
}

function buildArkVideoTaskPayload(
  modelId: string,
  body: Record<string, unknown>,
  mode: VideoGenMode = 't2v',
): { ok: false; msg: string } | { ok: true; payload: Record<string, unknown> } {
  const promptRaw = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  const extraFlags = typeof body.flags === 'string' ? body.flags.trim() : ''
  const prompt = appendAspectToVideoPrompt(promptRaw, extraFlags)
  const imagesUnknown = body.images_base64
  const useSeedanceV2 = isDoubaoSeedanceModelId(modelId)
  const flagParsed = parseSeedanceCliFlags(extraFlags)
  const requestedDur =
    flagParsed.duration != null && Number.isFinite(flagParsed.duration)
      ? Math.round(flagParsed.duration)
      : undefined

  /** ep 接入点仅支持默认约 5 秒；长视频 10s/段须走 Seedance v2 或千问 */
  if (
    !useSeedanceV2 &&
    requestedDur != null &&
    requestedDur !== 5 &&
    (isArkVideoEndpointId(modelId) || !isDoubaoSeedanceModelId(modelId))
  ) {
    return {
      ok: false,
      msg: `方舟接入点 ${modelId} 不支持 ${requestedDur} 秒自定义时长`,
    }
  }

  let contentArr: Record<string, unknown>[]
  if (Array.isArray(body.content)) {
    contentArr = body.content as Record<string, unknown>[]
  } else {
    const imageRows: string[] = []
    if (Array.isArray(imagesUnknown)) {
      for (const row of imagesUnknown) {
        if (typeof row !== 'string') continue
        const t = row.trim()
        if (t) imageRows.push(t)
      }
    }
    let textCombined = useSeedanceV2
      ? prompt
      : `${prompt}${extraFlags ? ` ${extraFlags}` : ''}`.trim()
    if (!textCombined && imageRows.length > 0) {
      textCombined = '按上传的画面生成连贯短视频。'
    }
    if (!textCombined) {
      return { ok: false, msg: '请填写提示词，或上传至少一张参考图。' }
    }
    /** ep 图生视频不支持 --dur 自定义时长 */
    if (!useSeedanceV2 && imageRows.length > 0 && extraFlags) {
      const flagsNoDur = stripSeedanceDurFlag(extraFlags)
      textCombined = `${prompt}${flagsNoDur ? ` ${flagsNoDur}` : ''}`.trim()
    }
    textCombined = clampSeedanceContentText(
      textCombined,
      imageRows.length > 0 ? SEEDANCE_I2V_MAX_CONTENT_TEXT : useSeedanceV2 ? 480 : 720,
    )
    contentArr = [{ type: 'text', text: textCombined }]
    for (const row of imageRows) {
      let url = row
      if (!url.startsWith('data:image') && /^[a-z0-9+/=\s]+$/i.test(url.replace(/\s/g, ''))) {
        url = `data:image/jpeg;base64,${url.replace(/\s/g, '')}`
      }
      contentArr.push({ type: 'image_url', image_url: { url } })
    }
  }

  const payload: Record<string, unknown> = { model: modelId, content: contentArr }
  if (useSeedanceV2) {
    /** 长视频续帧为 i2v：须显式传 duration，否则方舟默认约 5 秒/段 */
    if (flagParsed.duration != null) {
      const resolved = resolveSeedancePayloadDuration(modelId, flagParsed.duration, mode)
      if (resolved == null) {
        return { ok: false, msg: `模型 ${modelId} 不支持 ${Math.round(flagParsed.duration)} 秒时长` }
      }
      payload.duration = resolved
    }
    if (flagParsed.ratio) payload.ratio = flagParsed.ratio
    else payload.ratio = '9:16'
    payload.watermark = flagParsed.watermark ?? false
    payload.resolution = flagParsed.resolution ?? '720p'
  }
  return { ok: true, payload }
}

async function arkPostVideoGenerationTask(
  env: MerchantAiEnv,
  key: string,
  payload: Record<string, unknown>,
  modelForError: string,
): Promise<
  | { ok: false; msg: string; status?: number; rawMsg?: string }
  | { ok: true; taskId: string; raw?: unknown }
> {
  const root = arkApiV3Root(env)
  const res = await fetch(`${root}/contents/generations/tasks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const j = await readJsonResponse(res)
  const idRaw = typeof j.id === 'string' ? j.id : null
  if (!res.ok) {
    const rawMsg =
      (typeof j.error === 'object' &&
        j.error &&
        typeof (j.error as { message?: unknown }).message === 'string' &&
        (j.error as { message: string }).message) ||
      (typeof j.message === 'string' && j.message) ||
      `方舟创建视频任务失败（HTTP ${res.status}）。`
    return {
      ok: false,
      msg: arkCreateTaskUserMessage(rawMsg, modelForError, res.status),
      status: arkCreateTaskHttpStatus(res.status),
      rawMsg,
    }
  }
  if (!idRaw) return { ok: false, msg: '方舟未返回任务 id。', status: res.status }
  return { ok: true, taskId: idRaw, raw: j }
}

async function arkCreateVideoTask(
  env: MerchantAiEnv,
  body: Record<string, unknown>,
  viteRoot?: string,
): Promise<
  | { ok: false; msg: string; status?: number }
  | { ok: true; taskId: string; provider?: 'ark' | 'qwen'; modelUsed?: string; raw?: unknown }
> {
  const skipQwen =
    body.skip_qwen === true || String(body.skip_qwen ?? '').trim().toLowerCase() === 'true'
  const preferQwenOnly =
    !skipQwen && String(body.prefer_provider ?? '').trim().toLowerCase() === 'qwen'
  const key = doubaoBearerKey(env)
  const rawModel = typeof body.model === 'string' ? body.model.trim() : ''
  const isServerAuto = !rawModel || rawModel === SEEDANCE_SERVER_AUTO
  const preferred = resolvePreferredVideoModel(body.model)
  const mode = detectVideoInputMode(body)
  const durationSec = parseVideoDurationFromFlags(typeof body.flags === 'string' ? body.flags : '')
  const i2vMaxImages = parseI2vMaxImagesFromBody(body)
  const preferQuotaStable =
    body.prefer_quota_stable === true || String(body.prefer_quota_stable ?? '').trim() === 'true'
  const apiBody: Record<string, unknown> = {
    ...body,
    images_base64: clampI2vImagesForApi(
      Array.isArray(body.images_base64) ? (body.images_base64 as string[]) : undefined,
      i2vMaxImages,
    ),
  }
  const candidates =
    preferQwenOnly || !key
      ? []
      : isServerAuto || skipQwen || preferQuotaStable
        ? arkVideoModelCandidates(env, apiBody, preferred, durationSec, preferQuotaStable)
        : (() => {
            const one = normalizeArkVideoModelParam(rawModel)
            return videoModelSupportsDuration(one, durationSec, mode) ? [one] : []
          })()

  /** 指定 model 时仍把该模型置顶，后续走完整目录 failover */
  const tryOrder =
    !isServerAuto && (skipQwen || preferQuotaStable) && candidates.length > 0
      ? (() => {
          const one = normalizeArkVideoModelParam(rawModel)
          if (!one || one === SEEDANCE_SERVER_AUTO) return candidates
          return [one, ...candidates.filter((id) => normalizeArkVideoModelParam(id) !== one)]
        })()
      : candidates

  let lastMsg = preferQwenOnly ? '千问视频生成失败' : '豆包视频生成失败'
  let lastStatus: number | undefined
  let tried = 0
  const triedModels: string[] = []

  if (key && tryOrder.length > 0) {
    for (const modelId of tryOrder) {
      if (looksLikeArkPlaceholderEndpointId(modelId) || looksLikeDoubaoChatModelId(modelId)) continue
      if (!videoModelSupportsDuration(modelId, durationSec, mode)) continue
      const built = buildArkVideoTaskPayload(modelId, apiBody, mode)
      if (built.ok === false) continue
      tried += 1
      triedModels.push(modelId)
      const posted = await arkPostVideoGenerationTask(env, key, built.payload, modelId)
      if (posted.ok === true) {
        return { ok: true, taskId: posted.taskId, provider: 'ark', modelUsed: modelId, raw: posted.raw }
      }
      const rawErr = String(posted.rawMsg ?? posted.msg ?? '')
      if (/invalid content\.text/i.test(rawErr)) {
        const emergencyBuilt = buildArkVideoTaskPayload(
          modelId,
          {
            ...apiBody,
            prompt: clampSeedanceContentText(SEEDANCE_EMERGENCY_I2V_PROMPT, SEEDANCE_I2V_MAX_CONTENT_TEXT),
          },
          mode,
        )
        if (emergencyBuilt.ok === true) {
          const retryPosted = await arkPostVideoGenerationTask(
            env,
            key,
            emergencyBuilt.payload,
            modelId,
          )
          if (retryPosted.ok === true) {
            return {
              ok: true,
              taskId: retryPosted.taskId,
              provider: 'ark',
              modelUsed: modelId,
              raw: retryPosted.raw,
            }
          }
          lastMsg = retryPosted.msg
          lastStatus = retryPosted.status
        }
      }
      lastMsg = posted.msg
      lastStatus = posted.status
      const hopable =
        isArkVideoFailoverError(posted.rawMsg ?? '') ||
        isArkVideoFailoverError(posted.msg) ||
        isArkQuotaHopableError(posted.rawMsg ?? '') ||
        isArkQuotaHopableError(posted.msg)
      if (hopable) continue
      const soft =
        /请填写|无效|invalid|placeholder|对话模型|payload|参数|content\.text/i.test(
          `${posted.msg ?? ''} ${rawErr}`,
        )
      if (soft) continue
      break
    }
  } else if (!key && !preferQwenOnly) {
    lastMsg =
      '未检测到方舟 / 豆包 API Key：请到运营管控台「AI模型 → 短视频 API」配置专用 Key 或「豆包」Key。'
  }

  const qwen = skipQwen ? ({ ok: false as const, msg: '' }) : await qwenPostVideoTask(env, apiBody, viteRoot)
  if (qwen.ok === true) {
    return {
      ok: true,
      taskId: wrapQwenVideoTaskId(qwen.taskId),
      provider: 'qwen',
      modelUsed: qwen.modelUsed,
    }
  }

  return {
    ok: false,
    msg: skipQwen
      ? tried > 0
        ? `${lastMsg}（已依次尝试 ${tried} 个豆包/Seedance 模型：${triedModels.slice(0, 8).join(' → ')}${triedModels.length > 8 ? '…' : ''}；请到火山方舟开通更多 Seedance 模型或关闭安全体验模式。）`
        : lastMsg
      : preferQwenOnly
        ? qwen.msg
        : key
          ? tried > 1
            ? `${lastMsg}（已自动尝试 ${tried} 个豆包/Seedance 模型）；${qwen.msg}`
            : `${lastMsg}；${qwen.msg}`
          : qwen.msg,
    status: lastStatus,
  }
}

async function arkGetVideoTask(
  env: MerchantAiEnv,
  taskId: string,
): Promise<{ ok: false; msg: string; status?: number } | { ok: true; state: ArkPollState }> {
  const key = doubaoBearerKey(env)
  if (!key) return { ok: false, msg: '未配置方舟 API Key。' }
  const root = arkApiV3Root(env)
  let lastMsg = '方舟查询任务失败'
  let lastStatus: number | undefined
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${root}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}` },
    })
    const j = await readJsonResponse(res)
    if (!res.ok) {
      lastMsg =
        (typeof j.message === 'string' && j.message) || `方舟查询任务失败（HTTP ${res.status}）。`
      lastStatus = res.status
      if (isArkQuotaHopableError(lastMsg) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)))
        continue
      }
      return { ok: false, msg: lastMsg, status: lastStatus }
    }
    const rawStatus = typeof j.status === 'string' ? j.status : typeof j.phase === 'string' ? j.phase : ''
    const st = rawStatus.trim().toLowerCase()
    const videoUrl = extractHttpVideoUrl(j)

    /** 语义归一（不同版本字段不一致） */
    let phase: ArkPollPhase = 'running'
    if (!st || st === 'submitted' || st === 'queued' || st === 'pending') phase = 'queued'
    else if (
      st === 'running' ||
      st === 'processing' ||
      st === 'in_progress' ||
      st === 'generating' ||
      st === 'working'
    )
      phase = 'running'
    else if (
      st === 'succeeded' ||
      st === 'success' ||
      st === 'completed' ||
      st === 'finished' ||
      st === 'complete'
    ) {
      phase = videoUrl ? 'succeeded' : 'running'
    } else if (st === 'failed' || st === 'error') phase = 'failed'
    else if (videoUrl && st !== '') phase = 'succeeded'

    const failReason =
      (typeof j.error === 'object' &&
        j.error &&
        typeof (j.error as { message?: unknown }).message === 'string' &&
        (j.error as { message: string }).message) ||
      (typeof j.message === 'string' ? j.message : undefined)

    const statusLabel =
      phase === 'running' &&
      !videoUrl &&
      (st === 'succeeded' ||
        st === 'success' ||
        st === 'completed' ||
        st === 'finished' ||
        st === 'complete')
        ? '收尾中（等待视频地址）'
        : rawStatus || phase

    return {
      ok: true,
      state: {
        phase,
        statusLabel,
        videoUrl,
        raw: j as unknown as Record<string, unknown>,
        failReason:
          phase === 'failed'
            ? failReason || (videoUrl ? '方舟任务失败，请稍后重试。' : '方舟任务已完成但未返回视频地址，请重试。')
            : undefined,
      },
    }
  }
  return { ok: false, msg: lastMsg, status: lastStatus }
}

export type ArkPollPhase = 'queued' | 'running' | 'succeeded' | 'failed'

export type ArkPollState = {
  phase: ArkPollPhase
  statusLabel: string
  videoUrl?: string
  failReason?: string
  raw?: Record<string, unknown>
}

export async function handleMerchantAiVideoRoutes(input: {
  method: string
  pathname: string
  searchParams: URLSearchParams
  res: ServerResponse
  bodyRaw: string
  req?: import('node:http').IncomingMessage
  viteRoot?: string
  env: MerchantAiEnv
}): Promise<boolean> {
  const { method, pathname, searchParams, res, bodyRaw, env: rawEnv } = input
  const env = await mergeVideoAiMerchantEnvWithSnapshot(input.viteRoot, rawEnv)

  if (await handleAliyunIceRoutes({ ...input, env })) return true

  if (method === 'GET' && pathname === '/api/merchant/ai/video/config') {
    const kCfg = pickKlingCreds(env)
    const endpointsRaw = (
      env.MERCHANT_AI_ARK_VIDEO_ENDPOINTS ??
      env.MERCHANT_AI_SEEDANCE_VIDEO_MODELS ??
      ''
    ).trim()
    const arkOpts = parseArkVideoModelList(env)
    const arkKeyOk = !!doubaoBearerKey(env)
    const qwenOk = !!(env.MERCHANT_AI_QWEN_KEY ?? env.DASHSCOPE_API_KEY ?? '').trim()
    const arkVideoSetupIssue = describeArkVideoSetupIssue(arkKeyOk, endpointsRaw)
    const iceOk = Boolean(
      (env.ALIYUN_ICE_APP_ID ?? '').trim() &&
        (env.ALIYUN_ICE_ACCESS_KEY_ID ?? env.ALIBABA_CLOUD_ACCESS_KEY_ID ?? '').trim() &&
        (env.ALIYUN_ICE_ACCESS_KEY_SECRET ?? env.ALIBABA_CLOUD_ACCESS_KEY_SECRET ?? '').trim(),
    )
    const credentialNote =
      '商户端仅可选择模型能力与参数；可灵、方舟视频、阿里云 ICE 云剪辑凭据由运营在「管控台 · AI模型」维护，经 Supabase 注册表快照下发（生产须配置 VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY）；本地 dev 亦可落盘于项目根 .meoo-dev-sync。'
    const plannerModels = longformPlannerModelIds(env)
    const plannerVendors = longformPlannerVendorAvailability(env)
    json(res, 200, {
      klingConfigured: kCfg.ok,
      arkVideoModels: arkOpts,
      arkKeyConfigured: arkKeyOk,
      arkVideoSetupIssue,
      iceConfigured: iceOk,
      /** @deprecated 使用 iceConfigured */
      openshotConfigured: iceOk,
      longformPlanner: {
        doubao: arkKeyOk,
        qwen: qwenOk,
        doubaoModelId: plannerModels.doubao,
        qwenModelId: plannerModels.qwen,
        failoverOrder: LONGFORM_PLANNER_FAILOVER_ORDER_LABEL,
        anyConfigured: anyLongformPlannerConfigured(env),
        vendors: plannerVendors,
      },
      qwenVideoConfigured: qwenOk,
      credentialNote,
    })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/ai/video/longform/plan') {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
    } catch {
      json(res, 400, { ok: false, message: '请求体必须为 JSON。' })
      return true
    }
    const targetTotalSecRaw = Number(parsed.targetTotalSec)
    const targetTotalSec =
      Number.isFinite(targetTotalSecRaw) && targetTotalSecRaw >= 10
        ? Math.min(60, Math.max(15, Math.round(targetTotalSecRaw)))
        : 0
    const segmentSec = Math.min(10, Math.max(5, Number(parsed.segmentSec) || 10))
    const forceAiPlanner = parsed.forceAiPlanner !== false
    const overallPrompt = String(parsed.overallPrompt ?? '').trim()
    if (!overallPrompt) {
      json(res, 400, { ok: false, message: '缺少 overallPrompt。' })
      return true
    }
    const embeddedFromPrompt = parseScriptRowsFromPlainText(overallPrompt)
    const planner = resolveLongformPlannerParams(
      overallPrompt,
      targetTotalSec,
      segmentSec,
      embeddedFromPrompt,
    )
    const effectiveTargetSec = planner.effectiveTargetSec
    const hasEmbeddedTimes =
      embeddedFromPrompt.length >= 2 && scriptRowsHaveExplicitTimeRanges(embeddedFromPrompt)
    const autoSegmentCount = planner.autoSegmentCount
    const segmentCount = planner.autoSegmentCount
      ? segmentCountFromTargetTotalSec(Math.max(effectiveTargetSec, 15), 5)
      : effectiveScriptRowCount(embeddedFromPrompt, planner.segmentCount)
    const mode = String(parsed.mode ?? 'optimize')
    const neg = String(parsed.negativeHint ?? '').trim()
    const modeHint =
      mode === 'generate_text'
        ? '用户将从零生成短片，仅有文字创意，没有首帧图片。第 1 段可写开场画面；后续段在动作、景别、光线上连贯衔接。'
        : mode === 'generate_frames'
          ? '用户上传了分镜参考图，首段以首帧画面为锚；后续段承接前一段结尾的镜头语言。'
          : '用户基于参考图/截帧做短视频优化，各段提示词写清镜头、主体、光线与运镜，段与段过渡自然。'
    const embeddedTimeHint = planner.hasFullEmbeddedTimes
      ? `\n\n【重要】指导文案已含完整分镜时间段，segments 的 timeRange 必须严格使用：${embeddedFromPrompt.map((r) => r.timeRange).join('、')}（不得改为 ${segmentSec} 秒等分）；segments 长度必须=${segmentCount}。`
      : effectiveTargetSec >= 10
        ? `\n\n【重要】目标成片总时长 ${effectiveTargetSec} 秒。须完整阅读指导文案（含表格、剪辑备注、字幕要求），规划 2～12 段连贯分镜；各段 timeRange 之和须覆盖 0～${effectiveTargetSec} 秒，最后一段结束须 ≥ ${effectiveTargetSec - 1} 秒。文案中若仅出现部分时间段示例（如 0-2s、5-8s），仍须补全后续镜头至 ${effectiveTargetSec} 秒。`
        : hasEmbeddedTimes
          ? `\n\n【重要】指导文案已含分镜时间段，segments 的 timeRange 必须严格使用：${embeddedFromPrompt.map((r) => r.timeRange).join('、')}（不得改为 ${segmentSec} 秒等分）；segments 长度必须=${segmentCount}。`
          : ''
    const segmentSplitHint = planner.hasFullEmbeddedTimes
      ? `拆分为恰好 ${segmentCount} 段，按上述指定时间段逐段填写画面与口播`
      : autoSegmentCount && effectiveTargetSec >= 10
        ? `目标成片总时长 ${effectiveTargetSec} 秒。请深入阅读原文后自行规划 2～12 段连贯分镜，各段时间段之和须覆盖 0～${effectiveTargetSec} 秒（最后一段结束 ≥ ${effectiveTargetSec - 1} 秒）；单段约 2～${segmentSec} 秒，按叙事节奏分配，勿机械等分，勿只写前几段`
        : hasEmbeddedTimes
          ? `拆分为恰好 ${segmentCount} 段，按上述指定时间段逐段填写画面与口播`
          : autoSegmentCount
            ? `目标成片总时长约 ${effectiveTargetSec} 秒。请根据创意内容与叙事节奏自行规划 2～12 段连贯分镜，各段时间段之和应接近 ${effectiveTargetSec} 秒；单段时长可按转场需要灵活分配（常见约 3～${segmentSec} 秒，末段可略长），勿机械等分`
            : `拆分为恰好 ${segmentCount} 段、每段约 ${segmentSec} 秒`
    const segmentLengthHint = autoSegmentCount
      ? 'segments 长度由你根据总时长决定（2～12 段）'
      : `segments 长度必须=${segmentCount}`
    const user = `整体创意与指导文案：\n${overallPrompt}\n${neg ? `\n需避免出现的内容（各段尽量遵守）：${neg}\n` : ''}\n任务说明：${modeHint}\n\n请理解上述指导文案中的商业信息与镜头意图（不要把「AI生成技巧、上传参考图说明」写进口播或画面）。\n${segmentSplitHint}：\n- narration：完整口播稿（自然口语，仅观众应听的内容）\n- segments：每段含 timeRange（如 0-10秒）、prompt（画面/光线/构图）、action（人物动作/运镜）、dialogue（该段口播，与 narration 分段一致）${embeddedTimeHint}\n只输出 JSON：{"narration":"…","segments":[{"timeRange":"…","prompt":"…","action":"…","dialogue":"…"},…]}，${segmentLengthHint}。`
    const structuredRows =
      !forceAiPlanner &&
      (scriptSegmentsFromPayload(parsed.scriptSegments) ??
        (planner.hasFullEmbeddedTimes && hasEmbeddedTimes && isScriptRowsUsable(embeddedFromPrompt)
          ? embeddedFromPrompt
          : null))
    if (structuredRows) {
      const expanded = expandScriptRowsFromGuidance(
        structuredRows,
        overallPrompt,
        effectiveTargetSec,
        segmentSec,
      )
      const direct = buildPlanFromScriptRows(expanded, expanded.length)
      if (direct) {
        json(res, 200, {
          ok: true,
          prompts: direct.prompts.map((p) =>
            p.includes('【画面约束】') ? p : `${p}\n${VIDEO_PROMPT_SUFFIX}`,
          ),
          narrationScript: direct.narrationScript,
          scriptSegments: expanded.map((r) => ({
            timeRange: r.timeRange,
            visual: r.visual,
            dialogue: r.dialogue,
          })),
          usedStructuredScript: true,
          usedAiPlanner: false,
        })
        return true
      }
    }
    let planResult: LongformPlanParsed | null = null
    let usedRuleBasedFallback = false
    let plannerVendorUsed: LongformPlannerVendorId | undefined
    let plannerModelId: string | undefined
    let lastPlannerErr = ''
    const plannerSlots = longformPlannerVendorSlots(env)
    if (!plannerSlots.length) {
      json(res, 502, {
        ok: false,
        message:
          '未配置任一分镜策划 AI Key。请至少配置 DeepSeek / MiniMax / Kimi / TokenMix / 千问 / 豆包之一。',
      })
      return true
    }

    const planStageRaw = String(parsed.planStage ?? 'draft').trim()
    const planStage = planStageRaw === 'review' ? 'review' : 'draft'
    const reviewPass = (Number(parsed.reviewPass) === 2 ? 2 : 1) as 1 | 2
    const priorIssues = Array.isArray(parsed.validationIssues)
      ? (parsed.validationIssues as unknown[]).map((x) => String(x)).filter(Boolean)
      : undefined

    if (planStage === 'review') {
      const draftRows = scriptSegmentsFromPayload(parsed.draftSegments)
      if (!draftRows || draftRows.length < 2) {
        json(res, 400, { ok: false, message: 'review 阶段缺少 draftSegments（至少 2 段）。' })
        return true
      }
      const draftSegments: LongformPlanScriptSegment[] = draftRows.map((r) => ({
        timeRange: r.timeRange,
        visual: r.visual,
        dialogue: r.dialogue,
      }))
      const reviewUser = buildLongformReviewUserMsg(
        overallPrompt,
        draftSegments,
        effectiveTargetSec,
        reviewPass,
        priorIssues,
      )
      const reviewRun = await runLongformPlannerWithSlotFailover({
        env,
        slots: plannerSlots,
        preferredSlotIndex: pickLongformPlannerSlotIndex(plannerSlots, 'review', reviewPass),
        system: LONGFORM_PLAN_REVIEW_SYSTEM,
        maxAttempts: 3,
        buildUserMsg: (attempt) =>
          attempt === 0
            ? reviewUser
            : `${reviewUser}\n\n上次输出无法解析或仍有空白段。请只输出合法 JSON，每段 prompt 与 dialogue 均须非空，时间段连续覆盖全片。`,
        parse: (text) => parseLongformPlan(text, segmentCount, segmentSec, autoSegmentCount),
      })
      if (!reviewRun.ok) {
        json(res, 502, {
          ok: false,
          message: reviewRun.message || `分镜复核（模型 ${reviewPass + 1}）失败，请稍后重试。`,
        })
        return true
      }
      voidRecordVideoAiUsage(
        input.req,
        rawEnv,
        parsed,
        reviewRun.slot.vendor,
        reviewRun.modelUsed,
        null,
        reviewUser,
        JSON.stringify(reviewRun.parsed),
      )
      json(
        res,
        200,
        segmentsToPlanResponse(
          reviewRun.parsed.scriptSegments,
          overallPrompt,
          effectiveTargetSec,
          segmentSec,
          {
            usedAiPlanner: true,
            plannerVendor: reviewRun.slot.vendor,
            plannerModelId: reviewRun.modelUsed,
            planStage: 'review',
            reviewPass,
          },
        ),
      )
      return true
    }

    const draftRun = await runLongformPlannerWithSlotFailover({
      env,
      slots: plannerSlots,
      preferredSlotIndex: pickLongformPlannerSlotIndex(plannerSlots, 'draft', 0),
      system: LONGFORM_PLAN_SYSTEM,
      maxAttempts: 4,
      buildUserMsg: (attempt) => {
        const coverageRepair =
          attempt >= 2 && effectiveTargetSec >= 10
            ? `\n\n【纠正 ${attempt - 1}/2】上次 segments 未覆盖完整 ${effectiveTargetSec} 秒。必须重新规划：timeRange 从 0 连续到 ${effectiveTargetSec} 秒，不得遗漏后段镜头；每段画面与口播均须非空。`
            : ''
        if (attempt === 0) return user
        if (attempt === 1) {
          return `${user}\n\n上次输出无法解析。请只输出合法 JSON，含 narration 与 segments（${autoSegmentCount ? '2～12 段' : `长度=${segmentCount}`}），键名 prompt/action，每段 prompt 与 dialogue 均须非空，不要 Markdown、不要代码块。`
        }
        return `${user}${coverageRepair}\n\n请只输出合法 JSON，segments 须覆盖 0～${effectiveTargetSec} 秒全片，禁止空白段。`
      },
      parse: (text) => parseLongformPlan(text, segmentCount, segmentSec, autoSegmentCount),
      validate: (parsed, attempt) => {
        if (
          effectiveTargetSec >= 10 &&
          maxScriptTimeRangeEndSec(parsed.scriptSegments) < effectiveTargetSec - 2 &&
          attempt < 3
        ) {
          return `分镜仅覆盖约 ${maxScriptTimeRangeEndSec(parsed.scriptSegments)} 秒，未达 ${effectiveTargetSec} 秒`
        }
        return null
      },
    })
    planResult = draftRun.ok ? draftRun.parsed : null
    plannerVendorUsed = draftRun.ok ? draftRun.slot.vendor : undefined
    plannerModelId = draftRun.ok ? draftRun.modelUsed : undefined
    if (!draftRun.ok) lastPlannerErr = draftRun.message
    if (!planResult) {
      if (hasEmbeddedTimes && isScriptRowsUsable(embeddedFromPrompt)) {
        const direct = buildPlanFromScriptRows(embeddedFromPrompt, segmentCount)
        if (direct) {
          planResult = {
            prompts: direct.prompts.map((p) =>
              p.includes('【画面约束】') ? p : `${p}\n${VIDEO_PROMPT_SUFFIX}`,
            ),
            narrationScript: direct.narrationScript,
            scriptSegments: embeddedFromPrompt.map((r) => ({
              timeRange: r.timeRange,
              visual: r.visual,
              dialogue: r.dialogue,
            })),
          }
        }
      }
      if (!planResult && !forceAiPlanner) {
        const fbCount = segmentCount
        const fb = fallbackSplitLongformPrompt(overallPrompt, fbCount)
        if (fb.length >= 2) {
          const prompts = fb.map((p) =>
            p.includes('【画面约束】') ? p : `${p}\n${VIDEO_PROMPT_SUFFIX}`,
          )
          planResult = {
            prompts,
            narrationScript: '',
            scriptSegments: hasEmbeddedTimes
              ? embeddedFromPrompt.map((r) => ({
                  timeRange: r.timeRange,
                  visual: r.visual,
                  dialogue: r.dialogue,
                }))
              : scriptRowsFromVideoPrompts(prompts, segmentSec).map((r) => ({
                  timeRange: r.timeRange,
                  visual: r.visual,
                  dialogue: r.dialogue,
                })),
          }
          usedRuleBasedFallback = true
          plannerVendorUsed = undefined
          plannerModelId = undefined
        }
      }
    }
    if (!planResult) {
      json(res, 502, {
        ok: false,
        message:
          lastPlannerErr ||
          '所有分镜策划模型均未返回可用 JSON，请检查 API Key 与额度后重试。',
      })
      return true
    }
    if (plannerVendorUsed && plannerModelId) {
      voidRecordVideoAiUsage(
        input.req,
        rawEnv,
        parsed,
        plannerVendorUsed,
        plannerModelId,
        null,
        user,
        JSON.stringify(planResult),
      )
    }
    json(
      res,
      200,
      segmentsToPlanResponse(
        planResult.scriptSegments,
        overallPrompt,
        effectiveTargetSec,
        segmentSec,
        {
          usedRuleBasedFallback,
          usedAiPlanner: !usedRuleBasedFallback && !!plannerVendorUsed,
          plannerVendor: plannerVendorUsed,
          plannerModelId,
          planStage: 'draft',
        },
      ),
    )
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/ai/video/narration/extract') {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
    } catch {
      json(res, 400, { ok: false, message: '请求体必须为 JSON。' })
      return true
    }
    const overallPrompt = String(parsed.overallPrompt ?? '').trim()
    if (!overallPrompt) {
      json(res, 400, { ok: false, message: '缺少 overallPrompt。' })
      return true
    }
    const plannerRaw = String(parsed.plannerModel ?? 'auto').toLowerCase()
    const plannerModel: 'doubao' | 'qwen' | 'auto' =
      plannerRaw === 'qwen' ? 'qwen' : plannerRaw === 'doubao' ? 'doubao' : 'auto'
    const user = `执导/指导文案：\n${overallPrompt}\n\n请提取或改写成口播稿，不要包含制作技巧与上传说明。`
    let narrationScript = ''
    let lastErr = ''
    let usedVendor: 'doubao' | 'qwen' | undefined
    let usedModel: string | undefined
    const vendors = plannerVendorOrder(env, plannerModel)
    for (const vendor of vendors) {
      const chat = await merchantChatCompletion(env, parsed, vendor, NARRATION_EXTRACT_SYSTEM, user)
      if (chat.ok === false) {
        lastErr = chat.message
        continue
      }
      narrationScript = chat.text.trim()
      if (narrationScript.length >= 4) {
        usedVendor = vendor
        usedModel = chat.modelUsed
        break
      }
    }
    if (narrationScript.length < 4) {
      narrationScript = extractShortVideoNarrationScript(overallPrompt)
    }
    if (narrationScript.length < 4) {
      json(res, 502, {
        ok: false,
        message: lastErr || '未能从指导文案提取口播稿，请补充可对观众朗读的内容。',
      })
      return true
    }
    if (usedVendor) {
      voidRecordVideoAiUsage(
        input.req,
        rawEnv,
        parsed,
        usedVendor,
        usedModel,
        null,
        user,
        narrationScript,
      )
    }
    json(res, 200, { ok: true, narrationScript: narrationScript.slice(0, 520) })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/ai/video/concat-urls') {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
    } catch {
      json(res, 400, { ok: false, message: '请求体必须为 JSON。' })
      return true
    }
    const rawUrls = parsed.urls
    const urls = Array.isArray(rawUrls)
      ? rawUrls.map((x) => String(x).trim()).filter((u) => /^https?:\/\//i.test(u))
      : []
    if (urls.length < 2) {
      json(res, 400, { ok: false, message: '缺少至少 2 个有效视频 URL。' })
      return true
    }
    const merged = await concatRemoteMp4Urls(urls, {
      ratio: typeof parsed.ratio === 'string' ? parsed.ratio : undefined,
      fps:
        typeof parsed.fps === 'number'
          ? parsed.fps
          : typeof parsed.fps === 'string'
            ? parsed.fps
            : undefined,
    })
    if (!merged.ok) {
      json(res, 502, { ok: false, message: merged.message })
      return true
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Content-Length', String(merged.buffer.length))
    res.end(merged.buffer)
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/ai/video/concat-blobs') {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
    } catch {
      json(res, 400, { ok: false, message: '请求体必须为 JSON。' })
      return true
    }
    const rawSegs = parsed.segments
    if (!Array.isArray(rawSegs) || rawSegs.length < 2) {
      json(res, 400, { ok: false, message: '缺少至少 2 段 base64 视频片段。' })
      return true
    }
    const buffers: Buffer[] = []
    for (let i = 0; i < rawSegs.length; i++) {
      const b64 = String(rawSegs[i] ?? '').trim()
      if (!b64) {
        json(res, 400, { ok: false, message: `第 ${i + 1} 段为空` })
        return true
      }
      try {
        const buf = Buffer.from(b64, 'base64')
        if (buf.length > 80 * 1024 * 1024) {
          json(res, 400, { ok: false, message: `第 ${i + 1} 段过大` })
          return true
        }
        buffers.push(buf)
      } catch {
        json(res, 400, { ok: false, message: `第 ${i + 1} 段 base64 无效` })
        return true
      }
    }
    const merged = await concatLocalMp4Buffers(buffers, {
      ratio: typeof parsed.ratio === 'string' ? parsed.ratio : undefined,
      fps:
        typeof parsed.fps === 'number'
          ? parsed.fps
          : typeof parsed.fps === 'string'
            ? parsed.fps
            : undefined,
    })
    if (!merged.ok) {
      json(res, 502, { ok: false, message: merged.message })
      return true
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Content-Length', String(merged.buffer.length))
    res.end(merged.buffer)
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/ai/video/mux-audio') {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
    } catch {
      json(res, 400, { ok: false, message: '请求体必须为 JSON。' })
      return true
    }
    const videoB64 = String(parsed.videoBase64 ?? '').trim()
    const audioB64 = String(parsed.audioBase64 ?? '').trim()
    if (!videoB64 || !audioB64) {
      json(res, 400, { ok: false, message: '缺少 videoBase64 或 audioBase64' })
      return true
    }
    let videoBuf: Buffer
    let audioBuf: Buffer
    try {
      videoBuf = Buffer.from(videoB64, 'base64')
      audioBuf = Buffer.from(audioB64, 'base64')
    } catch {
      json(res, 400, { ok: false, message: 'base64 无效' })
      return true
    }
    const { muxLocalVideoAudio } = await import('./videoConcatServer.js')
    const merged = await muxLocalVideoAudio(videoBuf, audioBuf)
    if (!merged.ok) {
      json(res, 502, { ok: false, message: merged.message })
      return true
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Content-Length', String(merged.buffer.length))
    res.end(merged.buffer)
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/ai/video/post-process') {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
    } catch {
      json(res, 400, { ok: false, message: '请求体必须为 JSON。' })
      return true
    }
    const videoB64 = String(parsed.videoBase64 ?? '').trim()
    if (!videoB64) {
      json(res, 400, { ok: false, message: '缺少 videoBase64' })
      return true
    }
    const srtContent = typeof parsed.srtContent === 'string' ? parsed.srtContent : undefined
    const subtitleStyle = typeof parsed.subtitleStyle === 'string' ? parsed.subtitleStyle : undefined
    const productB64 = String(parsed.productImageBase64 ?? '').trim()
    const subtleMotion =
      parsed.subtleMotion === true || parsed.subtleMotion === '1' || parsed.subtleMotion === 1
    const gesturePreset =
      typeof parsed.gesturePreset === 'string' ? parsed.gesturePreset.trim() : undefined
    const motionTimeline = Array.isArray(parsed.motionTimeline)
      ? (parsed.motionTimeline as Array<Record<string, unknown>>)
          .map((row) => ({
            startSec: Number(row.startSec),
            endSec: Number(row.endSec),
            gesturePreset: String(row.gesturePreset ?? '').trim(),
          }))
          .filter((row) => row.endSec > row.startSec && row.gesturePreset)
      : undefined
    const minDurationSec = Number(parsed.minDurationSec)
    const minDur =
      Number.isFinite(minDurationSec) && minDurationSec > 0 ? Math.round(minDurationSec) : undefined
    const productStartSec = Number(parsed.productStartSec)
    const productEndSec = Number(parsed.productEndSec)
    const productStart =
      Number.isFinite(productStartSec) && productStartSec >= 0 ? productStartSec : undefined
    const productEnd =
      Number.isFinite(productEndSec) && productEndSec > 0 ? productEndSec : undefined
    if (
      !srtContent?.trim() &&
      !productB64 &&
      !subtleMotion &&
      !(motionTimeline && motionTimeline.length > 0) &&
      !minDur
    ) {
      json(res, 400, { ok: false, message: '缺少 srtContent、productImageBase64、subtleMotion、motionTimeline 或 minDurationSec' })
      return true
    }
    let videoBuf: Buffer
    let productImageBuf: Buffer | undefined
    try {
      videoBuf = Buffer.from(videoB64, 'base64')
      if (productB64) productImageBuf = Buffer.from(productB64, 'base64')
    } catch {
      json(res, 400, { ok: false, message: 'base64 无效' })
      return true
    }
    const { postProcessLocalVideo } = await import('./videoConcatServer.js')
    const processed = await postProcessLocalVideo(videoBuf, {
      srtContent,
      subtitleStyle,
      productImageBuf,
      productStartSec: productStart,
      productEndSec: productEnd,
      subtleMotion,
      gesturePreset,
      motionTimeline,
      minDurationSec: minDur,
    })
    if (!processed.ok) {
      json(res, 502, { ok: false, message: processed.message })
      return true
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Content-Length', String(processed.buffer.length))
    res.end(processed.buffer)
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/ai/video/last-frame') {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
    } catch {
      json(res, 400, { ok: false, message: '请求体必须为 JSON。' })
      return true
    }
    const urlStr = typeof parsed.url === 'string' ? parsed.url.trim() : ''
    if (!urlStr || !/^https?:\/\//i.test(urlStr)) {
      json(res, 400, { ok: false, message: '缺少有效的 http(s) URL。' })
      return true
    }
    const bearer = doubaoBearerKey(env) ?? undefined
    const extracted = await extractLastFrameJpegFromUrl(urlStr, { bearer })
    if (!extracted.ok) {
      json(res, 502, { ok: false, message: extracted.message })
      return true
    }
    json(res, 200, { ok: true, imageBase64: extracted.buffer.toString('base64') })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/ai/video/download-url') {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
    } catch {
      json(res, 400, { ok: false, message: '请求体必须为 JSON。' })
      return true
    }
    const urlStr = typeof parsed.url === 'string' ? parsed.url.trim() : ''
    if (!urlStr || !/^https?:\/\//i.test(urlStr)) {
      json(res, 400, { ok: false, message: '缺少有效的 http(s) URL。' })
      return true
    }
    const bearer = doubaoBearerKey(env) ?? undefined
    const fetched = await fetchRemoteVideoBuffer(urlStr, { bearer })
    if (!fetched.ok) {
      json(res, 502, { ok: false, message: fetched.message })
      return true
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Content-Length', String(fetched.buffer.length))
    res.end(fetched.buffer)
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/ai/video/kling/start') {
    const cred = pickKlingCreds(env)
    if (cred.ok === false) {
      json(res, 400, { ok: false, message: cred.msg })
      return true
    }
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
    } catch {
      json(res, 400, { ok: false, message: '请求体必须为 JSON。' })
      return true
    }
    const kind = parsed.kind === 'image2video' ? 'image2video' : 'text2video'
    const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim() : ''
    const modelName =
      (typeof parsed.model_name === 'string' && parsed.model_name.trim()) || 'kling-v1-6'
    const durRaw = parsed.duration
    const duration =
      typeof durRaw === 'number' && Number.isFinite(durRaw)
        ? durRaw
        : typeof durRaw === 'string'
          ? Number.parseInt(durRaw, 10) || 5
          : 5
    const aspectRatio = (typeof parsed.aspect_ratio === 'string' && parsed.aspect_ratio.trim()) || '9:16'
    const mode = (typeof parsed.mode === 'string' && parsed.mode.trim()) || 'std'
    const negative =
      typeof parsed.negative_prompt === 'string'
        ? parsed.negative_prompt
        : 'blur, distortion, low quality'

    let reqBody: Record<string, unknown>
    if (kind === 'text2video') {
      if (!prompt) {
        json(res, 400, { ok: false, message: '文生视频需填写正向提示词。' })
        return true
      }
      reqBody = {
        model_name: modelName,
        prompt,
        negative_prompt: negative,
        duration,
        aspect_ratio: aspectRatio,
        mode,
        cfg_scale:
          typeof parsed.cfg_scale === 'number' ? parsed.cfg_scale : 0.5,
      }
    } else {
      let imageField: string | undefined
      const urlField = normalizeHttpUrl(parsed.image_url)
      if (urlField) imageField = urlField
      else if (typeof parsed.image_base64 === 'string' && parsed.image_base64.trim()) {
        imageField = parsed.image_base64.trim()
      }
      if (!imageField) {
        json(res, 400, {
          ok: false,
          message: '图生视频需提供 image_base64（或公有 image_url）。',
        })
        return true
      }
      reqBody = {
        model_name: modelName,
        image: imageField,
        prompt,
        negative_prompt: negative,
        duration,
        mode,
        cfg_scale:
          typeof parsed.cfg_scale === 'number' ? parsed.cfg_scale : 0.5,
      }
    }

    const klingBases = orderedKlingApiBases(env)

    let upstream: globalThis.Response | null = null
    let j: Record<string, unknown> = {}
    let usedBase = klingBases[0] ?? 'https://api-beijing.klingai.com'
    for (const base of klingBases) {
      usedBase = base
      const tryUrl = `${base.replace(/\/$/, '')}/v1/videos/${kind}`
      const r = await fetch(tryUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cred.jwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reqBody),
      })
      const body = await readJsonResponse(r)
      if (r.ok) {
        upstream = r
        j = body
        break
      }
      j = body
      upstream = r
      /** 401 换节点；429/402 余额不足不再换节点（避免误报 502） */
      if (r.status === 401) continue
      break
    }
    if (!upstream || !upstream.ok) {
      const { message, httpStatus } = klingUpstreamUserMessage(upstream?.status ?? 502, j, usedBase)
      json(res, httpStatus, {
        ok: false,
        message,
        upstream: j,
        kling_api_base: usedBase,
      })
      return true
    }
    const { taskId } = unwrapKlingTask(j)
    if (!taskId) {
      json(res, 502, { ok: false, message: '可灵未返回 task_id', upstream: j })
      return true
    }
    voidRecordVideoAiUsage(
      input.req,
      rawEnv,
      parsed,
      'kling',
      modelName,
      estimateVideoGenerationTokens({
        durationSec: duration,
        promptChars: prompt.length,
      }),
    )
    json(res, 200, { ok: true, taskId, pollKind: kind })
    return true
  }

  if (method === 'GET' && pathname === '/api/merchant/ai/video/kling/status') {
    const cred = pickKlingCreds(env)
    if (cred.ok === false) {
      json(res, 400, { ok: false, message: cred.msg })
      return true
    }
    const taskId = (searchParams.get('taskId') ?? '').trim()
    const pollKindRaw = searchParams.get('kind') ?? 'text2video'
    const kind = pollKindRaw === 'image2video' ? 'image2video' : 'text2video'
    if (!taskId) {
      json(res, 400, { ok: false, message: '缺少 query taskId。' })
      return true
    }
    const statusUrl = `${klingBase(env)}/v1/videos/${kind}/${encodeURIComponent(taskId)}`
    const upstream = await fetch(statusUrl, {
      headers: { Authorization: `Bearer ${cred.jwt}` },
    })
    const j = await readJsonResponse(upstream)
    if (!upstream.ok) {
      json(res, 502, {
        ok: false,
        message:
          typeof j.message === 'string' ? j.message : `HTTP ${upstream.status}`,
        upstream: j,
      })
      return true
    }
    const unwrap = unwrapKlingTask(j)
    const ts = unwrap.taskStatus?.toLowerCase() ?? ''
    let phase: 'queued' | 'running' | 'succeeded' | 'failed' = 'running'
    if (ts === 'submitted' || ts === 'queue' || ts === 'queued') phase = 'queued'
    else if (ts.includes('process') || ts.includes('waiting') || ts === 'running') phase = 'running'
    else if (ts.includes('succ') || ts === 'completed' || ts === 'finish' || unwrap.videoUrl)
      phase = 'succeeded'
    else if (ts.includes('fail') || ts.includes('error')) phase = 'failed'

    json(res, 200, {
      ok: true,
      phase,
      videoUrl: unwrap.videoUrl ?? null,
      taskStatus: unwrap.taskStatus ?? null,
      upstream: klingData(j),
    })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/ai/video/dh-s2v/start') {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
    } catch {
      json(res, 400, { ok: false, message: '请求体必须为 JSON。' })
      return true
    }
    const s2v = await qwenPostS2vVideoTask(env, parsed, input.viteRoot)
    if (s2v.ok === true) {
      json(res, 200, {
        ok: true,
        taskId: s2v.taskId,
        provider: 'qwen',
        modelUsed: s2v.modelUsed,
        pipeline: 'wan_s2v',
      })
      return true
    }
    json(res, 400, { ok: false, message: s2v.msg })
    return true
  }

  if (method === 'GET' && pathname === '/api/merchant/ai/video/dh-s2v/status') {
    const taskIdDh = (searchParams.get('taskId') ?? '').trim()
    if (!taskIdDh) {
      json(res, 400, { ok: false, message: '缺少 query taskId。' })
      return true
    }
    const qk = qwenBearerKey(env)
    if (!qk) {
      json(res, 502, { ok: false, message: '未配置通义千问 Key，无法查询口型驱动任务。' })
      return true
    }
    try {
      const rawId = stripQwenVideoTaskPrefix(taskIdDh)
      const state = await qwenGetVideoTaskOnce(qk, rawId)
      json(res, 200, { ok: true, provider: 'qwen', ...state })
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      json(res, 502, { ok: false, message: msg })
      return true
    }
  }

  if (method === 'POST' && pathname === '/api/merchant/ai/video/seedance/start') {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
    } catch {
      json(res, 400, { ok: false, message: '请求体必须为 JSON。' })
      return true
    }
    if (String(parsed.pipeline ?? '').trim() === 'wan_s2v') {
      const s2v = await qwenPostS2vVideoTask(env, parsed, input.viteRoot)
      if (s2v.ok === true) {
        const dur = parseVideoDurationFromFlags(
          typeof parsed.flags === 'string' ? parsed.flags : String(parsed.duration ?? ''),
        )
        voidRecordVideoAiUsage(
          input.req,
          rawEnv,
          parsed,
          'qwen',
          s2v.modelUsed,
          estimateVideoGenerationTokens({
            durationSec: dur,
            promptChars: String(parsed.prompt ?? '').length,
          }),
        )
        json(res, 200, {
          ok: true,
          taskId: wrapQwenVideoTaskId(s2v.taskId),
          provider: 'qwen',
          modelUsed: s2v.modelUsed,
          pipeline: 'wan_s2v',
        })
        return true
      }
      json(res, 400, { ok: false, message: s2v.msg })
      return true
    }
    const r = await arkCreateVideoTask(env, parsed, input.viteRoot)
    if (r.ok === true) {
      const dur = parseVideoDurationFromFlags(
        typeof parsed.flags === 'string' ? parsed.flags : String(parsed.duration ?? ''),
      )
      voidRecordVideoAiUsage(
        input.req,
        rawEnv,
        parsed,
        r.provider ?? 'ark',
        r.modelUsed ?? undefined,
        estimateVideoGenerationTokens({
          durationSec: dur,
          promptChars: String(parsed.prompt ?? '').length,
        }),
      )
      json(res, 200, {
        ok: true,
        taskId: r.taskId,
        provider: r.provider ?? 'ark',
        modelUsed: r.modelUsed ?? null,
      })
      return true
    }
    json(res, arkCreateTaskHttpStatus(r.status), { ok: false, message: r.msg })
    return true
  }

  if (method === 'GET' && pathname === '/api/merchant/ai/video/seedance/status') {
    const taskIdSd = (searchParams.get('taskId') ?? '').trim()
    if (!taskIdSd) {
      json(res, 400, { ok: false, message: '缺少 query taskId。' })
      return true
    }
    if (isQwenVideoTaskId(taskIdSd)) {
      const qk = qwenBearerKey(env)
      if (!qk) {
        json(res, 502, { ok: false, message: '未配置通义千问 Key，无法查询千问视频任务。' })
        return true
      }
      try {
        const state = await qwenGetVideoTaskOnce(qk, stripQwenVideoTaskPrefix(taskIdSd))
        json(res, 200, { ok: true, provider: 'qwen', ...state })
        return true
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        json(res, 502, { ok: false, message: msg })
        return true
      }
    }
    const r = await arkGetVideoTask(env, taskIdSd)
    if (r.ok === true) {
      json(res, 200, { ok: true, provider: 'ark', ...r.state })
      return true
    }
    json(res, r.status && r.status >= 400 ? r.status : 502, {
      ok: false,
      message: r.msg,
    })
    return true
  }

  return false
}
