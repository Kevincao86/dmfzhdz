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
  headUrl?: string
  productType?: number
  comboSummary?: string
  planNotes?: string
  /** 确认后尝试自动保存并提交审核（需本机曾成功选过类目） */
  autoSubmit?: boolean
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

const BATCH_KEY = 'meoo_ai_product_drafts_batch'

/** 多方案确认：首项立即预填创建页，其余排队 */
export function saveAiProductDraftBatch(items: AiProductDraft[]): void {
  if (!items.length) return
  saveAiProductDraft(items[0])
  try {
    if (items.length > 1) {
      sessionStorage.setItem(BATCH_KEY, JSON.stringify(items.slice(1)))
    } else {
      sessionStorage.removeItem(BATCH_KEY)
    }
  } catch {
    /* ignore */
  }
}

export function peekAiProductDraftBatchCount(): number {
  try {
    const raw = sessionStorage.getItem(BATCH_KEY)
    if (!raw) return 0
    const arr = JSON.parse(raw) as AiProductDraft[]
    return Array.isArray(arr) ? arr.length : 0
  } catch {
    return 0
  }
}
