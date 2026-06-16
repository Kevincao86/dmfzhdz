/** 火山方舟 Seedance 视频：接入点 ep- 或模型 ID doubao-seedance-* */

import {
  catalogEndpointsCsv,
  DOUBAO_CHAT_CATALOG,
  DOUBAO_VIDEO_CATALOG,
  isArkGenerativeVideoModelId,
} from './arkModelCatalog.js'

export type ArkVideoModelOption = { label: string; endpointId: string }

/** Seedance 1.5 Pro 默认模型（方舟 API 模型名，须账号已开通） */
export const DEFAULT_SEEDANCE_VIDEO_MODEL_ID = 'doubao-seedance-1-5-pro-251215'

/** 运营/文档中的友好名 → 方舟 model 参数 */
const SEEDANCE_MODEL_ALIASES: Record<string, string> = {
  'doubao-seedance-1.5-pro': DEFAULT_SEEDANCE_VIDEO_MODEL_ID,
  'doubao-seedance-1-5-pro': DEFAULT_SEEDANCE_VIDEO_MODEL_ID,
  'doubao-seaweed': 'doubao-seaweed-241128',
  'doubao-视频生成-seaweed': 'doubao-seaweed-241128',
  'wan2.1-14b': 'wan2-1-14b-250224',
}

/** 运营台常填 1.5，方舟 API 须为 1-5 */
function fixSeedanceDottedVersion(id: string): string {
  return id.replace(/doubao-seedance-(\d+)\.(\d+)/gi, 'doubao-seedance-$1-$2')
}

export function normalizeArkVideoModelParam(modelId: string): string {
  const t = modelId.trim()
  if (/^ep-/i.test(t)) return t
  const lower = fixSeedanceDottedVersion(t.toLowerCase())
  return SEEDANCE_MODEL_ALIASES[lower] ?? lower
}

export function isDoubaoSeedanceModelId(id: string): boolean {
  const t = id.trim()
  if (isArkGenerativeVideoModelId(t)) return true
  if (/^doubao-seedance/i.test(t)) return true
  return Object.keys(SEEDANCE_MODEL_ALIASES).includes(t.toLowerCase())
}

export function isArkVideoEndpointId(id: string): boolean {
  return /^ep-/i.test(id.trim())
}

/** 对话类模型名，误配到「视频接入点」时会在服务端拦截 */
export function looksLikeDoubaoChatModelId(id: string): boolean {
  const t = id.trim()
  if (!t || isDoubaoSeedanceModelId(t) || isArkVideoEndpointId(t)) return false
  if (/^doubao-seed-2-0-pro$/i.test(t)) return true
  if (/^doubao-pro/i.test(t)) return true
  if (/^doubao-seed-1-6/i.test(t)) return true
  if (/^doubao-seed-character/i.test(t)) return true
  if (/^doubao-seed-2-0-lite/i.test(t)) return true
  if (/^doubao-seed-2-0-mini/i.test(t)) return true
  if (/^doubao-seed-2-0-code/i.test(t)) return true
  if (/^doubao-seed-1-8/i.test(t)) return true
  return false
}

export function looksLikeArkPlaceholderEndpointId(endpointId: string): boolean {
  const ep = endpointId.trim()
  if (!/^ep-/i.test(ep)) return false
  if (/^ep-(123456|789012|000000|111111|999999)(?:\b|$)/i.test(ep)) return true
  if (/xxxx|placeholder|示例|demo|test/i.test(ep)) return true
  return false
}

function isValidArkVideoModelEntry(m: ArkVideoModelOption): boolean {
  const id = m.endpointId.trim()
  if (!id || looksLikeArkPlaceholderEndpointId(id) || looksLikeDoubaoChatModelId(id)) return false
  return isArkVideoEndpointId(id) || isDoubaoSeedanceModelId(id)
}

function isValidArkChatModelEntry(m: ArkVideoModelOption): boolean {
  const id = m.endpointId.trim()
  if (!id || looksLikeArkPlaceholderEndpointId(id)) return false
  if (isArkVideoEndpointId(id)) return true
  if (looksLikeDoubaoChatModelId(id)) return true
  if (DOUBAO_CHAT_CATALOG.some((e) => e.modelId === id)) return true
  if (/^doubao-seed/i.test(id) && !isDoubaoSeedanceModelId(id)) return true
  return false
}

