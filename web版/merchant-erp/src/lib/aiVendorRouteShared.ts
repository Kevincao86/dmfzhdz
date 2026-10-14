/** 运营台「API 线路」：每个厂商 1 条主线路 + 2 条备选。手动只走选中线路；自动每次从主线路开始，失败再换备选。 */

export const AI_ROUTE_VENDORS = [
  { id: 'doubao', label: '豆包 / 火山方舟' },
  { id: 'qwen', label: '通义千问' },
  { id: 'minimax', label: 'MiniMax' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'kimi', label: 'Kimi' },
  { id: 'tokenmix', label: 'TokenMix' },
] as const

export type AiRouteVendorId = (typeof AI_ROUTE_VENDORS)[number]['id']

export type AiVendorRouteLine = {
  label: string
  apiKey: string
}

export type AiVendorRoute = {
  mode: 'manual' | 'auto'
  active: 0 | 1 | 2
  lines: [AiVendorRouteLine, AiVendorRouteLine, AiVendorRouteLine]
}

export type RegistryAiVendorRoutes = {
  updatedAt: string
  vendors: Partial<Record<string, AiVendorRoute>>
}

const LINE_LABELS = ['主线路', '备选 1', '备选 2'] as const

export function emptyRouteLines(): AiVendorRoute['lines'] {
  return [
    { label: LINE_LABELS[0], apiKey: '' },
    { label: LINE_LABELS[1], apiKey: '' },
    { label: LINE_LABELS[2], apiKey: '' },
  ]
}

export function routeFromLegacyKey(legacyKey: string | undefined): AiVendorRoute {
  const lines = emptyRouteLines()
  lines[0].apiKey = (legacyKey ?? '').trim()
  return { mode: 'manual', active: 0, lines }
}

function asActive(n: unknown): 0 | 1 | 2 {
  return n === 1 || n === 2 ? n : 0
}

export function normalizeOneVendorRoute(raw: unknown, legacyKey?: string): AiVendorRoute {
  const base = routeFromLegacyKey(legacyKey)
  if (!raw || typeof raw !== 'object') return base
  const row = raw as Partial<AiVendorRoute>
  const lines = emptyRouteLines()
  if (Array.isArray(row.lines)) {
    for (let i = 0; i < 3; i++) {
      const item = row.lines[i]
      if (!item || typeof item !== 'object') continue
      const label = typeof item.label === 'string' ? item.label.trim().slice(0, 40) : ''
      const apiKey = typeof item.apiKey === 'string' ? item.apiKey.trim() : ''
      if (label) lines[i].label = label
      lines[i].apiKey = apiKey
    }
  }
  if (!lines[0].apiKey && base.lines[0].apiKey) lines[0].apiKey = base.lines[0].apiKey
  const mode = row.mode === 'auto' ? 'auto' : 'manual'
  let active = asActive(row.active)
  if (mode === 'manual' && !lines[active].apiKey.trim()) {
    const found = lines.findIndex((line) => line.apiKey.trim())
    active = found === 1 || found === 2 ? found : 0
  }
  return { mode, active, lines }
}

export function normalizeAiVendorRoutes(raw: unknown, legacyKeys?: Record<string, string | undefined>): RegistryAiVendorRoutes {
  const src = raw && typeof raw === 'object' ? (raw as Partial<RegistryAiVendorRoutes>) : {}
  const vendorsIn = src.vendors && typeof src.vendors === 'object' ? src.vendors : {}
  const vendors: RegistryAiVendorRoutes['vendors'] = {}
  for (const vendor of AI_ROUTE_VENDORS) {
    vendors[vendor.id] = normalizeOneVendorRoute(vendorsIn[vendor.id], legacyKeys?.[vendor.id])
  }
  const updatedAt = typeof src.updatedAt === 'string' && src.updatedAt ? src.updatedAt : new Date(0).toISOString()
  return { updatedAt, vendors }
}

/** 展示用：没存过线路时，用现有厂商 Key 填主线路，模式为手动。 */
export function displayAiVendorRoutes(
  stored: unknown,
  legacyKeys?: Record<string, string | undefined>,
): RegistryAiVendorRoutes {
  return normalizeAiVendorRoutes(stored, legacyKeys)
}

