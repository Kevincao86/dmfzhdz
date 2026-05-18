/**
 * 抖音来客商品图：结合「商品类型 + 商品标题」解析主推产品，供生图与修图锚定。
 */

const LISTING_TITLE_SPLIT = /[|｜/／]/

/** 去掉营销噪音，但保留「90代100」等券面字样（在代金券专用解析里单独处理） */
const PRICE_OR_PROMO_STRIP_RE =
  /(¥\s*\d+(\.\d+)?\s*元?|限时|秒杀|团购价|优惠价)/gi

/** 是否为代金券类商品（优先看类型标签，其次标题） */
export function isVoucherGoodsProduct(
  productType: number | null | undefined,
  productTypeLabel?: string,
  listingTitle?: string,
): boolean {
  const label = (productTypeLabel ?? '').trim()
  if (/代金券|团购券|优惠券|通兑券/.test(label)) return true
  if (productType === 11) return true
  const t = (listingTitle ?? '').trim()
  return /代金券|团购券|优惠券|通兑/.test(t)
}

/** 是否为团购套餐类（非代金券） */
export function isGroupBuyGoodsProduct(
  productType: number | null | undefined,
  productTypeLabel?: string,
): boolean {
  if (isVoucherGoodsProduct(productType, productTypeLabel)) return false
  const label = (productTypeLabel ?? '').trim()
  if (/团购|套餐|团餐|自助/.test(label)) return true
  return productType === 1
}

/** 从标题提取「xx代xx代金券」或「满xx抵xx」券面主文案 */
export function extractVoucherDenomPhraseFromTitle(title: string): string | null {
  const t = title.trim()
  if (!t) return null
  const daiVoucher = t.match(/(\d+)\s*代\s*(\d+)\s*元?\s*代金券/)
  if (daiVoucher) return `${daiVoucher[1]}代${daiVoucher[2]}代金券`
  const dai = t.match(/(\d+)\s*代\s*(\d+)\s*元?/)
  if (dai && /代金券|团购券|优惠券|券/.test(t)) return `${dai[1]}代${dai[2]}代金券`
  const manDi = t.match(/满\s*(\d+)\s*元?\s*抵\s*(\d+)\s*元?/)
  if (manDi && /代金券|团购券|优惠券|券/.test(t)) return `满${manDi[1]}元抵${manDi[2]}元`
  return null
}

/** 从团购标题抽取品类/券种描述（去掉满减等，保留「通用代金券」等） */
export function extractMainProductFromListingTitle(title: string): string {
  const raw = title.trim()
  if (!raw) return ''

  let segment = raw.split(LISTING_TITLE_SPLIT).map((p) => p.trim()).filter(Boolean)[0] ?? raw
  segment = segment.replace(/【[^】]*】/g, '').replace(/\[[^\]]*\]/g, '')
  segment = segment.replace(/满\s*\d+\s*元?\s*抵\s*\d+\s*元?/gi, ' ')
  segment = segment.replace(/\d+\s*代\s*\d+(\s*元)?\s*代金券?/gi, ' ')
  segment = segment.replace(PRICE_OR_PROMO_STRIP_RE, ' ')
  segment = segment.replace(/[（(][^）)]*[)）]/g, '').replace(/\s+/g, ' ').trim()

  if (segment.length >= 2) return segment.slice(0, 120)
  return raw.slice(0, 120)
}

/** 生图主推：类型 + 标题；代金券且含 xx代xx 时以券面字样为主 */
export function resolveMainProductForImage(input: {
  listingTitle: string
  productType?: number | null
  productTypeLabel?: string
}): string {
  const listing = input.listingTitle.trim()
  if (!listing) return ''

  const isVoucher = isVoucherGoodsProduct(
    input.productType,
    input.productTypeLabel,
    listing,
  )
  const denom = extractVoucherDenomPhraseFromTitle(listing)

  if (isVoucher && denom) {
    const category = extractMainProductFromListingTitle(listing)
    if (category && !category.includes(denom) && category.length <= 40) {
      return `${denom}（${category}）`.slice(0, 120)
    }
    return denom.slice(0, 120)
  }

  if (isVoucher) {
    const cat = extractMainProductFromListingTitle(listing)
    if (cat.length >= 2) return cat
  }

  return extractMainProductFromListingTitle(listing) || listing.slice(0, 120)
}

