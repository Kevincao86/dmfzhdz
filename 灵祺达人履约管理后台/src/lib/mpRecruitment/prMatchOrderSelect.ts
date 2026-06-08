import type { PrBoardId } from './prRecommendBoard'
import { boardLabel } from './prRecommendBoard'

export const PR_MATCH_RECENT = 'recent'

const STORAGE_KEY = 'meoo_pr_match_order_v1'

export type PrMatchOrderOption = {
  id: string
  label: string
  mpOrderId: string
  title: string
}

export function readPrMatchOrderId(board: PrBoardId): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const o = raw ? (JSON.parse(raw) as Record<string, string>) : {}
    return String(o[board] || PR_MATCH_RECENT)
  } catch {
    return PR_MATCH_RECENT
  }
}

export function writePrMatchOrderId(board: PrBoardId, mpOrderId: string) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const o = raw ? (JSON.parse(raw) as Record<string, string>) : {}
    o[board] = String(mpOrderId || PR_MATCH_RECENT)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(o))
  } catch {
    /* ignore */
  }
}

export function buildPrMatchOrderOptions(
  packs: { row: { id: string; title?: string } }[],
): PrMatchOrderOption[] {
  const opts: PrMatchOrderOption[] = [
    { id: PR_MATCH_RECENT, label: '最近发单（合并匹配）', mpOrderId: PR_MATCH_RECENT, title: '' },
  ]
  for (const p of packs) {
    const id = String(p.row.id || '').trim()
    if (!id) continue
    const title = String(p.row.title || id).trim()
    opts.push({
      id,
      label: title.length > 22 ? `${title.slice(0, 20)}…` : title,
      mpOrderId: id,
      title,
    })
  }
  return opts
}

export function filterPrMatchOrderOptions(options: PrMatchOrderOption[], keyword: string): PrMatchOrderOption[] {
  const kw = String(keyword || '').trim().toLowerCase()
  if (!kw) return options
  return options.filter((o) => {
    const label = String(o.label || '').toLowerCase()
    const title = String(o.title || '').toLowerCase()
    const id = String(o.id || '').toLowerCase()
    return label.includes(kw) || title.includes(kw) || id.includes(kw)
  })
}

export function matchHintForSelection(
  board: PrBoardId,
  selectedId: string,
  options: PrMatchOrderOption[],
  recentCount: number,
): string {
  if (selectedId && selectedId !== PR_MATCH_RECENT) {
    const hit = options.find((o) => o.id === selectedId)
    if (hit?.title) {
      return `按招募单「${hit.title}」智能匹配 · 按匹配分从高到低`
    }
  }
  const label = boardLabel(board)
  if (recentCount > 0) {
    return `已根据您最近 ${recentCount} 条${label}招募要求智能匹配 · 按匹配分从高到低`
  }
  return `发${label}招募后，将按发单要求智能推荐${label}`
}
