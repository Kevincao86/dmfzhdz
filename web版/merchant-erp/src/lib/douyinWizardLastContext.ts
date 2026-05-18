/**
 * 记住最近一次抖音创建商品向导的类目/类型，供 AI 助手确认后自动提交。
 */
import { tenantLocalKey } from './tenantLocalState'

const KEY = 'meoo_douyin_wizard_last_ctx_v1'

export type DouyinWizardLastContext = {
  cat1?: string
  cat2?: string
  cat3: string
  productType: number
  poiIds?: string[]
  updatedAt: string
}

export function loadDouyinWizardLastContext(): DouyinWizardLastContext | null {
  try {
    const raw = window.localStorage.getItem(tenantLocalKey(KEY))
    if (!raw) return null
    const j = JSON.parse(raw) as DouyinWizardLastContext
    return j?.cat3 && j.productType != null ? j : null
  } catch {
    return null
  }
}

export function saveDouyinWizardLastContext(ctx: Omit<DouyinWizardLastContext, 'updatedAt'>): void {
  try {
    const payload: DouyinWizardLastContext = {
      ...ctx,
      updatedAt: new Date().toISOString(),
    }
    window.localStorage.setItem(tenantLocalKey(KEY), JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}
