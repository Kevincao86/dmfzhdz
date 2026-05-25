/**
 * AI 智能体确认后：将商品方案写入本地草稿箱；商家在商品列表编辑页选择类目与门店后再提交审核。
 */
import type { CreatePlatformId } from '../constants/productCreatePlatforms'
import { createPlatformLabel } from '../constants/productCreatePlatforms'
import { loadMerchantIntelSnapshot } from '../lib/agentMerchantContext'
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

const DEFAULT_SALES_INFO = {
  channel: 'all',
  staff_sales: false,
  stock_limited: false,
  stock_qty: 999,
  sale_time_limited: false,
}

const DEFAULT_TRADE_RULES = {
  consume_date_mode: 'days',
  consume_valid_days: 360,
  non_consume_date_mode: 'all',
  daily_consume_mode: 'all_day',
  daily_all_day: true,
  customer_purchase_limit_mode: 'unlimited',
  after_sale_policy: '随时退',
  reserve_mode: 'not_required',
  coupon_type: 'douyin',
}

const DEFAULT_CONSUME_RULES = {
  in_store_discount: false,
  extra_fee: false,
  voucher_limit: false,
  people_limit: false,
}

/** 本地草稿箱快照（不要求类目/门店/主图齐全，供商家后续在创建商品页补全并提交） */
function buildLocalDraftDetail(plan: AiProductPlanPreview): DouyinProductDetailPayload | null {
  const name = plan.productName.trim()
  const price = plan.suggestedPriceYuan
  if (!name || !Number.isFinite(price) || price <= 0) return null

  const head = plan.headUrl?.trim()
  const productType = plan.productType ?? 1
  const origin = plan.originYuan != null && plan.originYuan > 0 ? plan.originYuan : price
  const comboGroups = comboGroupsFromPlan(plan)

  return {
    out_id: newOutId(),
    category_id: '',
    product_type: productType,
    product_name: name.slice(0, 40),
    product_desc: composeProductDescWithRules(plan.description || name).trim() || undefined,
    price_yuan: price,
    origin_price_yuan: origin,
    head_image_urls: head && /^https?:\/\//i.test(head) ? [head] : [],
    aux_image_urls: [],
    env_image_urls: [],
    poi_ids: [],
    package_combo:
      productType === 1
        ? packageComboFromFormGroups(comboGroups, { productName: name, priceYuan: price })
        : undefined,
    sales_info: { ...DEFAULT_SALES_INFO },
    trade_rules: { ...DEFAULT_TRADE_RULES },
    consume_rules: { ...DEFAULT_CONSUME_RULES },
  }
}

function saveLocalProductDraft(
  plan: AiProductPlanPreview,
  platform: CreatePlatformId,
  platformLabel: string,
): AiProductSubmitItemResult {
  const label = plan.slotLabel ?? plan.productName
  const detail = buildLocalDraftDetail(plan)
  if (!detail) {
    return {
      planLabel: label,
      platform,
      ok: false,
      message: '方案信息不完整（名称/售价），请核对预览后重试。',
    }
  }
  const intel = loadMerchantIntelSnapshot()
  const storeLabel = intel.storeName?.trim() || '—'
  const draftId = newOutId()
  upsertProductEditLibraryDraft({
    id: draftId,
    name: detail.product_name,
    platform: platformLabel,
    store: storeLabel,
    status: '草稿',
    price: detail.price_yuan,
    platformApi: platform,
  })
  saveDraftDetailSnapshot(draftId, { ...detail, product_id: draftId })
  return {
    planLabel: label,
    platform,
    ok: true,
    productId: draftId,
    message: '已保存至商品列表草稿箱，请在编辑页选择类目与门店后提交审核',
  }
}

function storeLabelFromIntel(poiCount: number): string {
  const intel = loadMerchantIntelSnapshot()
  const name = intel.storeName?.trim()
  if (name) return name
  return poiCount > 0 ? `${poiCount} 家门店` : '—'
}

async function submitDouyinPlan(
  plan: AiProductPlanPreview,
  mode: 'draft' | 'submit',
): Promise<AiProductSubmitItemResult> {
  if (mode === 'draft') {
    return saveLocalProductDraft(plan, 'douyin', '抖音来客')
  }
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

  const storeLabel = storeLabelFromIntel(poiIds.length)
  const draftId = newOutId()
  upsertProductEditLibraryDraft({
    id: draftId,
    name: detail.product_name,
    platform: '抖音来客',
    store: storeLabel,
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
      store: storeLabel,
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
  if (mode === 'draft') {
    return saveLocalProductDraft(plan, 'kuaishou', '快手团购')
  }
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

  const storeLabel = storeLabelFromIntel(poiIds.length)
  const draftId = newOutId()
  upsertProductEditLibraryDraft({
    id: draftId,
    name: detail.product_name,
    platform: '快手团购',
    store: storeLabel,
    status: mode === 'submit' ? '审核中' : '草稿',
    price: detail.price_yuan,
    platformApi: 'kuaishou',
  })
  saveDraftDetailSnapshot(draftId, { ...detail, product_id: draftId })

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
  const intel = loadMerchantIntelSnapshot()
  upsertProductEditLibraryDraft({
    id: newOutId(),
    name: plan.productName,
    platform: createPlatformLabel(platform),
    store: intel.storeName?.trim() || '—',
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

export function formatAiProductSubmitSummary(results: AiProductSubmitItemResult[]): string {
  if (!results.length) return '未提交任何商品。'
  const ok = results.filter((r) => r.ok)
  const fail = results.filter((r) => !r.ok)
  const parts: string[] = []
  if (ok.length) {
    parts.push(
      ok
        .map((r) => `${r.planLabel}→${createPlatformLabel(r.platform)}：${r.message}`)
        .join('；'),
    )
  }
  if (fail.length) {
    parts.push(
      fail
        .map((r) => `${r.planLabel}→${createPlatformLabel(r.platform)}失败：${r.message}`)
        .join('；'),
    )
  }
  return parts.join('\n')
}

/** 批量将 AI 商品方案写入本地草稿箱（mode=draft）或提交平台审核（mode=submit） */
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
