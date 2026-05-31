import type { AiVendorCatalogEntry } from './opsRegistryTypes.js'

/** 抖音商品 AI assist 等本地网关已接上游的厂商（与展示目录区分） */
export const DOUYIN_ASSIST_AI_VENDOR_IDS = ['minimax', 'qwen', 'doubao'] as const
export type DouyinAssistAiVendorId = (typeof DOUYIN_ASSIST_AI_VENDOR_IDS)[number]

const DOUYIN_ASSIST_ID_SET = new Set<string>(DOUYIN_ASSIST_AI_VENDOR_IDS as unknown as string[])

export function isDouyinAssistAiVendorId(id: string): boolean {
  return DOUYIN_ASSIST_ID_SET.has(id.trim().toLowerCase())
}

/** 系统设置 / 目录展示内置项（含仅走 ERP 智能体网关的厂商） */
export const BUILTIN_AI_VENDOR_IDS = [
  'tokenmix',
  'minimax',
  'qwen',
  'doubao',
  'openai',
  'claude',
  'gemini',
  'grok',
  'deepseek',
  'kimi',
] as const
export type BuiltinAiVendorId = (typeof BUILTIN_AI_VENDOR_IDS)[number]

/** 磁盘 / 前端展示：合法的厂商 ID slug（ASCII，小写字母开头） */
export function isValidAiVendorSlug(id: string): boolean {
  return /^[a-z][a-z0-9_-]{1,47}$/.test(id)
}

/** 仅允许 https 或本站相对路径，避免 javascript: 等注入 */
export function normalizeCatalogLogoUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const t = raw.trim()
  if (!t || t.length > 512) return undefined
  if (t.startsWith('/')) {
    if (t.startsWith('//')) return undefined
    if (/[\s<>"'`]/.test(t)) return undefined
    return t
  }
  try {
    const u = new URL(t)
    if (u.protocol !== 'https:') return undefined
    return t
  } catch {
    return undefined
  }
}

export const BUILTIN_AI_VENDOR_ENTRIES: AiVendorCatalogEntry[] = [
  {
    id: 'tokenmix',
    label: 'TokenMix',
    hint: 'OpenAI / Claude / Gemini / Grok 智能体网关共用此 Key；下方四栏自动同步。',
    logoUrl: '/ai-vendors/openai.png',
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    hint: 'platform.minimax.io · OpenAI 兼容',
    logoUrl: '/ai-vendors/minimax.png',
  },
  {
    id: 'qwen',
    label: '通义千问',
    hint: 'DashScope 兼容 OpenAI；密钥在 Vercel 设 MERCHANT_AI_QWEN_KEY 或 DASHSCOPE_API_KEY',
    logoUrl: '/ai-vendors/qwen.png',
  },
  {
    id: 'doubao',
    label: '豆包',
    hint: '火山方舟 Ark；密钥在 Vercel 设 MERCHANT_AI_DOUBAO_KEY 或 ARK_API_KEY',
    logoUrl: '/ai-vendors/doubao.png',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    hint: '共用 TokenMix Key（智能体 /api/meoo-ai-chat）',
    logoUrl: '/ai-vendors/openai.png',
  },
  {
    id: 'claude',
    label: 'Claude',
    hint: '共用 TokenMix Key（智能体 /api/meoo-ai-chat）',
    logoUrl: '/ai-vendors/claude.png',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    hint: '共用 TokenMix Key；商品文案手选 Gemini 时亦走 TokenMix',
    logoUrl: '/ai-vendors/gemini.png',
  },
  {
    id: 'grok',
    label: 'Grok',
    hint: '共用 TokenMix Key（智能体 /api/meoo-ai-chat）',
    logoUrl: '/ai-vendors/openai.png',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    hint: 'platform.deepseek.com（智能体网关）',
    logoUrl: '/ai-vendors/deepseek.png',
  },
  {
    id: 'kimi',
    label: 'Kimi',
    hint: 'Moonshot · OpenAI 兼容（智能体网关）',
    logoUrl: '/ai-vendors/kimi.png',
  },
]

const BUILTIN_ID_SET = new Set<string>(BUILTIN_AI_VENDOR_IDS)

export function isBuiltinAiVendorId(id: string): boolean {
  return BUILTIN_ID_SET.has(id)
}

/** 磁盘仅保存非内置条目；normalize 后与内置目录合并输出给客户端 */
export function mergeBuiltinAiVendorCatalog(custom: AiVendorCatalogEntry[] | undefined | null): AiVendorCatalogEntry[] {
  const out: AiVendorCatalogEntry[] = BUILTIN_AI_VENDOR_ENTRIES.map((b) => ({ ...b }))
  const seen = new Set<string>(BUILTIN_AI_VENDOR_IDS as unknown as string[])
  const list = Array.isArray(custom) ? custom : []
  for (const e of list) {
    if (!e || typeof e.id !== 'string') continue
    const id = e.id.trim().toLowerCase()
    if (!isValidAiVendorSlug(id) || seen.has(id)) continue
    if (isBuiltinAiVendorId(id)) continue
    const label = typeof e.label === 'string' && e.label.trim() ? e.label.trim() : id
    const hint = typeof e.hint === 'string' && e.hint.trim() ? e.hint.trim().slice(0, 280) : undefined
    const logoUrl = normalizeCatalogLogoUrl(e.logoUrl)
    seen.add(id)
    out.push({ id, label: label.slice(0, 64), hint, ...(logoUrl ? { logoUrl } : {}) })
  }
  return out
}

/** 写入 registry.json 前去重，仅保留自定义厂商 */
export function catalogCustomEntriesOnly(full: AiVendorCatalogEntry[]): AiVendorCatalogEntry[] {
  return full.filter((e) => e && typeof e.id === 'string' && !isBuiltinAiVendorId(e.id.trim()))
}

export function slugifyAiVendorCandidate(label: string, suffix?: string): string {
  let s = label
    .trim()
    .toLowerCase()
    .replace(/[\s]+/g, '_')
    .replace(/[^a-z0-9_-]+/g, '')
    .replace(/^_+|_+$/g, '')
  if (s.length < 2 || !/^[a-z]/.test(s)) {
    s = `vendor_${suffix ?? `${Date.now()}`}`
  }
  if (!isValidAiVendorSlug(s)) {
    return `vendor_${suffix ?? `${Date.now()}`}`
  }
  return s.slice(0, 48)
}

export function normalizeVendorKeysFromDisk(raw: unknown): Partial<Record<string, string>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const o = raw as Record<string, unknown>
  const out: Partial<Record<string, string>> = {}
  for (const [k, v] of Object.entries(o)) {
    if (!isValidAiVendorSlug(k)) continue
    if (typeof v !== 'string') continue
    const t = v.trim()
    if (t) out[k] = t
  }
  return out
}
