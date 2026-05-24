import type { CreatePlatformId } from '../constants/productCreatePlatforms'
import { createPlatformLabel } from '../constants/productCreatePlatforms'
import { loadMerchantIntelSnapshot } from './agentMerchantContext'
import type { AiProductPlanPreview } from './aiAgentTypes'
import { upsertProductEditLibraryDraft, type ProductEditLibraryRow } from './productEditLibrary'

function platformApiFromId(id: CreatePlatformId): NonNullable<ProductEditLibraryRow['platformApi']> {
  switch (id) {
    case 'kuaishou':
    case 'meituan':
    case 'xiaohongshu':
    case 'jd':
    case 'eleme':
    case 'meituan_waimai':
    case 'jd_waimai':
      return id
    default:
      return 'douyin'
  }
}

function newLibraryDraftId(plan: AiProductPlanPreview): string {
  const hint = (plan.slotKey ?? plan.slotLabel ?? plan.productName ?? 'plan')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 28)
  return `ai-${hint}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/** AI 确认创建/保存草稿时，写入商品列表「本地草稿」库（与创建页保存草稿同源） */
export function persistAiProductPlansToEditLibrary(
  plans: AiProductPlanPreview[],
  primaryPlatform: CreatePlatformId = 'douyin',
): number {
  const ready = plans.filter((pl) => pl.enrichStatus !== 'error' && pl.productName?.trim())
  if (!ready.length) return 0

  const intel = loadMerchantIntelSnapshot()
  const store = intel.storeName?.trim() || '—'
  const platformLabel = createPlatformLabel(primaryPlatform)
  const platformApi = platformApiFromId(primaryPlatform)

  let count = 0
  for (const pl of ready) {
    upsertProductEditLibraryDraft({
      id: newLibraryDraftId(pl),
      name: pl.productName.trim(),
      platform: platformLabel,
      store,
      status: '草稿',
      price: Math.max(0, Math.round(Number(pl.suggestedPriceYuan) || 0)),
      platformApi,
    })
    count++
  }
  return count
}
