/**
 * 豆包内置模型目录（与 ERP `arkModelCatalog.ts` 保持同步，供运营台 UI 自动填充）。
 */
export type ArkCatalogEntry = {
  label: string
  modelId: string
  kind:
    | 'chat'
    | 'video_both'
    | 'video_t2v'
    | 'video_i2v'
    | 'video_r2v'
    | 'video_portrait'
    | 'video_edit'
  priority: number
}

export const DOUBAO_CHAT_CATALOG: ArkCatalogEntry[] = [
  { label: 'Doubao-Seed-2.0-pro', modelId: 'doubao-seed-2-0-pro-251015', kind: 'chat', priority: 1 },
  { label: 'Doubao-Seed-2.0-lite', modelId: 'doubao-seed-2-0-lite-251015', kind: 'chat', priority: 2 },
  { label: 'Doubao-Seed-2.0-mini', modelId: 'doubao-seed-2-0-mini-251015', kind: 'chat', priority: 3 },
  { label: 'Doubao-Seed-1.8', modelId: 'doubao-seed-1-8-251228', kind: 'chat', priority: 4 },
  { label: 'Doubao-Seed-2.0-Code', modelId: 'doubao-seed-2-0-code-251015', kind: 'chat', priority: 5 },
  { label: 'Doubao-Seed-Character', modelId: 'doubao-seed-character-251128', kind: 'chat', priority: 6 },
]

export const DOUBAO_VIDEO_CATALOG: ArkCatalogEntry[] = [
  { label: 'Doubao-Seedance-2.5', modelId: 'doubao-seedance-2-5-260628', kind: 'video_both', priority: 1 },
  { label: 'Doubao-Seedance-2.0', modelId: 'doubao-seedance-2-0-260128', kind: 'video_both', priority: 2 },
  { label: 'Doubao-Seedance-2.0-fast', modelId: 'doubao-seedance-2-0-fast-260128', kind: 'video_both', priority: 3 },
  { label: 'Doubao-Seedance-2.0-mini', modelId: 'doubao-seedance-2-0-mini-260615', kind: 'video_both', priority: 4 },
  { label: 'Doubao-Seedance-1.0-pro', modelId: 'doubao-seedance-1-0-pro-250528', kind: 'video_both', priority: 5 },
  { label: 'Doubao-Seedance-1.0-pro-fast', modelId: 'doubao-seedance-1-0-pro-fast-250528', kind: 'video_both', priority: 6 },
  { label: 'Doubao-视频生成-Seaweed', modelId: 'doubao-seaweed-241128', kind: 'video_both', priority: 7 },
  { label: 'Doubao-Seedance-1.0-lite-t2v', modelId: 'doubao-seedance-1-0-lite-t2v-250428', kind: 'video_t2v', priority: 8 },
  { label: 'Doubao-Seedance-1.0-lite-i2v', modelId: 'doubao-seedance-1-0-lite-i2v-250428', kind: 'video_i2v', priority: 8 },
  { label: 'Wan2.1-14B', modelId: 'wan2-1-14b-250224', kind: 'video_both', priority: 9 },
  { label: 'Doubao-Seedance-1.5-pro', modelId: 'doubao-seedance-1-5-pro-251215', kind: 'video_both', priority: 20 },
]

/** 火山常返回带点号版本或短名；勾选/去重按规范化 ID 比较。 */
const ARK_MODEL_ID_ALIASES: Record<string, string> = {
  'doubao-seedance-2.5': 'doubao-seedance-2-5-260628',
  'doubao-seedance-2-5': 'doubao-seedance-2-5-260628',
  'seedance-2.5': 'doubao-seedance-2-5-260628',
  'seedance-2-5': 'doubao-seedance-2-5-260628',
  'doubao-seedance-2.0': 'doubao-seedance-2-0-260128',
  'doubao-seedance-2-0': 'doubao-seedance-2-0-260128',
  'doubao-seedance-2.0-fast': 'doubao-seedance-2-0-fast-260128',
  'doubao-seedance-2-0-fast': 'doubao-seedance-2-0-fast-260128',
  'doubao-seedance-2.0-mini': 'doubao-seedance-2-0-mini-260615',
  'doubao-seedance-2-0-mini': 'doubao-seedance-2-0-mini-260615',
}

