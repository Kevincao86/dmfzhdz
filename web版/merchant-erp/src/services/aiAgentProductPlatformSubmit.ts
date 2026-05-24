/**
 * AI 智能体确认后：直接将商品方案提交平台审核，并同步写入本地草稿箱。
 */
import type { CreatePlatformId } from '../constants/productCreatePlatforms'
import { createPlatformLabel } from '../constants/productCreatePlatforms'
import type { AiProductPlanPreview } from '../lib/aiAgentTypes'
import { loadDouyinWizardLastContext } from '../lib/douyinWizardLastContext'
import {
  packageComboFromFormGroups,
  type ComboGroupFormRow,
} from '../lib/douyinComboGroupsForm'
import { composeProductDescWithRules } from '../lib/douyinProductRuleText'
import { readMerchantSession } from '../lib/merchantSession'
import {
  replaceProductEditLibraryRowId,
  upsertProductEditLibraryDraft,
} from '../lib/productEditLibrary'
import { saveDraftDetailSnapshot } from '../lib/productDraftSnapshot'
import { getDouyinStores } from '../services/douyinMerchantApi'
import {
  postDouyinGoodsProductSave,
  type DouyinProductDetailPayload,
} from '../services/douyinProductApi'
import {
  postKuaishouGoodsProductSave,
  type KuaishouProductDetailPayload,
} from '../services/kuaishouProductApi'
import { postPlatformProductDraft } from '../services/productListingApi'

export type AiProductSubmitItemResult = {
  planLabel: string
  platform: CreatePlatformId
  ok: boolean
  message: string
  productId?: string
}

