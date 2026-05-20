/** 火山方舟 Seedance 视频：接入点 ep- 或模型 ID doubao-seedance-* */

export type ArkVideoModelOption = { label: string; endpointId: string }

/** Seedance 2.0 默认模型（无 ep 配置时作回退，须账号已开通） */
export const DEFAULT_SEEDANCE_VIDEO_MODEL_ID = 'doubao-seedance-2-0-260128'

export function isDoubaoSeedanceModelId(id: string): boolean {
  return /^doubao-seedance/i.test(id.trim())
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
  if (/^doubao-seed-2-0-lite/i.test(t)) return true
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

/** 解析 UI 尾随参数，如 --dur 5 --fps 24 --ratio 16:9 --wm false */
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
  const dur = flags.match(/--dur\s+(\d+)/i)?.[1]
  if (dur) {
    const n = Number.parseInt(dur, 10)
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
  if (uniq.length === 0) return ''
  return uniq
    .map((m) => (m.label && m.label !== m.endpointId ? `${m.label}|${m.endpointId}` : m.endpointId))
    .join(', ')
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
  if (seedId && isDoubaoSeedanceModelId(seedId) && !seen.has(seedId)) {
    out.unshift({ label: 'Seedance（模型 ID · 推荐）', endpointId: seedId })
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
      '（格式：Seedance 2.0|doubao-seedance-2-0-260128 或 显示名|ep-xxxx），' +
      '或在 Vercel 设置 MERCHANT_AI_SEEDANCE_VIDEO_MODEL / MERCHANT_AI_ARK_VIDEO_ENDPOINTS。'
    )
  }
  const all = parseArkVideoEndpointsRaw(raw)
  const chatOnly = all.filter((m) => looksLikeDoubaoChatModelId(m.endpointId))
  if (chatOnly.length > 0 && chatOnly.length === all.length) {
    return (
      `当前配置为对话模型（如 ${chatOnly[0]!.endpointId}），不能用于视频生成。` +
      '请改为 Seedance 模型 ID（doubao-seedance-2-0-260128）或方舟控制台创建的 Seedance 视频 ep- 接入点。'
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
      '接入点格式无法识别。请使用「显示名|ep-xxxx」或「显示名|doubao-seedance-2-0-260128」，多个用英文逗号分隔。'
    )
  }
  return null
}