export function keysForRoute(route: AiVendorRoute): string[] {
  const ordered = route.lines.map((line) => line.apiKey.trim()).filter(Boolean)
  if (route.mode === 'manual') {
    const picked = route.lines[route.active]?.apiKey.trim() ?? ''
    if (picked) return [picked]
    return ordered.length ? [ordered[0]] : []
  }
  const out: string[] = []
  for (const key of ordered) {
    if (!out.includes(key)) out.push(key)
  }
  return out
}

export function effectiveVendorKey(route: AiVendorRoute): string {
  return keysForRoute(route)[0] ?? ''
}

export function maskApiKey(raw: string): string {
  const key = raw.trim()
  if (!key) return '未填写'
  if (key.length <= 8) return '已填写'
  return `${key.slice(0, 4)}…${key.slice(-4)}`
}

export function readRouteKeysFromEnv(env: Record<string, string | undefined>, vendor: string): string[] {
  const raw = env.MERCHANT_AI_VENDOR_ROUTES
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Record<string, { keys?: unknown }>
    const keys = parsed[vendor]?.keys
    if (!Array.isArray(keys)) return []
    const out: string[] = []
    for (const item of keys) {
      const key = String(item ?? '').trim()
      if (key && !out.includes(key)) out.push(key)
    }
    return out
  } catch {
    return []
  }
}

const VENDOR_ENV_KEYS: Record<string, readonly string[]> = {
  doubao: ['MERCHANT_AI_DOUBAO_KEY', 'ARK_API_KEY'],
  qwen: ['MERCHANT_AI_QWEN_KEY', 'DASHSCOPE_API_KEY'],
  minimax: ['MINIMAX_API_KEY', 'MERCHANT_AI_MINIMAX_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  kimi: ['MOONSHOT_API_KEY', 'MERCHANT_AI_KIMI_KEY', 'KIMI_API_KEY'],
  tokenmix: ['TOKENMIX_API_KEY'],
}

export function assignVendorRouteKey(env: Record<string, string>, vendor: string, key: string): void {
  const trimmed = key.trim()
  if (!trimmed) return
  for (const name of VENDOR_ENV_KEYS[vendor] ?? []) env[name] = trimmed
}

/** 非最后一条线路时按住跨厂商切换，避免第一条 Key 失败就跳到另一个厂商。 */
export function envWithRouteKey(
  env: Record<string, string>,
  vendor: string,
  key: string,
  holdCrossVendor: boolean,
): Record<string, string> {
  const next: Record<string, string> = { ...env, MERCHANT_AI_ROUTE_PIN: '1' }
  assignVendorRouteKey(next, vendor, key)
  if (holdCrossVendor) next.MERCHANT_AI_HOLD_CROSS_VENDOR = '1'
  else delete next.MERCHANT_AI_HOLD_CROSS_VENDOR
  return next
}

/** 账号、额度、鉴权、超时、5xx 才换线。参数错误和内容审核不换。 */
export function isAiRouteHopMessage(msg: string, status?: number): boolean {
  const raw = String(msg ?? '')
  const lower = raw.toLowerCase()
  if (/real person|写实人像|真人肖像|内容审核|content filter|sensitive content|may contain/.test(lower)) return false
  if (/invalid parameter|invalidparameter|missing parameter|参数错误|参数不合法/.test(lower) && !/api key|unauthorized|鉴权/.test(lower)) {
    return false
  }
  if (status === 401 || status === 402 || status === 403 || status === 404 || status === 408 || status === 429) return true
  if (status != null && status >= 500) return true
  if (
    /401|402|403|408|429|500|502|503|504|unauthorized|invalid api key|invalid authentication|authentication failed|quota|insufficient|overdue|balance|timeout|timed out|etimedout|econnreset|fetch failed|socket|未开通|not activated|access denied|accountoverdue|欠费/.test(
      lower,
    )
  ) {
    return true
  }
  return false
}