function newOutId(): string {
  return `erp-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function comboGroupsFromPlan(plan: AiProductPlanPreview): ComboGroupFormRow[] {
  const lines = plan.comboLines.filter(Boolean)
  const items =
    lines.length > 0
      ? lines.map((name, i) => ({
          id: `ci-${i}`,
          name: name.trim(),
          priceYuan: '',
          quantity: 1,
        }))
      : [{ id: 'ci-0', name: plan.productName.trim(), priceYuan: '', quantity: 1 }]
  return [
    {
      id: 'cg-0',
      groupName: '套餐内容',
      pickRule: '全部必选',
      items,
    },
  ]
}

async function resolveDouyinPoiIds(fallback?: string[]): Promise<string[]> {
  if (fallback?.length) return fallback
  const token = readMerchantSession('meoo_douyin_merchant_token')
  if (!token) return []
  try {
    const r = await getDouyinStores({
      accessToken: token,
      page: 1,
      pageSize: 20,
      claimScope: 'claimed',
      relationType: 'all',
    })
    if (!r.ok) return []
    const ids = r.items.map((row) => row.id).filter((id) => id && id !== '-')
    return ids.slice(0, 20)
  } catch {
    return []
  }
}

function buildDouyinDetail(
  plan: AiProductPlanPreview,
  ctx: { cat3: string; productType: number; poiIds: string[] },
): DouyinProductDetailPayload | null {
  const name = plan.productName.trim()
  const price = plan.suggestedPriceYuan
  const head = plan.headUrl?.trim()
  if (!name || !Number.isFinite(price) || price <= 0) return null
  if (!head || !/^https?:\/\//i.test(head)) return null
  if (!ctx.cat3 || ctx.productType == null || ctx.poiIds.length === 0) return null

  const productType = plan.productType ?? ctx.productType
  const origin = plan.originYuan != null && plan.originYuan > 0 ? plan.originYuan : price
  const comboGroups = comboGroupsFromPlan(plan)

  return {
    out_id: newOutId(),
    category_id: ctx.cat3,
    product_type: productType,
    product_name: name.slice(0, 40),
    product_desc: composeProductDescWithRules(plan.description || name).trim() || undefined,
    price_yuan: price,
    origin_price_yuan: origin,
    head_image_urls: [head],
    aux_image_urls: [],
    env_image_urls: [],
    poi_ids: ctx.poiIds,
    package_combo:
      productType === 1
        ? packageComboFromFormGroups(comboGroups, { productName: name, priceYuan: price })
        : undefined,
    sales_info: {
      channel: 'all',
      staff_sales: false,
      stock_limited: false,
      stock_qty: 999,
      sale_time_limited: false,
    },
    trade_rules: {
      consume_date_mode: 'days',
      consume_valid_days: 360,
      non_consume_date_mode: 'all',
      daily_consume_mode: 'all_day',
      daily_all_day: true,
      customer_purchase_limit_mode: 'unlimited',
      after_sale_policy: '随时退',
      reserve_mode: 'not_required',
      coupon_type: 'douyin',
    },
    consume_rules: {
      in_store_discount: false,
      extra_fee: false,
      voucher_limit: false,
      people_limit: false,
    },
  }
}

async function submitDouyinPlan(
  plan: AiProductPlanPreview,
  mode: 'draft' | 'submit',
): Promise<AiProductSubmitItemResult> {
  const label = plan.slotLabel ?? plan.productName
  const lastCtx = loadDouyinWizardLastContext()
  if (!lastCtx?.cat3 || lastCtx.productType == null) {
    return {
      planLabel: label,
      platform: 'douyin',
      ok: false,
      message: '缺少类目上下文：请先在「创建商品」页成功保存一次类目与门店，之后可在此一键提交。',
    }
  }
  const poiIds = await resolveDouyinPoiIds(lastCtx.poiIds)
  const detail = buildDouyinDetail(plan, {
    cat3: lastCtx.cat3,
    productType: lastCtx.productType,
    poiIds,
  })
  if (!detail) {
    return {
      planLabel: label,
      platform: 'douyin',
      ok: false,
      message: '方案信息不完整（名称/售价/主图/门店），请核对预览后重试。',
    }
  }

  const draftId = newOutId()
  upsertProductEditLibraryDraft({
    id: draftId,
    name: detail.product_name,
    platform: '抖音来客',
    store: `${poiIds.length} 家门店`,
    status: mode === 'submit' ? '审核中' : '草稿',
    price: detail.price_yuan,
    platformApi: 'douyin',
  })
  saveDraftDetailSnapshot(draftId, { ...detail, product_id: draftId })

  const r = await postDouyinGoodsProductSave({ mode, detail })
  if (!r.ok) {
    return { planLabel: label, platform: 'douyin', ok: false, message: r.message }
  }
  const pid = r.product_id?.trim() || draftId
  if (pid !== draftId) {
    replaceProductEditLibraryRowId(draftId, {
      id: pid,
      name: detail.product_name,
      platform: '抖音来客',
      store: `${poiIds.length} 家门店`,
      status: mode === 'submit' ? '审核中' : '草稿',
      price: detail.price_yuan,
      platformApi: 'douyin',
    })
  }
  return {
    planLabel: label,
    platform: 'douyin',
    ok: true,
    productId: pid,
    message:
      mode === 'submit'
        ? `已提交抖音来客审核（${pid}）`
        : `已保存至草稿箱并同步来客（${pid}）`,
  }
}

async function submitKuaishouPlan(
  plan: AiProductPlanPreview,
  mode: 'draft' | 'submit',
): Promise<AiProductSubmitItemResult> {
  const label = plan.slotLabel ?? plan.productName
  const lastCtx = loadDouyinWizardLastContext()
  if (!lastCtx?.cat3 || lastCtx.productType == null) {
    return {
      planLabel: label,
      platform: 'kuaishou',
      ok: false,
      message: '缺少类目上下文：请先完成一次商品创建向导的类目保存。',
    }
  }
  const poiIds = await resolveDouyinPoiIds(lastCtx.poiIds)
  const detail = buildDouyinDetail(plan, {
    cat3: lastCtx.cat3,
    productType: lastCtx.productType,
    poiIds,
  }) as KuaishouProductDetailPayload | null
  if (!detail) {
    return {
      planLabel: label,
      platform: 'kuaishou',
      ok: false,
      message: '方案信息不完整，请核对预览后重试。',
    }
  }

  const draftId = newOutId()
  upsertProductEditLibraryDraft({
    id: draftId,
    name: detail.product_name,
    platform: '快手团购',
    store: `${poiIds.length} 家门店`,
    status: mode === 'submit' ? '审核中' : '草稿',
    price: detail.price_yuan,
    platformApi: 'kuaishou',
  })

  const r = await postKuaishouGoodsProductSave({ mode, detail })
  if (!r.ok) {
    return { planLabel: label, platform: 'kuaishou', ok: false, message: r.message }
  }
  const pid = r.product_id?.trim() || draftId
  return {
    planLabel: label,
    platform: 'kuaishou',
    ok: true,
    productId: pid,
    message:
      mode === 'submit'
        ? `已提交快手团购审核（${pid}）`
        : `已保存至草稿箱（${pid}）`,
  }
}

async function submitGenericDraft(
  plan: AiProductPlanPreview,
  platform: CreatePlatformId,
): Promise<AiProductSubmitItemResult> {
  const label = plan.slotLabel ?? plan.productName
  const r = await postPlatformProductDraft(platform, {
    title: plan.productName,
    priceYuan: plan.suggestedPriceYuan,
    description: plan.description,
  })
  upsertProductEditLibraryDraft({
    id: newOutId(),
    name: plan.productName,
    platform: createPlatformLabel(platform),
    store: '—',
    status: '草稿',
    price: plan.suggestedPriceYuan,
    platformApi: platform,
  })
  return {
    planLabel: label,
    platform,
    ok: r.ok,
    message: r.ok
      ? r.message ?? `已写入${createPlatformLabel(platform)}草稿`
      : r.message,
    productId: r.ok ? r.draftId : undefined,
  }
}

/** 批量提交 AI 商品方案至所选平台（提交审核 + 本地草稿箱同步） */
export async function submitAiProductPlansToPlatforms(
  plans: AiProductPlanPreview[],
  platforms: CreatePlatformId[],
  mode: 'draft' | 'submit' = 'submit',
): Promise<AiProductSubmitItemResult[]> {
  const results: AiProductSubmitItemResult[] = []
  for (const plan of plans) {
    for (const platform of platforms) {
      if (platform === 'douyin') {
        results.push(await submitDouyinPlan(plan, mode))
      } else if (platform === 'kuaishou') {
        results.push(await submitKuaishouPlan(plan, mode))
      } else {
        results.push(await submitGenericDraft(plan, platform))
      }
    }
  }
  try {
    window.dispatchEvent(new CustomEvent('meoo-product-edit-library-changed'))
  } catch {
    /* ignore */
  }
  return results
}
