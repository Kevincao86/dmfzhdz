/** 火山方舟 Seedance 视频接入点：解析、合并 env + 运营注册表，过滤文档示例占位 ep */

export type ArkVideoModelOption = { label: string; endpointId: string }

export function looksLikeArkPlaceholderEndpointId(endpointId: string): boolean {
  const ep = endpointId.trim()
  if (!/^ep-/i.test(ep)) return false
  if (/^ep-(123456|789012|000000|111111|999999)(?:\b|$)/i.test(ep)) return true
  if (/xxxx|placeholder|示例|demo|test/i.test(ep)) return true
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

/** 合并 Vercel 环境变量与运营注册表：优先保留真实 ep，跳过占位示例 */
export function pickMergedArkEndpointsField(envRaw: string, registryRaw: string): string {
  const envModels = parseArkVideoEndpointsRaw(envRaw)
  const regModels = parseArkVideoEndpointsRaw(registryRaw)
  const seen = new Set<string>()
  const uniq: ArkVideoModelOption[] = []
  for (const m of [...envModels, ...regModels]) {
    if (looksLikeArkPlaceholderEndpointId(m.endpointId)) continue
    if (!/^ep-/i.test(m.endpointId)) continue
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
): ArkVideoModelOption[] {
  const fromList = parseArkVideoEndpointsRaw(endpointsRaw).filter(
    (m) => !looksLikeArkPlaceholderEndpointId(m.endpointId) && /^ep-/i.test(m.endpointId),
  )
  if (fromList.length > 0) return fromList
  const fb = String(fallbackEp ?? '').trim()
  if (fb && /^ep-/i.test(fb) && !looksLikeArkPlaceholderEndpointId(fb)) {
    return [{ label: '默认视频接入点', endpointId: fb }]
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
      '方舟 Key 已配置，但未配置视频推理接入点。请在运营管控台填写「Seedance · 方舟视频接入点列表」（格式：显示名|ep-xxxx），' +
      '或在 Vercel 设置 MERCHANT_AI_ARK_VIDEO_ENDPOINTS 或 MERCHANT_AI_ARK_VIDEO_FALLBACK_ENDPOINT。'
    )
  }
  const all = parseArkVideoEndpointsRaw(raw)
  const placeholders = all.filter((m) => looksLikeArkPlaceholderEndpointId(m.endpointId))
  if (placeholders.length > 0 && all.length === placeholders.length) {
    return (
      `当前接入点仍为示例占位（如 ${placeholders[0]!.endpointId}），无法调用。请到火山方舟控制台复制真实 ep- 接入点，` +
      '在运营台或 Vercel 中替换，格式：Seedance 2 Pro|ep-2024xxxxxxxx（多个用英文逗号分隔）。'
    )
  }
  const valid = listValidArkVideoModels(raw)
  if (valid.length === 0) {
    return '接入点格式无法识别。请使用「显示名|ep-xxxx」或单独填写 ep-xxxx，多个用英文逗号分隔。'
  }
  return null
}
