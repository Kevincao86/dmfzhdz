/**
 * AI 助手确认创建商品后，预填抖音创建向导（sessionStorage，一次性消费）。
 */
const SESSION_KEY = 'meoo_ai_product_draft_pending'

export type AiProductDraft = {
  productName: string
  productDesc?: string
  priceYuan?: string
  originYuan?: string
  platform: 'douyin'
  /** 套餐结构说明，供向导参考 */
  comboSummary?: string
  planNotes?: string
}

export function saveAiProductDraft(draft: AiProductDraft): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(draft))
  } catch {
    /* ignore */
  }
}

export function peekAiProductDraft(): AiProductDraft | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const j = JSON.parse(raw) as AiProductDraft
    return j?.productName ? j : null
  } catch {
    return null
  }
}

export function consumeAiProductDraft(): AiProductDraft | null {
  const d = peekAiProductDraft()
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
  return d
}