/** 代金券标题推断售价/划线价（满90抵100 → 售90 划100；90代100 → 售90 划100） */
export function inferVoucherPricesFromTitle(title: string): { sale?: number; origin?: number } {
  const t = title.trim()
  if (!t) return {}
  const dai = t.match(/(\d+)\s*代\s*(\d+)/)
  if (dai) {
    const sale = Number(dai[1])
    const origin = Number(dai[2])
    if (sale > 0 && origin > 0) return { sale, origin }
  }
  const manDi = t.match(/满\s*(\d+)\s*元?\s*抵\s*(\d+)\s*元?/)
  if (manDi) {
    const sale = Number(manDi[1])
    const origin = Number(manDi[2])
    if (sale > 0 && origin > 0) return { sale, origin }
  }
  return {}
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
  goods_product_type?: number
  goods_product_type_label?: string
}

/**
 * 生图/修图请求字段：商品类型 + 标题双锚定；说明仅作次要参考。
 */
export function buildImageAssistTextFields(
  productName: string,
  productDesc?: string,
  opts?: {
    productType?: number | null
    productTypeLabel?: string
  },
): ImageAssistTextFields {
  const listing = productName.trim()
  const typeLabel = (opts?.productTypeLabel ?? '').trim()
  const productType = opts?.productType ?? undefined
  const main = resolveMainProductForImage({
    listingTitle: listing,
    productType,
    productTypeLabel: typeLabel,
  })
  const desc = (productDesc ?? '').trim().slice(0, 240)

  const typeLine = isVoucherGoodsProduct(productType, typeLabel, listing)
    ? `【商品类型】代金券（须生成券面/核销示意，禁止无关实体货架或玩具模型）`
    : isGroupBuyGoodsProduct(productType, typeLabel)
      ? `【商品类型】团购套餐（突出套餐内容/就餐场景）`
      : typeLabel
        ? `【商品类型】${typeLabel}`
        : productType != null
          ? `【商品类型】product_type=${productType}`
          : ''

  const titleCore = `${typeLine ? `${typeLine}\n` : ''}【商品标题·须先解析主推产品再出图】${listing}`
  const title_draft =
    desc && listing && !desc.startsWith(listing)
      ? `${titleCore}\n【说明摘录·次要，勿偏离类型与标题主推】${desc}`
      : titleCore

  return {
    product_name: listing,
    title_draft,
    listing_title: listing,
    main_product_heuristic: main,
    ...(productType != null ? { goods_product_type: productType } : {}),
    ...(typeLabel ? { goods_product_type_label: typeLabel } : {}),
  }
}

export function mainProductCategoryHints(
  anchor: string,
  opts?: { isVoucher?: boolean; isGroupBuy?: boolean },
): string {
  const a = anchor.trim()
  const isVoucher = opts?.isVoucher ?? /代金券|团购券|优惠券|通兑|代金/.test(a)
  if (isVoucher) {
    if (/\d+\s*代\s*\d+|满\s*\d+.*抵\s*\d+/.test(a)) {
      return `主推为代金券，主图须为券面/海报风格，醒目展示「${a.replace(/（[^）]*）/g, '').slice(0, 32)}」等价字样，禁止玩具店模型、无关百货货架、建筑微缩模型等与券面无关画面。`
    }
    return '主推为代金券/团购券：简洁券面、到店核销示意；禁止与券无关的具体货架、玩具模型、展厅空镜。'
  }
  if (opts?.isGroupBuy || /自助|套餐|放题/.test(a)) {
    return '主推为餐饮团购套餐：突出餐品或就餐场景，勿生成无关零售货架或代金券券面。'
  }
  if (/美容|美发|美甲|spa|护理/i.test(a)) {
    return '主推为到店服务：突出服务过程或效果氛围，勿生成无关商品陈列。'
  }
  return '主推须与商品类型及标题一致，禁止偷换为数码、无关餐饮或卖场空镜。'
}
