/** 与 web版/merchant-erp/src/lib/aiVendorRouteShared.ts 保持同一套线路规则。 */

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

export function displayAiVendorRoutes(
  stored: unknown,
  legacyKeys?: Record<string, string | undefined>,
): RegistryAiVendorRoutes {
  const src = stored && typeof stored === 'object' ? (stored as Partial<RegistryAiVendorRoutes>) : {}
  const vendorsIn = src.vendors && typeof src.vendors === 'object' ? src.vendors : {}
  const vendors: RegistryAiVendorRoutes['vendors'] = {}
  for (const vendor of AI_ROUTE_VENDORS) {
    vendors[vendor.id] = normalizeOneVendorRoute(vendorsIn[vendor.id], legacyKeys?.[vendor.id])
  }
  const updatedAt = typeof src.updatedAt === 'string' && src.updatedAt ? src.updatedAt : ''
  return { updatedAt, vendors }
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
