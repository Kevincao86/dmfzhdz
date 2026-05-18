/**
 * 抖音来客商品图：结合「商品类型 + 商品标题」解析主推产品，供生图与修图锚定。
 */

const LISTING_TITLE_SPLIT = /[|｜/／]/

/** 去掉营销噪音，但保留「90代100」等券面字样（在代金券专用解析里单独处理） */
const PRICE_OR_PROMO_STRIP_RE =
  /(¥\s*\d+(\.\d+)?\s*元?|限时|秒杀|团购价|优惠价)/gi

/** ERP 选「代金券」常为 product_type=2；OpenAPI 保存常为 11 */
const VOUCHER_PRODUCT_TYPES = new Set([2, 11])

/** 是否为代金券类商品（优先看类型标签，其次标题） */
export function isVoucherGoodsProduct(
  productType: number | null | undefined,
  productTypeLabel?: string,
  listingTitle?: string,
): boolean {
  const label = (productTypeLabel ?? '').trim()
  if (/代金券|团购券|优惠券|通兑券/.test(label)) return true
  if (productType != null && VOUCHER_PRODUCT_TYPES.has(productType)) return true
  const t = (listingTitle ?? '').trim()
  return /代金券|团购券|优惠券|通兑/.test(t)
}

/** 标题/表单中的「代」面额：90元代100元、90代100、满90抵100 */
const DAI_YUAN_IN_TITLE =
  /(\d+)\s*元\s*代\s*(\d+)\s*元|(\d+)\s*元?\s*代\s*(\d+)\s*元?|满\s*(\d+)\s*元?\s*抵\s*(\d+)\s*元?/i

function parseDaiYuanMatch(t: string): { sale: number; origin: number; phrase: string } | null {
  const m = t.match(DAI_YUAN_IN_TITLE)
  if (!m) return null
  if (m[1] != null && m[2] != null) {
    const sale = Number(m[1])
    const origin = Number(m[2])
    if (sale > 0 && origin > 0) {
      return { sale, origin, phrase: `${sale}元代${origin}元` }
    }
  }
  if (m[3] != null && m[4] != null) {
    const sale = Number(m[3])
    const origin = Number(m[4])
    if (sale > 0 && origin > 0) {
      return { sale, origin, phrase: `${sale}代${origin}` }
    }
  }
  if (m[5] != null && m[6] != null) {
    const sale = Number(m[5])
    const origin = Number(m[6])
    if (sale > 0 && origin > 0) {
      return { sale, origin, phrase: `满${sale}元抵${origin}元` }
    }
  }
  return null
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
  const parsed = parseDaiYuanMatch(t)
  if (parsed && /代金券|团购券|优惠券|券/.test(t)) {
    return `${parsed.sale}代${parsed.origin}代金券`
  }
  const daiVoucher = t.match(/(\d+)\s*元?\s*代\s*(\d+)\s*元?\s*代金券/)
  if (daiVoucher) return `${daiVoucher[1]}代${daiVoucher[2]}代金券`
  return null
}

/** 券面超大字（生图用） */
export function getVoucherFaceDisplayText(
  title: string,
  priceYuan?: string,
  originYuan?: string,
): string {
  const denom = extractVoucherDenomPhraseFromTitle(title)
  if (denom) {
    const m = denom.match(/(\d+)\s*元?\s*代\s*(\d+)/)
    if (m) return `${m[1]}代${m[2]}`
    if (/满\d+/.test(denom)) return denom
    return denom.replace(/代金券$/, '').trim() || denom
  }
  const sale = Number.parseFloat(String(priceYuan ?? '').trim())
  const origin = Number.parseFloat(String(originYuan ?? '').trim())
  if (Number.isFinite(sale) && sale > 0 && Number.isFinite(origin) && origin > 0) {
    return `${Math.round(sale)}代${Math.round(origin)}`
  }
  return ''
}

export function voucherImageNegativePrompt(): string {
  return [
    '自动售货机',
    '售货机',
    '货架',
    '超市',
    '便利店',
    '玩具',
    '模型店',
    '建筑模型',
    '3D渲染场景',
    '实物陈列',
    '餐饮菜品',
    '人物',
    '办公室',
    '展厅',
    '卖场内景',
    'vending machine',
    'product shelf',
    'retail store interior',
  ].join(', ')
}

/**
 * 商品向导生图用户句：仅「帮我生成一张」+ 商品名称框标题 + 主图/辅助图/环境图。
 * 不解析类目、商品类型、面额规则。
 */
export function buildProductImageUserLine(
  listingTitle: string,
  imageRole: 'head' | 'aux' | 'env' = 'head',
): string {
  const title = listingTitle.trim() || '团购商品'
  const suffix = imageRole === 'env' ? '环境图' : imageRole === 'aux' ? '辅助图' : '主图'
  return `帮我生成一张${title}${suffix}`
}

