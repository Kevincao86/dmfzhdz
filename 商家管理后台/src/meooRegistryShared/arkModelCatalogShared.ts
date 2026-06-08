/**
 * 豆包内置模型目录（与 ERP `arkModelCatalog.ts` 保持同步，供运营台 UI 自动填充）。
 */
export type ArkCatalogEntry = {
  label: string
  modelId: string
  kind: 'chat' | 'video_both' | 'video_t2v' | 'video_i2v'
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
  { label: 'Doubao-Seedance-1.5-pro', modelId: 'doubao-seedance-1-5-pro-251215', kind: 'video_both', priority: 1 },
  { label: 'Doubao-Seedance-1.0-pro-fast', modelId: 'doubao-seedance-1-0-pro-fast-250528', kind: 'video_both', priority: 2 },
  { label: 'Doubao-Seedance-1.0-pro', modelId: 'doubao-seedance-1-0-pro-250528', kind: 'video_both', priority: 3 },
  { label: 'Doubao-视频生成-Seaweed', modelId: 'doubao-seaweed-241128', kind: 'video_both', priority: 4 },
  { label: 'Doubao-Seedance-1.0-lite-t2v', modelId: 'doubao-seedance-1-0-lite-t2v-250428', kind: 'video_t2v', priority: 5 },
  { label: 'Doubao-Seedance-1.0-lite-i2v', modelId: 'doubao-seedance-1-0-lite-i2v-250428', kind: 'video_i2v', priority: 5 },
  { label: 'Wan2.1-14B', modelId: 'wan2-1-14b-250224', kind: 'video_both', priority: 6 },
]

export function catalogEndpointsCsv(entries: readonly ArkCatalogEntry[]): string {
  return entries.map((e) => `${e.label}|${e.modelId}`).join(', ')
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
    if (!id || seen.has(id)) return
    seen.add(id)
    rows.push({ label: label.trim() || id, modelId: id })
  }
  for (const row of parseEndpointsCsv(currentRaw)) add(row.label, row.modelId)
  for (const e of [...catalog].sort((a, b) => a.priority - b.priority)) add(e.label, e.modelId)
  return rows.map((r) => (r.label !== r.modelId ? `${r.label}|${r.modelId}` : r.modelId)).join(', ')
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