export function parseArkVideoEndpointsRaw(raw: string): ArkVideoModelOption[] {
  const out: ArkVideoModelOption[] = []
  for (const part of String(raw ?? '').split(',')) {
    const seg = part.trim()
    if (!seg) continue
    const pipes = seg.split('|').map((s) => s.trim())
    if (pipes.length >= 2 && pipes[1]) {
      out.push({ label: pipes[0] || pipes[1], endpointId: pipes[1] })
    } else if (pipes.length === 1 && pipes[0]) {
      out.push({ label: pipes[0], endpointId: pipes[0] })
    }
  }
  return out
}

/** Seedance 1.5 Pro 等 v2 模型：duration 须在 [3, 4.5]，否则报 duration must be in [3,4.5] */
export const SEEDANCE_V2_DURATION_MIN = 3
export const SEEDANCE_V2_DURATION_MAX = 4.5

export function clampSeedanceV2Duration(raw: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 4
  return Math.min(SEEDANCE_V2_DURATION_MAX, Math.max(SEEDANCE_V2_DURATION_MIN, n))
}

/** ep 接入点图生视频不支持 --dur；从尾随参数中移除避免 duration customization is not supported */
export function stripSeedanceDurFlag(flags: string): string {
  return flags.replace(/\s*--dur\s+[\d.]+\s*/gi, ' ').replace(/\s+/g, ' ').trim()
}

/** 解析 UI 尾随参数，如 --dur 4 --fps 24 --ratio 16:9 --wm false */
export function parseSeedanceCliFlags(flags: string): {
  duration?: number
  fps?: number
  ratio?: string
  watermark?: boolean
  resolution?: string
} {
  const out: {
    duration?: number
    fps?: number
    ratio?: string
    watermark?: boolean
    resolution?: string
  } = {}
  const dur = flags.match(/--dur\s+([\d.]+)/i)?.[1]
  if (dur) {
    const n = Number.parseFloat(dur)
    if (Number.isFinite(n) && n > 0) out.duration = n
  }
  const fps = flags.match(/--fps\s+(\d+)/i)?.[1]
  if (fps) {
    const n = Number.parseInt(fps, 10)
    if (Number.isFinite(n) && n > 0) out.fps = n
  }
  const ratio = flags.match(/--ratio\s+([\d:]+|adaptive)/i)?.[1]
  if (ratio) out.ratio = ratio
  const wm = flags.match(/--wm\s+(true|false)/i)?.[1]
  if (wm) out.watermark = wm.toLowerCase() === 'true'
  return out
}

/** 合并 Vercel 环境变量与运营注册表：保留真实 ep 与 Seedance 模型 ID */
export function pickMergedArkEndpointsField(envRaw: string, registryRaw: string): string {
  const envModels = parseArkVideoEndpointsRaw(envRaw)
  const regModels = parseArkVideoEndpointsRaw(registryRaw)
  const seen = new Set<string>()
  const uniq: ArkVideoModelOption[] = []
  for (const m of [...envModels, ...regModels]) {
    if (!isValidArkVideoModelEntry(m)) continue
    if (seen.has(m.endpointId)) continue
    seen.add(m.endpointId)
    uniq.push(m)
  }
  if (uniq.length === 0) return catalogEndpointsCsv(DOUBAO_VIDEO_CATALOG)
  return uniq
    .map((m) => (m.label && m.label !== m.endpointId ? `${m.label}|${m.endpointId}` : m.endpointId))
    .join(', ')
}

/** 对话模型专用合并（勿用视频校验，避免误删 chat 模型 ID） */
export function pickMergedArkChatEndpointsField(envRaw: string, registryRaw: string): string {
  const envModels = parseArkVideoEndpointsRaw(envRaw)
  const regModels = parseArkVideoEndpointsRaw(registryRaw)
  const seen = new Set<string>()
  const uniq: ArkVideoModelOption[] = []
  for (const m of [...envModels, ...regModels]) {
    if (!isValidArkChatModelEntry(m)) continue
    if (seen.has(m.endpointId)) continue
    seen.add(m.endpointId)
    uniq.push(m)
  }
  if (uniq.length === 0) return catalogEndpointsCsv(DOUBAO_CHAT_CATALOG)
  return uniq
    .map((m) => (m.label && m.label !== m.endpointId ? `${m.label}|${m.endpointId}` : m.endpointId))
    .join(', ')
}