/** 代金券生图用短标题：只用面额字样，避免「日用百货/购物」把模型引向货架实景 */
export function voucherVisualTitleForImagePrompt(listingTitle: string): string {
  const denom = extractVoucherDenomPhraseFromTitle(listingTitle)
  if (denom) return denom
  const cat = extractMainProductFromListingTitle(listingTitle)
  if (/代金券|团购券|优惠券/.test(cat)) return cat
  return '代金券'
}

export type VoucherPriceHint = { sale?: number; origin?: number }

/** 合并标题解析与表单售价/划线价 */
export function resolveVoucherPriceHint(
  listingTitle: string,
  priceYuan?: string,
  originYuan?: string,
): VoucherPriceHint {
  const fromTitle = inferVoucherPricesFromTitle(listingTitle)
  const sale = Number.parseFloat(String(priceYuan ?? '').trim())
  const origin = Number.parseFloat(String(originYuan ?? '').trim())
  return {
    sale: Number.isFinite(sale) && sale > 0 ? sale : fromTitle.sale,
    origin: Number.isFinite(origin) && origin > 0 ? origin : fromTitle.origin,
  }
}

/** 代金券专用生图指令（平面券面，非实景） */
export function buildVoucherFaceImagePromptBlock(
  faceText: string,
  subtitle?: string,
  priceHint?: VoucherPriceHint,
): string {
  const face = faceText.trim() || '代金券'
  const sub = (subtitle ?? '团购代金券').trim().slice(0, 24)
  const sale = priceHint?.sale
  const origin = priceHint?.origin
  const priceSemantics =
    sale != null && origin != null && sale > 0 && origin > 0
      ? `【面额语义·必遵守】「${sale}代${origin}」= 顾客实付${sale}元、享${origin}元抵扣额度；券面主字写「${face}」或「${sale}代${origin}」。严禁写成「满${sale}元使用」、严禁只写「¥${origin}」而无「代」字。`
      : ''
  return `Flat 2D digital coupon voucher poster, local life Douyin group-buy voucher face only. NO photo, NO 3D diorama, NO vending machine, NO supermarket shelf, NO retail scene.
【画面类型·最高优先级】团购代金券平面主图（扁平插画/券面设计，禁止摄影实景与微缩模型场景）。
${priceSemantics}
【券面主文案·必须清晰可读】超大号中文：「${face}」${sub && sub !== face ? `，副标「${sub}」` : ''}。
【视觉】红橙金渐变券体、圆角、简洁背景；可有「到店核销」小字。
【严禁】自动售货机、货架、超市、日用百货陈列、玩具模型、建筑模型、餐饮、人物、办公室、展厅。`
}

/** 代金券生图尾部锁定：不含类目路径，避免「日用百货」诱发卖场实景 */
export function buildVoucherImageLockSuffix(anchor: string, typeLabel?: string): string {
  const typeBit = (typeLabel ?? '').trim() || '代金券'
  const a = anchor.trim() || '代金券'
  return `\n\n【商品类型·${typeBit}】券面主图锁定。主文案必须与标题面额一致：「${a}」。禁止满额门槛券式文案（如仅「满90元使用」）；禁止售货机、货架、超市、百货陈列、3D 模型店实景。`
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
    const retailNoise = /百货|超市|购物|便利|卖场|零售|售货|货架/.test(category)
    if (
      category &&
      !category.includes(denom) &&
      category.length <= 40 &&
      !retailNoise
    ) {
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
  const parsed = parseDaiYuanMatch(title.trim())
  if (parsed) return { sale: parsed.sale, origin: parsed.origin }
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

  const isVoucher = isVoucherGoodsProduct(productType, typeLabel, listing)
  const typeLine = isVoucher
    ? `【商品类型】代金券（须生成券面/核销示意，禁止无关实体货架或玩具模型）`
    : isGroupBuyGoodsProduct(productType, typeLabel)
      ? `【商品类型】团购套餐（突出套餐内容/就餐场景）`
      : typeLabel
        ? `【商品类型】${typeLabel}`
        : productType != null
          ? `【商品类型】product_type=${productType}`
          : ''

  const titleCore = `${typeLine ? `${typeLine}\n` : ''}【商品标题·主推】${isVoucher ? voucherVisualTitleForImagePrompt(listing) : listing}`
  const title_draft =
    !isVoucher && desc && listing && !desc.startsWith(listing)
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
    if (/\d+\s*元?\s*代\s*\d+|满\s*\d+.*抵\s*\d+/.test(a)) {
      return `主推为代金券；主图只能是平面券面，醒目展示面额字样，禁止售货机/货架/3D模型/实景商品。`
    }
    return '主推为代金券：仅允许平面券面设计；禁止货架、售货机、玩具模型、展厅空镜。'
  }
  if (opts?.isGroupBuy || /自助|套餐|放题/.test(a)) {
    return '主推为餐饮团购套餐：突出餐品或就餐场景，勿生成无关零售货架或代金券券面。'
  }
  if (/美容|美发|美甲|spa|护理/i.test(a)) {
    return '主推为到店服务：突出服务过程或效果氛围，勿生成无关商品陈列。'
  }
  return '主推须与商品类型及标题一致，禁止偷换为数码、无关餐饮或卖场空镜。'
}
