/**
 * 抖音来客商品图：从「商品名称/标题」解析主推产品，供生图与修图锚定，避免无关场景。
 */

const LISTING_TITLE_SPLIT = /[|｜/／]/

const PRICE_OR_PROMO_RE =
  /(满\s*\d+\s*元?\s*抵\s*\d+\s*元?|\d+\s*代\s*\d+(\s*元)?|¥\s*\d+(\.\d+)?\s*元?|限时|秒杀|团购价|优惠价)/gi

/** 从团购标题抽取主推产品名（规则优先，供网关与前端共用） */
export function extractMainProductFromListingTitle(title: string): string {
  const raw = title.trim()
  if (!raw) return ''

  let segment = raw.split(LISTING_TITLE_SPLIT).map((p) => p.trim()).filter(Boolean)[0] ?? raw
  segment = segment.replace(/【[^】]*】/g, '').replace(/\[[^\]]*\]/g, '')
  segment = segment.replace(PRICE_OR_PROMO_RE, ' ')
  segment = segment.replace(/[（(][^）)]*[)）]/g, '').replace(/\s+/g, ' ').trim()

  if (segment.length >= 2) return segment.slice(0, 120)
  return raw.slice(0, 120)
}

export function isWeakMainProductAnchor(anchor: string, listingTitle: string): boolean {
  const a = anchor.trim()
  const t = listingTitle.trim()
  if (!a || a.length < 2) return true
  if (/^[\d\s元.]+$/.test(a)) return true
  if (t && a === t) {
    return t.length > 48 || /代金券|团购券|通用券/.test(t) === false && /\d/.test(t)
  }
  return false
}

export type ImageAssistTextFields = {
  product_name: string
  title_draft: string
  listing_title: string
  main_product_heuristic: string
}

/**
 * 生图/修图请求字段：以商品名称（标题）为分析入口；说明仅作次要参考，避免喧宾夺主导致无关成片。
 */
export function buildImageAssistTextFields(
  productName: string,
  productDesc?: string,
): ImageAssistTextFields {
  const listing = productName.trim()
  const main = extractMainProductFromListingTitle(listing)
  const desc = (productDesc ?? '').trim().slice(0, 240)

  const titleCore = `【商品标题·须先解析主推产品再出图】${listing}`
  const title_draft =
    desc && listing && !desc.startsWith(listing)
      ? `${titleCore}\n【说明摘录·次要，勿偏离标题主推】${desc}`
      : titleCore

  return {
    product_name: listing,
    title_draft,
    listing_title: listing,
    main_product_heuristic: main,
  }
}

export function mainProductCategoryHints(anchor: string): string {
  const a = anchor.trim()
  if (/代金券|团购券|优惠券|通兑|代金/.test(a)) {
    return '主推为代金券/团购券类虚拟权益：画面可用简洁券面、到店核销示意、适用百货/门店氛围，禁止生成与券无关的具体单品货架特写。'
  }
  if (/自助|套餐|放题/.test(a)) {
    return '主推为餐饮自助/套餐：突出餐品或就餐场景，勿生成无关零售货架。'
  }
  if (/美容|美发|美甲|spa|护理/i.test(a)) {
    return '主推为到店服务：突出服务过程或效果氛围，勿生成无关商品陈列。'
  }
  return '主推须与标题品类一致，禁止偷换为数码、无关餐饮或卖场空镜。'
}