/** 商户端下拉：运营配置 + 内置目录（去重） */
export function listArkVideoModelsForPicker(
  endpointsRaw: string,
  fallbackEp?: string,
  seedanceModelId?: string,
): ArkVideoModelOption[] {
  const configured = listValidArkVideoModels(endpointsRaw, fallbackEp, seedanceModelId)
  const seen = new Set(configured.map((m) => m.endpointId))
  const out = [...configured]
  for (const e of DOUBAO_VIDEO_CATALOG) {
    if (seen.has(e.modelId)) continue
    seen.add(e.modelId)
    out.push({ label: e.label, endpointId: e.modelId })
  }
  return out
}

export function listValidArkVideoModels(
  endpointsRaw: string,
  fallbackEp?: string,
  seedanceModelId?: string,
): ArkVideoModelOption[] {
  const fromList = parseArkVideoEndpointsRaw(endpointsRaw).filter(isValidArkVideoModelEntry)
  const seen = new Set(fromList.map((m) => m.endpointId))
  const out: ArkVideoModelOption[] = [...fromList]

  const seedId = String(seedanceModelId ?? '').trim()
  // 仅当运营未配置任何视频模型时，才注入 env 默认模型 ID，避免未开通的模型出现在下拉里
  if (fromList.length === 0 && seedId && isDoubaoSeedanceModelId(seedId) && !seen.has(seedId)) {
    out.unshift({
      label: 'Seedance 1.5 Pro（模型 ID · 需在方舟开通）',
      endpointId: seedId,
    })
    seen.add(seedId)
  }

  if (out.length > 0) return out

  const fb = String(fallbackEp ?? '').trim()
  if (fb && isArkVideoEndpointId(fb) && !looksLikeArkPlaceholderEndpointId(fb)) {
    return [{ label: '默认视频接入点', endpointId: fb }]
  }
  if (seedId && isDoubaoSeedanceModelId(seedId)) {
    return [{ label: 'Seedance（模型 ID）', endpointId: seedId }]
  }
  return []
}

export function describeArkVideoSetupIssue(
  arkKeyConfigured: boolean,
  endpointsRaw: string,
): string | null {
  if (!arkKeyConfigured) {
    return '未检测到方舟 / 豆包 API Key。请在运营管控台「短视频 API」或 Vercel 配置 MERCHANT_AI_DOUBAO_KEY / ARK_API_KEY。'
  }
  const raw = endpointsRaw.trim()
  if (!raw) {
    return (
      '方舟 Key 已配置，但未配置视频模型。请在运营台填写「Seedance · 方舟视频接入点」' +
      `（格式：Seedance 1.5 Pro|${DEFAULT_SEEDANCE_VIDEO_MODEL_ID} 或 显示名|ep-xxxx），` +
      '或在 Vercel 设置 MERCHANT_AI_SEEDANCE_VIDEO_MODEL / MERCHANT_AI_ARK_VIDEO_ENDPOINTS。'
    )
  }
  const all = parseArkVideoEndpointsRaw(raw)
  const chatOnly = all.filter((m) => looksLikeDoubaoChatModelId(m.endpointId))
  if (chatOnly.length > 0 && chatOnly.length === all.length) {
    return (
      `当前配置为对话模型（如 ${chatOnly[0]!.endpointId}），不能用于视频生成。` +
      `请改为 Seedance 模型 ID（${DEFAULT_SEEDANCE_VIDEO_MODEL_ID}）或方舟控制台创建的 Seedance 视频 ep- 接入点。`
    )
  }
  const placeholders = all.filter((m) => looksLikeArkPlaceholderEndpointId(m.endpointId))
  if (placeholders.length > 0 && placeholders.length === all.length) {
    return (
      `当前接入点仍为示例占位（如 ${placeholders[0]!.endpointId}），无法调用。请到火山方舟控制台复制真实 ep- 接入点，` +
      '在运营台或 Vercel 中替换，格式：Seedance 2 Pro|ep-2024xxxxxxxx（多个用英文逗号分隔）。'
    )
  }
  const valid = listValidArkVideoModels(raw)
  if (valid.length === 0) {
    return (
      `接入点格式无法识别。请使用「显示名|ep-xxxx」或「Seedance 1.5 Pro|${DEFAULT_SEEDANCE_VIDEO_MODEL_ID}」，多个用英文逗号分隔。`
    )
  }
  return null
}