export function normalizeArkCatalogModelId(id: string): string {
  const raw = id.trim()
  if (!raw) return ''
  if (/^ep-/i.test(raw)) return raw.toLowerCase()
  let t = raw.toLowerCase()
  t = t.replace(/doubao-seedance-(\d+)\.(\d+)/g, 'doubao-seedance-$1-$2')
  t = t.replace(/doubao-seed-(\d+)\.(\d+)/g, 'doubao-seed-$1-$2')
  t = t.replace(/wan2\.(\d+)/g, 'wan2-$1')
  return ARK_MODEL_ID_ALIASES[t] ?? t
}

export function arkModelIdsMatch(a: string, b: string): boolean {
  const na = normalizeArkCatalogModelId(a)
  const nb = normalizeArkCatalogModelId(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const stripDate = (s: string) => s.replace(/-\d{6}$/, '')
  const sa = stripDate(na)
  const sb = stripDate(nb)
  return sa.length >= 12 && sa === sb
}

export function catalogEndpointsCsv(entries: readonly ArkCatalogEntry[]): string {
  return entries.map((e) => `${e.label}|${e.modelId}`).join(', ')
}

export function formatEndpointsCsv(rows: readonly { label: string; modelId: string }[]): string {
  return rows
    .map((r) => {
      const id = r.modelId.trim()
      if (!id) return ''
      const label = (r.label || id).trim() || id
      return label !== id ? `${label}|${id}` : id
    })
    .filter(Boolean)
    .join(', ')
}

export function parseEndpointsCsv(raw: string): { label: string; modelId: string }[] {
  const out: { label: string; modelId: string }[] = []
  for (const part of String(raw ?? '').split(',')) {
    const seg = part.trim()
    if (!seg) continue
    const pipes = seg.split('|').map((s) => s.trim())
    if (pipes.length >= 2 && pipes[1]) {
      out.push({ label: pipes[0] || pipes[1], modelId: pipes[1] })
    } else if (pipes[0]) {
      out.push({ label: pipes[0], modelId: pipes[0] })
    }
  }
  return out
}

export function mergeCatalogIntoCsv(
  currentRaw: string,
  catalog: readonly ArkCatalogEntry[],
): string {
  const seen = new Set<string>()
  const rows: { label: string; modelId: string }[] = []
  const add = (label: string, modelId: string) => {
    const id = modelId.trim()
    if (!id) return
    const key = normalizeArkCatalogModelId(id) || id
    if (seen.has(key)) return
    seen.add(key)
    rows.push({ label: label.trim() || id, modelId: id })
  }
  for (const row of parseEndpointsCsv(currentRaw)) add(row.label, row.modelId)
  for (const e of [...catalog].sort((a, b) => a.priority - b.priority)) add(e.label, e.modelId)
  return formatEndpointsCsv(rows)
}

/** 内置目录 + 已保存/火山拉回的额外 ID，避免勾选列表看不到 Seedance 2.5 等新模型。 */
export function unionCatalogWithParsed(
  catalog: readonly ArkCatalogEntry[],
  parsed: readonly { label: string; modelId: string }[],
): ArkCatalogEntry[] {
  const out: ArkCatalogEntry[] = [...catalog]
  const fallbackKind = catalog[0]?.kind ?? 'chat'
  for (const p of parsed) {
    const id = p.modelId.trim()
    if (!id) continue
    if (out.some((e) => arkModelIdsMatch(e.modelId, id))) continue
    out.push({
      label: (p.label || id).trim() || id,
      modelId: id,
      kind: fallbackKind,
      priority: 100 + out.length,
    })
  }
  return out
}

export function filterCatalog(
  catalog: readonly ArkCatalogEntry[],
  query: string,
): ArkCatalogEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...catalog]
  return catalog.filter(
    (e) =>
      e.label.toLowerCase().includes(q) ||
      e.modelId.toLowerCase().includes(q) ||
      e.kind.toLowerCase().includes(q),
  )
}
