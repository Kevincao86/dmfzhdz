import type { AiVendorCatalogEntry } from './opsRegistryTypes.ts'

export const BUILTIN_AI_VENDOR_IDS = ['minimax', 'qwen', 'doubao'] as const
export type BuiltinAiVendorId = (typeof BUILTIN_AI_VENDOR_IDS)[number]

/** 磁盘 / 前端展示：合法的厂商 ID slug（ASCII，小写字母开头） */
export function isValidAiVendorSlug(id: string): boolean {
  return /^[a-z][a-z0-9_-]{1,47}$/.test(id)
}

export const BUILTIN_AI_VENDOR_ENTRIES: AiVendorCatalogEntry[] = [
  { id: 'minimax', label: 'MiniMax', hint: 'platform.minimax.io · OpenAI 兼容' },
  { id: 'qwen', label: '通义千问', hint: '阿里云 DashScope / 通义' },
  { id: 'doubao', label: '豆包', hint: '火山引擎方舟 Ark' },
]

const BUILTIN_ID_SET = new Set<string>(BUILTIN_AI_VENDOR_IDS)

export function isBuiltinAiVendorId(id: string): boolean {
  return BUILTIN_ID_SET.has(id)
}

/** 磁盘仅保存非内置条目；normalize 后与内置三项合并输出给客户端 */
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
    seen.add(id)
    out.push({ id, label: label.slice(0, 64), hint })
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
