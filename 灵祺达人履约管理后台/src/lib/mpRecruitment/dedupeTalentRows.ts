import type { TalentCardRow } from './types'

/** 推荐列表按 id 去重，保留首次出现（含 matchScore 的 enriched 行优先由调用方保证顺序） */
export function dedupeTalentRows(rows: TalentCardRow[]): TalentCardRow[] {
  const seen = new Set<string>()
  const out: TalentCardRow[] = []
  for (const r of rows) {
    if (!r) continue
    const id = String(r.id || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(r)
  }
  return out
}
