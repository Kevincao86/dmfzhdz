import {
  ChevronLeft,
  Loader2,
  Move,
  Search,
  Sparkles,
  Store,
  Upload,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  loadDraftDetailSnapshot,
  renameDraftDetailSnapshotKey,
  saveDraftDetailSnapshot,
} from '../../lib/productDraftSnapshot'
import { Link, useNavigate } from 'react-router-dom'
import { type DouyinCategoryNode, findNodeById } from '../../data/douyinCategoryMock'
import { cn } from '../../cn'
import AiVendorCatalogAvatar from '../../components/AiVendorCatalogAvatar'
import { readMerchantSession } from '../../lib/merchantSession'
import {
  loadDouyinGoodsCategoryTreeForPicker,
  pickerChildrenOf,
  pickerLeafSelectable,
  pickerPathIdsToLeaf,
} from '../../lib/douyinGoodsCategoryPicker'
import { replaceProductEditLibraryRowId, upsertProductEditLibraryDraft } from '../../lib/productEditLibrary'
import { getDouyinStores } from '../../services/douyinMerchantApi'
import {
  collectUploadableLeafCategoryIdsFromTree,
  fetchDouyinGoodsCategoryChildren,
  mergeDouyinCategoryChildrenIntoTree,
  type DouyinCategoryTreeNode,
  type DouyinProductDetailPayload,
  type ProductTypeOption,
  type TemplateAttr,
  type TemplateSelectOption,
  getDouyinGoodsTemplate,
  getDouyinGoodsProductGet,
  getDouyinProductTypesForCategory,
  postDouyinGoodsProductSave,
  uploadDouyinProductImage,
} from '../../services/douyinProductApi'
import {
  listAiUiModelOptions,
  type AiAssistRequest,
  type AiModelId,
  postDouyinGoodsAiAssist,
} from '../../services/douyinAiAssistApi'
import { MEOO_AI_VENDOR_CATALOG_EVENT } from '../../services/merchantAiVendorCatalogClient'
import {
  MERCHANT_AI_MODEL_STORAGE_KEY,
  MERCHANT_IMAGE_AI_MODEL_STORAGE_KEY,
  MEOO_IMAGE_AI_AUTO_EVENT,
  MEOO_IMAGE_AI_MANUAL_EVENT,
  MEOO_TEXT_AI_AUTO_EVENT,
  MEOO_TEXT_AI_MANUAL_EVENT,
  readImageAiAuto,
  readImageAiManualModel,
  readTextAiAuto,
  readTextAiManualModel,
  resolveImageAiModelForRequest,
  resolveModelForAssistAction,
  resolveTextAiModelForRequest,
  writeImageAiAuto,
  writeImageAiManualModel,
  writeTextAiAuto,
  writeTextAiManualModel,
} from '../../services/merchantAiModelStorage'
import { MEOO_REGISTRY_SYNC_EVENT } from '../../lib/opsRegistryConstants'

type ComboItemRow = {
  id: string
  name: string
  qty: string
  price: string
  /** 团购：开放平台 sku 模板「售价(分)/actual_amount」，与单品门店售价对应（分） */
  price_cents?: string
  /** 来客线上商品匹配（online.query） */
  product_id?: string
  sku_id?: string
}
type ComboGroupRow = { id: string; pickRule: string; items: ComboItemRow[] }

/** 按当前组内有效单品数生成「几选几」：1 个仅全部必选；2 个为二选一/二选二；n 个为 n 选 1…n 选 n（与来客常见规则一致） */
function pickRuleSelectOptionsForItemCount(itemCount: number): { value: string; label: string }[] {
  const o: { value: string; label: string }[] = [{ value: '', label: '请确认几选几' }]
  o.push({ value: '全部必选', label: '全部必选' })
  if (itemCount <= 1) return o
  for (let k = 1; k <= itemCount; k++) {
    o.push({ value: `${itemCount}选${k}`, label: `${itemCount}选${k}` })
  }
  return o
}

function normalizePickRuleForSave(pickRule: string, itemCount: number): string {
  const opts = pickRuleSelectOptionsForItemCount(itemCount)
  const allowed = new Set(opts.map((x) => x.value))
  const p = pickRule.trim()
  if (p && allowed.has(p)) return p
  return '全部必选'
}

function mergeComboItemDisplayName(d: {
  name: string
  spec: string
  brand: string
  barcode: string
}): string {
  const base = d.name.trim()
  const parts: string[] = [base]
  if (d.spec.trim()) parts.push(d.spec.trim())
  if (d.brand.trim()) parts.push(`品牌：${d.brand.trim()}`)
  if (d.barcode.trim()) parts.push(`条形码：${d.barcode.trim()}`)
  return parts.filter((p) => p.length > 0).join(' ').slice(0, 120) || '单品'
}

/** 来客侧「商品组」内 sku 模板展示名：售价(分)/actual_amount 在界面中称为「单名」（与运营口径对齐） */
function displaySkuAttrTitle(a: TemplateAttr): string {
  const key = (a.key ?? '').trim().toLowerCase()
  const nm = (a.name ?? '').trim()
  if (/^actual_amount$/i.test(key) || nm.includes('售价(分)')) return '单名'
  return nm || a.key
}

/** 团购下「单名」与单品售价绑定：actual_amount 或名称含「售价(分)」的 sku 模板项 */
function isSkuPriceCentsTemplateAttr(a: TemplateAttr): boolean {
  const key = (a.key ?? '').trim().toLowerCase()
  const nm = (a.name ?? '').trim()
  return /^actual_amount$/i.test(key) || nm.includes('售价(分)')
}

function resolveComboItemPriceCents(it: ComboItemRow): string {
  const c = it.price_cents?.trim()
  if (c) return c
  const py = Number.parseFloat(String(it.price).replace(/,/g, ''))
  if (Number.isFinite(py) && py >= 0) return String(Math.round(py * 100))
  return ''
}

function imageUrlCannotPublishToDouyin(u: string): boolean {
  const s = u.trim()
  if (!s) return false
  if (/^https?:\/\//i.test(s)) return false
  return /^data:image\//i.test(s) || /^blob:/i.test(s) || s.length > 2000
}

/** 提交前拦截：本机预览图或模板里粘贴的 data URL 会导致 goods/save 体积极大、超时 */
function collectUnpublishableImageProblems(detail: DouyinProductDetailPayload): string | null {
  const urls = [...detail.head_image_urls, ...detail.aux_image_urls, ...detail.env_image_urls]
  for (let i = 0; i < urls.length; i++) {
    if (imageUrlCannotPublishToDouyin(urls[i]!)) {
      return `第 ${i + 1} 张商品图仍为浏览器本机预览（data:/blob: 或非 http 地址），无法提交抖音。请先使用「图片上传」或素材接口得到以 https:// 开头的公网 URL 后再保存/提交。`
    }
  }
  const scan = (m: Record<string, string> | undefined, label: string) => {
    if (!m) return null as string | null
    for (const [k, v] of Object.entries(m)) {
      if (!v.trim()) continue
      if (/data:image\//i.test(v) || /^blob:/i.test(v)) {
        return `${label}（key: ${k}）含有本机预览图整段数据，请删除或改为 https 图片 JSON/URL，否则会触发保存超时。`
      }
    }
    return null
  }
  return (
    scan(detail.template_attr_overrides, '开放平台类目必填') ||
    scan(detail.template_sku_attr_overrides, '开放平台 SKU 模板')
  )
}

function looksComboTemplateAttr(a: TemplateAttr): boolean {
  const key = (a.key ?? '').trim().toLowerCase()
  const name = (a.name ?? '').toLowerCase()
  const vt = (a.value_type ?? '').toUpperCase()
  if (vt === 'COMMODITY') return true
  if (/^combo_rule$/i.test(key)) return true
  if (/^commodity$/i.test(key)) return true
  if (name.includes('combo_rule')) return true
  if (/套餐规则|搭配规则|组合规则|商品搭配|菜品搭配/.test(a.name)) return true
  if ((vt === 'STRUCT' || vt === 'OBJECT' || vt === 'JSON') && /套餐|搭配|组合/.test(a.name)) return true
  return false
}

function templateAttrWizardCovered(a: TemplateAttr): boolean {
  if (looksComboTemplateAttr(a)) return true
  const n = a.name
  const vt = (a.value_type ?? '').toUpperCase()
  if (vt.includes('IMAGE') || vt === 'PIC') return true
  if (/标题|商品名称/.test(n) && !/规范/.test(n)) return true
  if (/详情|图文|介绍|卖点|描述/.test(n)) return true
  if (/券|码类型|平台券|三方券/.test(n)) return true
  if (/购买须知|使用说明|温馨提示|使用规则|注意事项|其他说明/.test(n)) return true
  if (/有效|天数|天/.test(n) && /消费|券/.test(n)) return true
  if (/库存|数量/.test(n)) return true
  return false
}

type SkuAttrCoverCtx = {
  priceYuan: string
  originYuan: string
  stockQty: string
  stockLimited: boolean
  productName: string
}

/** 与网关 mergeGoodlifeSkuAttrMapFromTemplate 对齐：可自动从售价/名称/库存推断的 SKU 模板项 */
function templateSkuAttrWizardCovered(a: TemplateAttr, ctx: SkuAttrCoverCtx): boolean {
  const key = (a.key ?? '').trim().toLowerCase()
  const name = (a.name ?? '').toLowerCase()
  const vt = (a.value_type ?? '').toUpperCase()
  const price = Number.parseFloat(String(ctx.priceYuan).replace(/,/g, ''))
  const hasPrice = Number.isFinite(price) && price > 0
  const pn = ctx.productName.trim()
  const stockN = Number.parseInt(String(ctx.stockQty), 10)
  if (
    (vt === 'INT' || vt === 'LONG' || vt === 'NUMBER' || vt === 'INTEGER') &&
    (/^actual_amount$/i.test(key) || /售价|实付|现价|团购/.test(name))
  ) {
    return hasPrice
  }
  if ((vt === 'INT' || vt === 'LONG') && (/^origin_amount$/i.test(key) || /原价|划线/.test(name))) {
    return hasPrice
  }
  if ((vt === 'INT' || vt === 'LONG') && (/^stock_qty$/i.test(key) || /库存/.test(name))) {
    return ctx.stockLimited ? Number.isFinite(stockN) && stockN >= 0 : true
  }
  if ((vt === 'STRING' || vt === 'TEXT') && (/^sku_name$/i.test(key) || /名称|规格/.test(name))) {
    return pn.length > 0
  }
  return false
}

function templateAttrValueLooksNumeric(a: TemplateAttr): boolean {
  const vt = (a.value_type ?? '').toUpperCase()
  return (
    vt === 'INT' ||
    vt === 'LONG' ||
    vt === 'NUMBER' ||
    vt === 'INTEGER' ||
    vt === 'FLOAT' ||
    vt === 'DOUBLE'
  )
}

type Step = 'category' | 'productType' | 'detail'

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function readToken() {
  return readMerchantSession('meoo_douyin_merchant_token')
}

function readMerchantId() {
  return readMerchantSession('meoo_douyin_merchant_id')
}

function readAccountName() {
  return readMerchantSession('meoo_douyin_account_name')
}

export type DouyinProductWizardProps = {
  /** create：新建；edit：与创建页同一套表单，从网关/本地快照加载 */
  variant?: 'create' | 'edit'
  editProductId?: string
}

export default function DouyinProductCreateWizard({
  variant = 'create',
  editProductId,
}: DouyinProductWizardProps = {}) {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('category')
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [tree, setTree] = useState<DouyinCategoryTreeNode[]>([])
  const [uploadableLeaves, setUploadableLeaves] = useState<Set<string>>(new Set())
  const [industryName, setIndustryName] = useState('')

  const [cat1, setCat1] = useState('')
  const [cat2, setCat2] = useState('')
  const [cat3, setCat3] = useState('')

  const [productTypes, setProductTypes] = useState<ProductTypeOption[]>([])
  const [productType, setProductType] = useState<number | null>(null)
  const [typesLoading, setTypesLoading] = useState(false)
  const [typesLoadError, setTypesLoadError] = useState<string | null>(null)
  /** 第二步 → 第三步：拉模板失败时须在第二步展示（actionMsg 仅在第三步 DOM 内渲染，否则会「点了没反应」） */
  const [detailPrepLoading, setDetailPrepLoading] = useState(false)
  const [detailPrepError, setDetailPrepError] = useState<string | null>(null)

  const [storeModalOpen, setStoreModalOpen] = useState(false)
  const [modalKeyword, setModalKeyword] = useState('')
  const [modalSearchInput, setModalSearchInput] = useState('')
  const [modalPage, setModalPage] = useState(1)
  const [modalPageSize, setModalPageSize] = useState(10)
  const [modalStores, setModalStores] = useState<{ id: string; name: string }[]>([])
  const [modalTotal, setModalTotal] = useState(0)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalDraftIds, setModalDraftIds] = useState<string[]>([])

  const [merchantName] = useState(() => readAccountName() || '（请在系统设置绑定后显示商家名称）')

  const persistedProductIdRef = useRef<string | null>(null)
  const stableOutIdRef = useRef<string | null>(null)
  const editHydratedKeyRef = useRef<string>('')
  const [editLoadErr, setEditLoadErr] = useState<string | null>(null)
  const [editHydrating, setEditHydrating] = useState(
    () => variant === 'edit' && Boolean(editProductId?.trim()),
  )

  const [aiModelUiTick, setAiModelUiTick] = useState(0)
  const [aiOptionsReload, setAiOptionsReload] = useState(0)

  const aiModelPickOptions = useMemo(() => listAiUiModelOptions(), [aiOptionsReload])

  useEffect(() => {
    const bump = () => setAiOptionsReload((n) => n + 1)
    window.addEventListener(MEOO_AI_VENDOR_CATALOG_EVENT, bump)
    window.addEventListener(MEOO_REGISTRY_SYNC_EVENT, bump)
    return () => {
      window.removeEventListener(MEOO_AI_VENDOR_CATALOG_EVENT, bump)
      window.removeEventListener(MEOO_REGISTRY_SYNC_EVENT, bump)
    }
  }, [])

  const selectedTextAiLabel = useMemo(() => {
    void aiModelUiTick
    const id = resolveTextAiModelForRequest()
    return aiModelPickOptions.find((m) => m.id === id)?.label ?? id
  }, [aiModelUiTick, aiModelPickOptions])

  const selectedImageAiLabel = useMemo(() => {
    void aiModelUiTick
    const id = resolveImageAiModelForRequest()
    return aiModelPickOptions.find((m) => m.id === id)?.label ?? id
  }, [aiModelUiTick, aiModelPickOptions])

  const selectedImageAiOption = useMemo(() => {
    void aiModelUiTick
    const id = resolveImageAiModelForRequest()
    return aiModelPickOptions.find((m) => m.id === id) ?? aiModelPickOptions[0]
  }, [aiModelUiTick, aiModelPickOptions])

  /** 售价与图片区三颗「生图」按钮：开启自动时展示「自动」+ 当前解析厂商 */
  const imageAiHeadline = useMemo(() => {
    void aiModelUiTick
    const auto = readImageAiAuto()
    const id = resolveImageAiModelForRequest()
    const opt = aiModelPickOptions.find((m) => m.id === id)
    return { auto, id, opt }
  }, [aiModelUiTick, aiModelPickOptions])

  const renderImageGenTriggerContent = (isBusy: boolean) => {
    if (isBusy) return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
    if (imageAiHeadline.auto) {
      return (
        <>
          <span className="shrink-0 rounded bg-violet-700 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            自动
          </span>
          {imageAiHeadline.opt ? (
            <AiVendorCatalogAvatar
              id={imageAiHeadline.opt.id}
              label={imageAiHeadline.opt.label}
              logoUrl={imageAiHeadline.opt.logoUrl}
              size="xs"
            />
          ) : null}
          <span className="min-w-0 truncate text-xs">{imageAiHeadline.opt?.label ?? imageAiHeadline.id}</span>
        </>
      )
    }
    return (
      <>
        <AiVendorCatalogAvatar
          id={selectedImageAiOption?.id ?? 'qwen'}
          label={selectedImageAiOption?.label ?? selectedImageAiLabel}
          logoUrl={selectedImageAiOption?.logoUrl}
          size="xs"
        />
        <span className="min-w-0 truncate">{selectedImageAiOption?.label ?? selectedImageAiLabel}</span>
      </>
    )
  }

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== MERCHANT_AI_MODEL_STORAGE_KEY && e.key !== MERCHANT_IMAGE_AI_MODEL_STORAGE_KEY) return
      setAiModelUiTick((n) => n + 1)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    const bump = () => setAiModelUiTick((n) => n + 1)
    const evs = [
      MEOO_TEXT_AI_AUTO_EVENT,
      MEOO_IMAGE_AI_AUTO_EVENT,
      MEOO_TEXT_AI_MANUAL_EVENT,
      MEOO_IMAGE_AI_MANUAL_EVENT,
    ] as const
    for (const e of evs) window.addEventListener(e, bump)
    return () => {
      for (const e of evs) window.removeEventListener(e, bump)
    }
  }, [])

  const [paymentCollectMode, setPaymentCollectMode] = useState<
    'per_poi' | 'merchant_unified' | 'platform_agent'
  >('per_poi')
  type AiBusySlot = 'title' | 'desc' | 'img-head' | 'img-aux' | 'img-env'
  const [aiBusySlots, setAiBusySlots] = useState<Partial<Record<AiBusySlot, boolean>>>({})
  const beginAi = useCallback((k: AiBusySlot) => {
    setAiBusySlots((s) => ({ ...s, [k]: true }))
  }, [])
  const endAi = useCallback((k: AiBusySlot) => {
    setAiBusySlots((s) => {
      const n = { ...s }
      delete n[k]
      return n
    })
  }, [])
  const aiOn = useCallback((k: AiBusySlot) => !!aiBusySlots[k], [aiBusySlots])
  const [floatPreviewOpen, setFloatPreviewOpen] = useState(false)
  const [floatPos, setFloatPos] = useState({ x: 24, y: 96 })
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!imagePreviewUrl) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImagePreviewUrl(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [imagePreviewUrl])

  const [productName, setProductName] = useState('')
  const [productDesc, setProductDesc] = useState('')
  const [priceYuan, setPriceYuan] = useState('')
  const [originYuan, setOriginYuan] = useState('0')
  const [headUrl, setHeadUrl] = useState('')
  const [auxUrlsList, setAuxUrlsList] = useState<string[]>([])
  const [envUrlsList, setEnvUrlsList] = useState<string[]>([])
  const [selectedPoiIds, setSelectedPoiIds] = useState<string[]>([])
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null)
  const headFileRef = useRef<HTMLInputElement>(null)
  const auxFileRef = useRef<HTMLInputElement>(null)
  const envFileRef = useRef<HTMLInputElement>(null)

  const [salesChannel, setSalesChannel] = useState('unlimited')
  const [stockLimited, setStockLimited] = useState(true)
  const [stockQty, setStockQty] = useState('0')
  const [saleTimeLimited, setSaleTimeLimited] = useState(true)
  const [saleStart, setSaleStart] = useState('')
  const [saleEnd, setSaleEnd] = useState('')

  const [consumeValidDays, setConsumeValidDays] = useState('360')
  const [dailyAllDay, setDailyAllDay] = useState(true)
  const [voucherLimit, setVoucherLimit] = useState(true)
  const [voucherMax, setVoucherMax] = useState('1')
  const [peopleLimit, setPeopleLimit] = useState(true)
  const [peopleMax, setPeopleMax] = useState('2')
  const [couponType, setCouponType] = useState('douyin')
  const [externalGoodsId, setExternalGoodsId] = useState('')
  const [otherRules, setOtherRules] = useState('')

  /** 编辑已有商品时保留服务端 package_combo；新建团购由表单自动合成单品，不再展示「商品搭配」区块 */
  const [comboGroups, setComboGroups] = useState<ComboGroupRow[]>([])
  const [salesChannelOptions, setSalesChannelOptions] = useState<TemplateSelectOption[]>([])
  const [staffSalesOptions, setStaffSalesOptions] = useState<TemplateSelectOption[]>([])
  const [afterSalePolicyOptions, setAfterSalePolicyOptions] = useState<TemplateSelectOption[]>([])
  const [templateProductAttrs, setTemplateProductAttrs] = useState<TemplateAttr[]>([])
  const [templateSkuAttrs, setTemplateSkuAttrs] = useState<TemplateAttr[]>([])
  const [templateAttrOverrides, setTemplateAttrOverrides] = useState<Record<string, string>>({})
  const [templateSkuAttrOverrides, setTemplateSkuAttrOverrides] = useState<Record<string, string>>({})
  const [skuAttrExtraRows, setSkuAttrExtraRows] = useState<{ id: string; key: string; value: string }[]>([])
  const [comboItemModal, setComboItemModal] = useState<{
    groupId: string
    itemId: string | null
    draft: {
      name: string
      qty: string
      price: string
      spec: string
      brand: string
      barcode: string
      price_cents: string
    }
  } | null>(null)
  const [staffSales, setStaffSales] = useState('allow')
  const [consumeDateMode, setConsumeDateMode] = useState<'days' | 'calendar'>('days')
  const [nonConsumeDateMode, setNonConsumeDateMode] = useState<'all_dates' | 'partial_dates'>('all_dates')
  const [customerPurchaseLimitMode, setCustomerPurchaseLimitMode] = useState<'none' | 'limited'>('none')
  const [customerPurchaseLimitMax, setCustomerPurchaseLimitMax] = useState('6')
  const [afterSalePolicy, setAfterSalePolicy] = useState('refund_anytime')
  const [reserveMode, setReserveMode] = useState<'none' | 'required'>('none')
  const [reserveAdvance, setReserveAdvance] = useState('1')
  const [reserveUnit, setReserveUnit] = useState<'day' | 'hour'>('day')

  const [inStoreDiscount, setInStoreDiscount] = useState('exclusive')
  const [extraFee, setExtraFee] = useState(false)

  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [saving, setSaving] = useState(false)

  const l1Options = useMemo(() => pickerChildrenOf(tree, null), [tree])
  const l2Options = useMemo(() => (cat1 ? pickerChildrenOf(tree, cat1) : []), [tree, cat1])
  const l3Options = useMemo(() => (cat2 ? pickerChildrenOf(tree, cat2) : []), [tree, cat2])

  const leafSelectable = useCallback(
    (leafId: string, node: DouyinCategoryTreeNode) => pickerLeafSelectable(leafId, node, uploadableLeaves),
    [uploadableLeaves],
  )

  const lockedAiGoodsContext = useMemo(():
    | Pick<
        AiAssistRequest,
        | 'goods_category_id'
        | 'goods_product_type'
        | 'goods_category_path_zh'
        | 'goods_product_type_label'
      >
    | undefined => {
    if (!cat3.trim() || productType == null) return undefined
    const n1 = l1Options.find((x) => x.category_id === cat1)?.name
    const n2 = l2Options.find((x) => x.category_id === cat2)?.name
    const n3 = l3Options.find((x) => x.category_id === cat3)?.name
    const path = [n1, n2, n3].filter(Boolean).join(' › ')
    const typeLabel = productTypes.find((t) => t.product_type === productType)?.label
    return {
      goods_category_id: cat3.trim(),
      goods_product_type: productType,
      ...(path ? { goods_category_path_zh: path } : {}),
      ...(typeLabel ? { goods_product_type_label: typeLabel } : {}),
    }
  }, [cat1, cat2, cat3, productType, productTypes, l1Options, l2Options, l3Options])

  const postAssistWithKeys = useCallback(
    async (body: Omit<AiAssistRequest, 'model'>) => {
      const model = resolveModelForAssistAction(body.action) as AiModelId
      const lock = lockedAiGoodsContext
      const r = await postDouyinGoodsAiAssist({ ...body, model, ...(lock ?? {}) })
      if (r.ok || !r.needVendorKey) return r
      return {
        ok: false as const,
        message: `${r.message} 请在 Vercel / 部署环境配置 MERCHANT_AI_QWEN_KEY、MERCHANT_AI_DOUBAO_KEY、MERCHANT_AI_MINIMAX_KEY（或 DASHSCOPE_API_KEY / ARK_API_KEY / MINIMAX_API_KEY）。`,
      }
    },
    [lockedAiGoodsContext],
  )

  const previewComboLines = useMemo(() => {
    if (productType !== 1) return [] as { name: string; qty: string; price: string }[]
    const fromUi = comboGroups.flatMap((g) =>
      g.items
        .filter((it) => it.name.trim())
        .map((it) => ({
          name: it.name.trim(),
          qty: String(it.qty || '1'),
          price: String(it.price || ''),
        })),
    )
    if (fromUi.length > 0) return fromUi
    const n = productName.trim()
    if (!n) return []
    const py = Number.parseFloat(originYuan) || Number.parseFloat(priceYuan) || 0
    return [{ name: n, qty: '1', price: Number.isFinite(py) && py > 0 ? String(py) : '' }]
  }, [productType, comboGroups, productName, originYuan, priceYuan])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setLoadErr(null)
      const cat = await loadDouyinGoodsCategoryTreeForPicker()
      if (cancelled) return
      if (!cat.ok) {
        setLoadErr(cat.message)
        setLoading(false)
        return
      }
      setIndustryName('抖音来客（与 category/get 类目 enable 一致）')
      setUploadableLeaves(cat.uploadableLeafIds)
      setTree(cat.tree)
      setLoading(false)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  /** 选中一级/二级后按 category_id 再拉直系子类目，补全餐饮等一级下十余个二级的真实数据 */
  useEffect(() => {
    if (loading || !cat1) return
    let cancelled = false
    void (async () => {
      const kids = await fetchDouyinGoodsCategoryChildren(cat1)
      if (cancelled || kids.length === 0) return
      setTree((prev) => {
        const merged = mergeDouyinCategoryChildrenIntoTree(prev, cat1, kids)
        setUploadableLeaves(new Set(collectUploadableLeafCategoryIdsFromTree(merged)))
        return merged
      })
    })()
    return () => {
      cancelled = true
    }
  }, [cat1, loading])

  useEffect(() => {
    if (loading || !cat2) return
    let cancelled = false
    void (async () => {
      const kids = await fetchDouyinGoodsCategoryChildren(cat2)
      if (cancelled || kids.length === 0) return
      setTree((prev) => {
        const merged = mergeDouyinCategoryChildrenIntoTree(prev, cat2, kids)
        setUploadableLeaves(new Set(collectUploadableLeafCategoryIdsFromTree(merged)))
        return merged
      })
    })()
    return () => {
      cancelled = true
    }
  }, [cat2, loading])

  useEffect(() => {
    if (!storeModalOpen) return
    const tok = readToken()
    const mid = readMerchantId()
    if (!tok) return
    let cancelled = false
    const load = async () => {
      setModalLoading(true)
      const r = await getDouyinStores({
        accessToken: tok,
        page: modalPage,
        pageSize: modalPageSize,
        keyword: modalKeyword.trim() || undefined,
        merchantId: mid ?? undefined,
      })
      if (cancelled) return
      setModalLoading(false)
      if (r.ok) {
        setModalStores(r.items.map((x) => ({ id: x.id, name: x.name })))
        setModalTotal(r.total)
      } else {
        setModalStores([])
        setModalTotal(0)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [storeModalOpen, modalPage, modalPageSize, modalKeyword])

  useEffect(() => {
    if (!cat3) return
    let cancelled = false
    const run = async () => {
      setTypesLoading(true)
      setTypesLoadError(null)
      const r = await getDouyinProductTypesForCategory(cat3)
      if (cancelled) return
      setTypesLoading(false)
      if (r.ok) {
        setProductTypes(r.types)
        setProductType(null)
        setTypesLoadError(r.types.length === 0 ? '当前类目未返回可选商品类型，请换类目或检查绑定与网关。' : null)
      } else {
        setProductTypes([])
        setProductType(null)
        setTypesLoadError(r.message)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [cat3])

  useEffect(() => {
    setDetailPrepError(null)
  }, [cat3, productType])

  const canNextCategory =
    cat1 &&
    cat2 &&
    cat3 &&
    (() => {
      const n = findNodeById(tree as DouyinCategoryNode[], cat3)
      if (!n || !n.is_leaf) return false
      return leafSelectable(cat3, n as DouyinCategoryTreeNode)
    })()

  const canNextType =
    productType != null && productTypes.some((t) => t.product_type === productType && t.eligible)

  const displayPriceYuan = useMemo(() => {
    const n = Number.parseFloat(priceYuan)
    return Number.isFinite(n) && n > 0 ? n.toFixed(2) : '0.00'
  }, [priceYuan])

  const displayOriginYuan = useMemo(() => {
    const n = Number.parseFloat(originYuan)
    return Number.isFinite(n) && n > 0 ? n.toFixed(2) : ''
  }, [originYuan])

  const directBuyYuan = useMemo(() => {
    const p = Number.parseFloat(priceYuan)
    const bump = Number.isFinite(p) ? p + 4 : 0
    return bump > 0 ? bump.toFixed(2) : '0.00'
  }, [priceYuan])

  const requiredTemplateAttrs = useMemo(
    () => templateProductAttrs.filter((x) => x.is_required),
    [templateProductAttrs],
  )

  const sortedTemplateSkuAttrs = useMemo(
    () =>
      [...templateSkuAttrs].sort(
        (a, b) =>
          Number(!!b.is_required) - Number(!!a.is_required) ||
          (a.name || '').localeCompare(b.name || '', 'zh-Hans-CN'),
      ),
    [templateSkuAttrs],
  )

  const skuPriceCentsAttr = useMemo(
    () => templateSkuAttrs.find((a) => isSkuPriceCentsTemplateAttr(a)) ?? null,
    [templateSkuAttrs],
  )

  const productGroupSkuAttrsList = useMemo(() => {
    if (productType === 1 && skuPriceCentsAttr) {
      return sortedTemplateSkuAttrs.filter((a) => !isSkuPriceCentsTemplateAttr(a))
    }
    return sortedTemplateSkuAttrs
  }, [sortedTemplateSkuAttrs, productType, skuPriceCentsAttr])

  const goodsCategoryPathZh = useMemo(() => {
    const n1 = l1Options.find((x) => x.category_id === cat1)?.name
    const n2 = l2Options.find((x) => x.category_id === cat2)?.name
    const n3 = l3Options.find((x) => x.category_id === cat3)?.name
    return [n1, n2, n3].filter(Boolean).join(' › ')
  }, [cat1, cat2, cat3, l1Options, l2Options, l3Options])

  const comboModalFieldFlags = useMemo(() => {
    const p = goodsCategoryPathZh
    const blob = templateProductAttrs.map((a) => `${a.name} ${a.key}`).join(' ')
    return {
      brand: /餐|饮|食|锅|烤|甜|茶|酒|咖啡|超|美|容|发|甲|丽人|美妆/.test(p) || /品牌/.test(blob),
      barcode: /餐|饮|食|甜|茶|酒|咖啡|超|零/.test(p) || /条码|条形码/.test(blob),
    }
  }, [goodsCategoryPathZh, templateProductAttrs])

  const comboListedItemCount = useMemo(
    () => comboGroups.reduce((s, g) => s + g.items.filter((it) => it.name.trim()).length, 0),
    [comboGroups],
  )

  const comboPickSanitizeSig = useMemo(
    () =>
      productType === 1
        ? comboGroups
            .map(
              (g) =>
                `${g.id}:${g.items.filter((it) => it.name.trim()).length}:${g.pickRule.trim()}`,
            )
            .join('|')
        : '',
    [productType, comboGroups],
  )

  useEffect(() => {
    if (productType !== 1) return
    setComboGroups((prev) => {
      let changed = false
      const next = prev.map((g) => {
        const n = g.items.filter((it) => it.name.trim()).length
        const allowed = new Set(pickRuleSelectOptionsForItemCount(n).map((o) => o.value))
        const pr = g.pickRule.trim()
        if (!pr || allowed.has(pr)) return g
        changed = true
        return { ...g, pickRule: n <= 1 ? '全部必选' : '' }
      })
      return changed ? next : prev
    })
  }, [productType, comboPickSanitizeSig])

  const skuTemplateCoverCtx = useMemo(
    () => ({
      priceYuan,
      originYuan,
      stockQty,
      stockLimited,
      productName,
    }),
    [priceYuan, originYuan, stockQty, stockLimited, productName],
  )

  const textAiAutoOn = useMemo(() => {
    void aiModelUiTick
    return readTextAiAuto()
  }, [aiModelUiTick])

  const imageAiAutoOn = useMemo(() => {
    void aiModelUiTick
    return readImageAiAuto()
  }, [aiModelUiTick])

  const manualTextAiId = useMemo(() => {
    void aiModelUiTick
    return readTextAiManualModel()
  }, [aiModelUiTick])

  const manualImageAiId = useMemo(() => {
    void aiModelUiTick
    return readImageAiManualModel()
  }, [aiModelUiTick])

  const openStoreModal = () => {
    setModalDraftIds([...selectedPoiIds])
    setModalPage(1)
    setModalKeyword('')
    setModalSearchInput('')
    setStoreModalOpen(true)
  }

  const confirmStoreModal = () => {
    setSelectedPoiIds([...modalDraftIds])
    setStoreModalOpen(false)
  }

  const toggleModalPoi = (id: string) => {
    setModalDraftIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const runImageUpload = async (file: File, slot: string) => {
    setUploadingSlot(slot)
    const r = await uploadDouyinProductImage(file)
    setUploadingSlot(null)
    if (!r.ok) {
      window.alert(r.message)
      return
    }
    const u = (r.url ?? '').trim()
    /** 服务端内联 data URL 与上传一致；其它外链（如 picsum 占位）一律用本机 blob 预览真实所选图 */
    if (u.startsWith('data:image/')) return u
    try {
      return URL.createObjectURL(file)
    } catch {
      return u
    }
  }

  const addComboGroupRow = () => {
    setComboGroups((prev) => [...prev, { id: newId('cg'), pickRule: '', items: [] }])
  }

  const removeComboGroupRow = (gid: string) => {
    setComboGroups((prev) => {
      const next = prev.filter((g) => g.id !== gid)
      if (productType === 1 && next.length === 0)
        return [{ id: newId('cg'), pickRule: '', items: [] }]
      return next
    })
  }

  const moveComboGroupRow = (idx: number, dir: -1 | 1) => {
    setComboGroups((prev) => {
      const j = idx + dir
      if (j < 0 || j >= prev.length) return prev
      const cp = [...prev]
      const a = cp[idx]!
      cp[idx] = cp[j]!
      cp[j] = a
      return cp
    })
  }

  const removeComboItem = (gid: string, iid: string) => {
    setComboGroups((prev) =>
      prev.map((g) => (g.id === gid ? { ...g, items: g.items.filter((it) => it.id !== iid) } : g)),
    )
  }

  const openComboItemModal = (groupId: string, itemId: string | null) => {
    const g = comboGroups.find((x) => x.id === groupId)
    if (!g) return
    if (itemId) {
      const it = g.items.find((i) => i.id === itemId)
      if (!it) return
      setComboItemModal({
        groupId,
        itemId,
        draft: {
          name: it.name,
          qty: it.qty,
          price: it.price,
          spec: '',
          brand: '',
          barcode: '',
          price_cents: skuPriceCentsAttr ? resolveComboItemPriceCents(it) : '',
        },
      })
      return
    }
    setComboItemModal({
      groupId,
      itemId: null,
      draft: {
        name: '',
        qty: '1',
        price: '',
        spec: '',
        brand: '',
        barcode: '',
        price_cents:
          skuPriceCentsAttr &&
          Number.isFinite(Number.parseFloat(priceYuan)) &&
          Number.parseFloat(priceYuan) > 0
            ? String(Math.round(Number.parseFloat(priceYuan) * 100))
            : '',
      },
    })
  }

  const confirmComboItemModal = () => {
    const m = comboItemModal
    if (!m) return
    const { draft, groupId, itemId } = m
    if (!draft.name.trim()) {
      window.alert('请填写单品名称')
      return
    }
    const py = Number.parseFloat(draft.price)
    if (!Number.isFinite(py) || py < 0) {
      window.alert('请填写门店售价（元），可为 0')
      return
    }
    const merged = mergeComboItemDisplayName(draft).trim() || '单品'
    const qty = String(Math.max(1, Number.parseInt(draft.qty, 10) || 1))
    const price = String(py)
    const centsFromDraft = draft.price_cents.trim()
    const centsFromYuan = Number.isFinite(py) ? String(Math.round(py * 100)) : ''
    const price_cents =
      skuPriceCentsAttr && (centsFromDraft || centsFromYuan) ? centsFromDraft || centsFromYuan : undefined
    setComboGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g
        if (itemId) {
          const prevIt = g.items.find((x) => x.id === itemId)
          return {
            ...g,
            items: g.items.map((it) => {
              if (it.id !== itemId) return it
              const { price_cents: _oldCents, ...rest } = it
              return {
                ...rest,
                name: merged,
                qty,
                price,
                ...(skuPriceCentsAttr && price_cents ? { price_cents } : {}),
                product_id: prevIt?.product_id,
                sku_id: prevIt?.sku_id,
              }
            }),
          }
        }
        return {
          ...g,
          items: [
            ...g.items,
            {
              id: newId('ci'),
              name: merged,
              qty,
              price,
              ...(skuPriceCentsAttr && price_cents ? { price_cents } : {}),
            },
          ],
        }
      }),
    )
    setComboItemModal(null)
  }

  const goDetail = async () => {
    if (!cat3 || productType == null) return
    setDetailPrepLoading(true)
    setDetailPrepError(null)
    try {
      const tpl = await getDouyinGoodsTemplate({ category_id: cat3, product_type: productType })
      if (!tpl.ok) {
        setDetailPrepError(tpl.message)
        return
      }
      setSalesChannelOptions(tpl.sales_channels)
      setStaffSalesOptions(tpl.staff_sales_options)
      setAfterSalePolicyOptions(tpl.after_sale_policies)
      setTemplateProductAttrs(tpl.product_attrs)
      setTemplateSkuAttrs(tpl.sku_attrs)
      setTemplateAttrOverrides({})
      setTemplateSkuAttrOverrides({})
      setSkuAttrExtraRows([])
      setSalesChannel((prev) =>
        tpl.sales_channels.some((x) => x.value === prev)
          ? prev
          : (tpl.sales_channels[0]?.value ?? 'unlimited'),
      )
      setStaffSales((prev) =>
        tpl.staff_sales_options.some((x) => x.value === prev)
          ? prev
          : (tpl.staff_sales_options[0]?.value ?? 'allow'),
      )
      const d = tpl.trade_rule_defaults
      setConsumeDateMode(d.consume_date_mode)
      setConsumeValidDays(String(d.consume_valid_days))
      setNonConsumeDateMode(d.non_consume_date_mode)
      setDailyAllDay(d.daily_consume_mode === 'all_day')
      setCustomerPurchaseLimitMode(d.purchase_limit_mode)
      setCustomerPurchaseLimitMax(String(d.purchase_limit_max))
      setAfterSalePolicy(d.after_sale_policy)
      setReserveMode(d.reserve_mode)
      setReserveAdvance(String(d.reserve_advance_value))
      setReserveUnit(d.reserve_advance_unit)
      setComboGroups(
        productType === 1 ? [{ id: newId('cg'), pickRule: '', items: [] }] : [],
      )
      setComboItemModal(null)
      setStep('detail')
      setActionMsg(null)
    } catch (e) {
      setDetailPrepError(e instanceof Error ? e.message : String(e))
    } finally {
      setDetailPrepLoading(false)
    }
  }

  useEffect(() => {
    if (variant !== 'edit') {
      editHydratedKeyRef.current = ''
      stableOutIdRef.current = null
      persistedProductIdRef.current = null
      setEditLoadErr(null)
      setEditHydrating(false)
    }
  }, [variant])

  useEffect(() => {
    editHydratedKeyRef.current = ''
  }, [editProductId])

  useEffect(() => {
    if (variant !== 'edit' || !editProductId?.trim() || tree.length === 0) return
    const key = editProductId.trim()
    if (editHydratedKeyRef.current === key) return
    let cancelled = false
    const run = async () => {
      setEditHydrating(true)
      setEditLoadErr(null)
      try {
        let detail = loadDraftDetailSnapshot(key)
        if (!detail) {
          const r = await getDouyinGoodsProductGet(key)
          if (r.ok) detail = r.detail
        }
        if (cancelled) return
        if (!detail) {
          setEditLoadErr('无法加载该商品。请确认已在抖音来客存在此商品，或在本页曾保存过草稿；也可核对商品编号是否正确。')
          return
        }
        stableOutIdRef.current = String(detail.out_id ?? '').trim() || `erp-${key}`
        persistedProductIdRef.current =
          (typeof detail.product_id === 'string' && detail.product_id.trim()) || key

        const path = pickerPathIdsToLeaf(tree, detail.category_id)
        if (path.length >= 3) {
          setCat1(path[path.length - 3]!)
          setCat2(path[path.length - 2]!)
          setCat3(path[path.length - 1]!)
        } else if (path.length === 1) {
          setCat1(path[0]!)
          setCat2('')
          setCat3('')
        } else {
          setCat1('')
          setCat2('')
          setCat3(detail.category_id)
        }

        setProductType(detail.product_type ?? 1)
        setProductName(detail.product_name ?? '')
        setProductDesc(typeof detail.product_desc === 'string' ? detail.product_desc : '')
        setPriceYuan(String(detail.price_yuan ?? ''))
        setOriginYuan(String(detail.origin_price_yuan ?? '0'))
        if (detail.payment_collect_mode) setPaymentCollectMode(detail.payment_collect_mode)

        setHeadUrl(
          Array.isArray(detail.head_image_urls) && detail.head_image_urls[0]
            ? String(detail.head_image_urls[0])
            : '',
        )
        setAuxUrlsList(
          Array.isArray(detail.aux_image_urls)
            ? detail.aux_image_urls.map((u) => String(u)).filter(Boolean)
            : [],
        )
        setEnvUrlsList(
          Array.isArray(detail.env_image_urls)
            ? detail.env_image_urls.map((u) => String(u)).filter(Boolean)
            : [],
        )
        setSelectedPoiIds(Array.isArray(detail.poi_ids) ? detail.poi_ids.map(String) : [])

        const pc = detail.package_combo as { groups?: unknown[] } | undefined
        if (pc && Array.isArray(pc.groups) && pc.groups.length > 0) {
          setComboGroups(
            pc.groups.map((g) => {
              const gr = g as Record<string, unknown>
              const itemsRaw = Array.isArray(gr.items)
                ? gr.items
                : Array.isArray(gr.item_list)
                  ? gr.item_list
                  : []
              const n = itemsRaw.length
              const pickRule = (() => {
                const pr = String(gr.pick_rule ?? '').trim()
                if (pr) return pr
                const tc = Math.floor(Number(gr.total_count))
                const oc = Math.floor(Number(gr.option_count))
                if (Number.isFinite(tc) && Number.isFinite(oc) && n > 0 && tc === n && oc === n) return '全部必选'
                if (Number.isFinite(tc) && Number.isFinite(oc) && tc === n && oc === 1 && n > 1) return `${tc}选1`
                if (Number.isFinite(tc) && Number.isFinite(oc) && tc === n && oc >= 1 && oc <= tc)
                  return `${tc}选${oc}`
                return '全部必选'
              })()
              return {
                id: newId('g'),
                pickRule,
                items: itemsRaw.map((it) => {
                  const row = it as Record<string, unknown>
                  const qty = Math.max(1, Math.floor(Number(row.quantity ?? row.count ?? 1) || 1))
                  let priceStr = ''
                  if (row.origin_price_yuan != null && Number.isFinite(Number(row.origin_price_yuan))) {
                    priceStr = String(row.origin_price_yuan)
                  } else if (row.price != null && Number.isFinite(Number(row.price))) {
                    priceStr = String(Number(row.price) / 100)
                  }
                  return {
                    id: newId('i'),
                    name: String(row.name ?? ''),
                    qty: String(qty),
                    price: priceStr,
                    product_id: typeof row.product_id === 'string' ? row.product_id : undefined,
                    sku_id: typeof row.sku_id === 'string' ? row.sku_id : undefined,
                  }
                }),
              }
            }),
          )
        }

        const tpl = await getDouyinGoodsTemplate({
          category_id: detail.category_id,
          product_type: detail.product_type ?? 1,
        })
        if (cancelled) return
        if (!tpl.ok) {
          setEditLoadErr(tpl.message)
          return
        }
        const si = detail.sales_info as Record<string, unknown> | undefined
        setSalesChannelOptions(tpl.sales_channels)
        setStaffSalesOptions(tpl.staff_sales_options)
        setAfterSalePolicyOptions(tpl.after_sale_policies)
        setTemplateProductAttrs(tpl.product_attrs)
        setTemplateSkuAttrs(tpl.sku_attrs)
        setTemplateAttrOverrides({})
        setTemplateSkuAttrOverrides({})
        setSkuAttrExtraRows([])
        const ch = si && typeof si.channel === 'string' ? si.channel : null
        setSalesChannel(
          ch && tpl.sales_channels.some((x) => x.value === ch)
            ? ch
            : (tpl.sales_channels[0]?.value ?? 'unlimited'),
        )
        const stf = si && typeof si.staff_sales === 'string' ? si.staff_sales : null
        setStaffSales(
          stf && tpl.staff_sales_options.some((x) => x.value === stf)
            ? stf
            : (tpl.staff_sales_options[0]?.value ?? 'allow'),
        )
        const d = tpl.trade_rule_defaults
        setConsumeDateMode(d.consume_date_mode)
        setConsumeValidDays(String(d.consume_valid_days))
        setNonConsumeDateMode(d.non_consume_date_mode)
        setDailyAllDay(d.daily_consume_mode === 'all_day')
        setCustomerPurchaseLimitMode(d.purchase_limit_mode)
        setCustomerPurchaseLimitMax(String(d.purchase_limit_max))
        setAfterSalePolicy(d.after_sale_policy)
        setReserveMode(d.reserve_mode)
        setReserveAdvance(String(d.reserve_advance_value))
        setReserveUnit(d.reserve_advance_unit)
        if (si && typeof si.stock_limited === 'boolean') setStockLimited(si.stock_limited)
        if (si && typeof si.stock_qty === 'number') setStockQty(String(si.stock_qty))
        if (si && typeof si.sale_time_limited === 'boolean') setSaleTimeLimited(si.sale_time_limited)
        if (si && typeof si.sale_start === 'string') setSaleStart(si.sale_start)
        if (si && typeof si.sale_end === 'string') setSaleEnd(si.sale_end)

        setStep('detail')
        editHydratedKeyRef.current = key
      } catch (e) {
        if (!cancelled) setEditLoadErr(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setEditHydrating(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [variant, editProductId, tree])

  /** 生图/修图：把商品说明片段并入 title_draft，便于网关 prompt 与标题、卖点一致 */
  const imageAssistTitleDraft = useMemo(() => {
    const name = productName.trim()
    if (!name) return ''
    const desc = productDesc.trim().slice(0, 400)
    return desc ? `${name}。${desc}` : name
  }, [productName, productDesc])

  /** 生图/修图：始终传 title_draft（名称+说明），网关与上游仅认此锚，避免缺字段时只靠短名称 */
  const imageAssistGoodsText = useMemo(() => {
    const product_name = productName.trim() || '商品'
    return {
      product_name,
      title_draft: imageAssistTitleDraft.trim() || product_name,
    }
  }, [productName, imageAssistTitleDraft])

  const optimizeProductTitle = useCallback(async () => {
    const draft = productName.trim()
    if (!draft) {
      window.alert('请先在商品名称框内输入标题，再点击「AI 智能优化」')
      return
    }
    beginAi('title')
    beginAi('desc')
    try {
      const [r, d] = await Promise.all([
        postAssistWithKeys({
          action: 'optimize_title',
          product_name: draft,
          title_draft: draft,
        }),
        postAssistWithKeys({
          action: 'generate_desc',
          product_name: draft,
          title_draft: draft,
        }),
      ])
      if (!r.ok) window.alert(r.message)
      else if (r.title) setProductName(r.title.slice(0, 40))
      if (!d.ok) {
        if (r.ok) window.alert(d.message)
      } else if (d.description) setProductDesc(d.description)
    } finally {
      endAi('title')
      endAi('desc')
    }
  }, [postAssistWithKeys, productName, beginAi, endAi])

  const generateDescOnly = useCallback(async () => {
    const name = productName.trim()
    if (!name) {
      window.alert('请先填写商品名称')
      return
    }
    beginAi('desc')
    try {
      const d = await postAssistWithKeys({ action: 'generate_desc', product_name: name })
      if (!d.ok) {
        window.alert(d.message)
        return
      }
      if (d.description) setProductDesc(d.description)
    } finally {
      endAi('desc')
    }
  }, [postAssistWithKeys, productName, beginAi, endAi])

  const aiGenerateHeadImage = useCallback(async () => {
    if (headUrl.trim()) return
    const n = productName.trim()
    if (!n) {
      window.alert('请先填写商品名称，以便 AI 生成头图')
      return
    }
    beginAi('img-head')
    try {
      const r = await postAssistWithKeys({
        action: 'image_generate',
        ...imageAssistGoodsText,
        image_role: 'head',
      })
      if (!r.ok) window.alert(r.message)
      else if (r.image_urls?.[0]) setHeadUrl(r.image_urls[0])
    } finally {
      endAi('img-head')
    }
  }, [postAssistWithKeys, headUrl, imageAssistGoodsText, beginAi, endAi])

  const aiEnhanceHeadImage = useCallback(async () => {
    const h = headUrl.trim()
    if (!h) {
      window.alert('请先上传头图后再优化')
      return
    }
    beginAi('img-head')
    try {
      const r = await postAssistWithKeys({
        action: 'image_enhance',
        ...imageAssistGoodsText,
        image_urls: [h],
        image_role: 'head',
      })
      if (!r.ok) window.alert(r.message)
      else if (r.image_urls?.[0]) setHeadUrl(r.image_urls[0])
    } finally {
      endAi('img-head')
    }
  }, [postAssistWithKeys, headUrl, imageAssistGoodsText, beginAi, endAi])

  const aiGenerateOneAuxImage = useCallback(async () => {
    if (auxUrlsList.length >= 4) return
    const n = productName.trim()
    if (!n) {
      window.alert('请先填写商品名称')
      return
    }
    beginAi('img-aux')
    try {
      const r = await postAssistWithKeys({
        action: 'image_generate',
        ...imageAssistGoodsText,
        image_role: 'aux',
      })
      if (!r.ok) window.alert(r.message)
      else if (r.image_urls?.[0])
        setAuxUrlsList((prev) => [...prev, r.image_urls![0]].slice(0, 4))
    } finally {
      endAi('img-aux')
    }
  }, [postAssistWithKeys, auxUrlsList.length, imageAssistGoodsText, beginAi, endAi])

  const aiEnhanceAuxOne = useCallback(
    async (index: number) => {
      const u = auxUrlsList[index]?.trim()
      if (!u) return
      beginAi('img-aux')
      try {
        const r = await postAssistWithKeys({
          action: 'image_enhance',
          ...imageAssistGoodsText,
          image_urls: [u],
          image_role: 'aux',
        })
        if (!r.ok) window.alert(r.message)
        else if (r.image_urls?.[0])
          setAuxUrlsList((prev) => prev.map((x, j) => (j === index ? r.image_urls![0]! : x)))
      } finally {
        endAi('img-aux')
      }
    },
    [postAssistWithKeys, auxUrlsList, imageAssistGoodsText, beginAi, endAi],
  )

  const aiEnhanceAllAux = useCallback(async () => {
    if (auxUrlsList.length === 0) return
    beginAi('img-aux')
    try {
      const r = await postAssistWithKeys({
        action: 'image_enhance',
        ...imageAssistGoodsText,
        image_urls: [...auxUrlsList],
        image_role: 'aux',
      })
      if (!r.ok) window.alert(r.message)
      else if (r.image_urls?.length) setAuxUrlsList(r.image_urls.slice(0, 4))
    } finally {
      endAi('img-aux')
    }
  }, [postAssistWithKeys, auxUrlsList, imageAssistGoodsText, beginAi, endAi])

  const aiGenerateOneEnvImage = useCallback(async () => {
    if (envUrlsList.length >= 10) return
    const n = productName.trim()
    if (!n) {
      window.alert('请先填写商品名称')
      return
    }
    beginAi('img-env')
    try {
      const r = await postAssistWithKeys({
        action: 'image_generate',
        ...imageAssistGoodsText,
        image_role: 'env',
      })
      if (!r.ok) window.alert(r.message)
      else if (r.image_urls?.[0])
        setEnvUrlsList((prev) => [...prev, r.image_urls![0]].slice(0, 10))
    } finally {
      endAi('img-env')
    }
  }, [postAssistWithKeys, envUrlsList.length, imageAssistGoodsText, beginAi, endAi])

  const aiEnhanceEnvOne = useCallback(
    async (index: number) => {
      const u = envUrlsList[index]?.trim()
      if (!u) return
      beginAi('img-env')
      try {
        const r = await postAssistWithKeys({
          action: 'image_enhance',
          ...imageAssistGoodsText,
          image_urls: [u],
          image_role: 'env',
        })
        if (!r.ok) window.alert(r.message)
        else if (r.image_urls?.[0])
          setEnvUrlsList((prev) => prev.map((x, j) => (j === index ? r.image_urls![0]! : x)))
      } finally {
        endAi('img-env')
      }
    },
    [postAssistWithKeys, envUrlsList, imageAssistGoodsText, beginAi, endAi],
  )

  const aiEnhanceAllEnv = useCallback(async () => {
    if (envUrlsList.length === 0) return
    beginAi('img-env')
    try {
      const r = await postAssistWithKeys({
        action: 'image_enhance',
        ...imageAssistGoodsText,
        image_urls: [...envUrlsList],
        image_role: 'env',
      })
      if (!r.ok) window.alert(r.message)
      else if (r.image_urls?.length) setEnvUrlsList(r.image_urls.slice(0, 10))
    } finally {
      endAi('img-env')
    }
  }, [postAssistWithKeys, envUrlsList, imageAssistGoodsText, beginAi, endAi])

  const buildDetailPayload = (): DouyinProductDetailPayload | null => {
    const price = Number.parseFloat(priceYuan)
    if (!productName.trim() || !Number.isFinite(price) || price <= 0) return null
    const head = headUrl.trim() ? [headUrl.trim()] : []
    const aux = auxUrlsList.filter(Boolean).slice(0, 4)
    const env = envUrlsList.filter(Boolean).slice(0, 10)
    const originNum = Number.parseFloat(originYuan) || 0
    /** 仅团购 product_type=1 传 package_combo；代金券等由 template/get 必填项与 attr 组装，勿传 combo_rule */
    const package_combo =
      productType == null
        ? undefined
        : productType === 1
          ? (() => {
              const groupsFromUi = comboGroups
                .map((g) => {
                  const items = g.items.filter((it) => it.name.trim())
                  return {
                    pick_rule: normalizePickRuleForSave(g.pickRule, items.length),
                    items: items.map((it) => ({
                      name: it.name.trim(),
                      quantity: Math.max(1, Number.parseInt(it.qty, 10) || 1),
                      origin_price_yuan: Math.max(0, Number.parseFloat(it.price) || 0),
                      ...(it.product_id ? { product_id: it.product_id } : {}),
                      ...(it.sku_id ? { sku_id: it.sku_id } : {}),
                    })),
                  }
                })
                .filter((g) => g.items.length > 0)
              if (groupsFromUi.length > 0) return { groups: groupsFromUi }
              const nm = productName.trim().slice(0, 120) || '团购套餐'
              return {
                groups: [
                  {
                    pick_rule: '全部必选',
                    items: [
                      {
                        name: nm,
                        quantity: 1,
                        origin_price_yuan: Math.max(0, originNum || price),
                      },
                    ],
                  },
                ],
              }
            })()
          : undefined
    const extOut = externalGoodsId.trim()
    let stable = (stableOutIdRef.current ?? '').trim()
    if (!stable && !extOut) {
      stableOutIdRef.current = `erp-${Date.now()}`
      stable = stableOutIdRef.current.trim()
    }
    const out_id = extOut || stable
    if (extOut) stableOutIdRef.current = extOut

    const sessionAccountName = readAccountName()?.trim()
    return {
      ...(persistedProductIdRef.current ? { product_id: persistedProductIdRef.current } : {}),
      out_id,
      category_id: cat3,
      product_type: productType!,
      ...(sessionAccountName ? { account_name: sessionAccountName } : {}),
      merchant_display_name: merchantName,
      payment_collect_mode: paymentCollectMode,
      product_name: productName.trim(),
      product_desc: productDesc.trim() || undefined,
      price_yuan: price,
      origin_price_yuan: Number.parseFloat(originYuan) || 0,
      head_image_urls: head,
      aux_image_urls: aux,
      env_image_urls: env,
      poi_ids: selectedPoiIds,
      package_combo,
      sales_info: {
        channel: salesChannel,
        staff_sales: staffSales,
        stock_limited: stockLimited,
        stock_qty: Number.parseInt(stockQty, 10) || 0,
        sale_time_limited: saleTimeLimited,
        sale_start: saleStart || undefined,
        sale_end: saleEnd || undefined,
      },
      trade_rules: {
        consume_date_mode: consumeDateMode,
        consume_valid_days: Number.parseInt(consumeValidDays, 10) || 0,
        non_consume_date_mode: nonConsumeDateMode,
        daily_consume_mode: dailyAllDay ? 'all_day' : 'time_slots',
        customer_purchase_limit_mode: customerPurchaseLimitMode,
        customer_purchase_limit_max:
          customerPurchaseLimitMode === 'limited'
            ? Number.parseInt(customerPurchaseLimitMax, 10) || 0
            : undefined,
        after_sale_policy: afterSalePolicy,
        reserve_mode: reserveMode,
        reserve_advance_value:
          reserveMode === 'required' ? Number.parseInt(reserveAdvance, 10) || 0 : undefined,
        reserve_advance_unit: reserveUnit,
        reserve_channel: 'phone',
        daily_all_day: dailyAllDay,
        coupon_type: couponType,
        external_goods_id: externalGoodsId.trim() || undefined,
      },
      consume_rules: {
        in_store_discount: inStoreDiscount,
        extra_fee: extraFee,
        voucher_limit: voucherLimit,
        voucher_max: voucherLimit ? Number.parseInt(voucherMax, 10) || 0 : undefined,
        people_limit: peopleLimit,
        people_max: peopleLimit ? Number.parseInt(peopleMax, 10) || 0 : undefined,
        other: otherRules.trim() || undefined,
      },
    }
  }

  const handleSave = async (mode: 'draft' | 'submit') => {
    const detail = buildDetailPayload()
    if (!detail) {
      setActionMsg({ text: '请完善必填：商品名称、售价、商品头图（上传）', ok: false })
      return
    }
    if (detail.poi_ids.length === 0) {
      setActionMsg({ text: '请至少选择一个适用门店', ok: false })
      return
    }
    for (const a of templateProductAttrs) {
      if (!a.is_required) continue
      if (templateAttrWizardCovered(a)) continue
      const v = templateAttrOverrides[a.key]?.trim()
      if (!v) {
        setActionMsg({
          text: `开放平台模板必填项「${a.name}」（key: ${a.key}）尚未填写，请在本页下方「开放平台类目必填」中补充`,
          ok: false,
        })
        return
      }
    }

    const skuCoverCtx: SkuAttrCoverCtx = {
      priceYuan,
      originYuan,
      stockQty,
      stockLimited,
      productName,
    }
    for (const a of templateSkuAttrs) {
      if (!a.is_required) continue
      if (productType === 1 && isSkuPriceCentsTemplateAttr(a)) {
        const listed = comboGroups.flatMap((gr) => gr.items).filter((it) => it.name.trim())
        const cents = listed.length > 0 ? resolveComboItemPriceCents(listed[0]!) : ''
        const fromGlobal =
          Number.isFinite(Number.parseFloat(priceYuan)) && Number.parseFloat(priceYuan) > 0
            ? String(Math.round(Number.parseFloat(priceYuan) * 100))
            : ''
        const fromOverride = templateSkuAttrOverrides[a.key]?.trim() ?? ''
        if (!cents && !fromGlobal && !fromOverride) {
          setActionMsg({
            text: `开放平台 SKU 必填「${displaySkuAttrTitle(a)}」（key: ${a.key}）请在「商品组」内添加单品并填写单名（售价·分），或填写下方商品售价（元）以供换算`,
            ok: false,
          })
          return
        }
        continue
      }
      if (templateSkuAttrWizardCovered(a, skuCoverCtx)) continue
      const v = templateSkuAttrOverrides[a.key]?.trim()
      if (!v) {
        setActionMsg({
          text: `开放平台 SKU 模板必填「${a.name}」（key: ${a.key}）尚未填写，请在「商品信息」内「商品组」区域填写`,
          ok: false,
        })
        return
      }
    }

    for (const r of skuAttrExtraRows) {
      const ek = r.key.trim()
      const ev = r.value.trim()
      if ((ek && !ev) || (!ek && ev)) {
        setActionMsg({ text: '自定义 SKU 属性：请同时填写属性 key 与值，或删除该行', ok: false })
        return
      }
    }

    const pkg = detail.package_combo
    const comboJson =
      pkg?.groups && pkg.groups.length > 0
        ? JSON.stringify({ groups: pkg.groups }).slice(0, 120_000)
        : ''
    const overrides: Record<string, string> = { ...templateAttrOverrides }
    if (productType === 1) {
      /** 团购：套餐仅从 package_combo 生成；网关会规范化后同步写入 product.combo_rule 与模板 combo_rule attr */
      for (const a of templateProductAttrs) {
        if (!looksComboTemplateAttr(a)) continue
        delete overrides[a.key]
      }
      for (const k of Object.keys(overrides)) {
        if (/^combo_rule$/i.test(k)) delete overrides[k]
      }
    } else {
      for (const a of templateProductAttrs) {
        if (!looksComboTemplateAttr(a)) continue
        if (comboJson) overrides[a.key] = comboJson
      }
    }
    const cleaned = Object.fromEntries(
      Object.entries(overrides).map(([k, v]) => [k, (v ?? '').trim()]).filter(([, v]) => v.length > 0),
    )
    if (Object.keys(cleaned).length > 0) {
      detail.template_attr_overrides = cleaned
    }

    const skuFromMap = Object.fromEntries(
      Object.entries(templateSkuAttrOverrides)
        .map(([k, v]) => [k, (v ?? '').trim()])
        .filter(([, v]) => v.length > 0),
    )
    const skuFromExtra = Object.fromEntries(
      skuAttrExtraRows
        .map((r) => [r.key.trim(), r.value.trim()])
        .filter(([k, v]) => k.length > 0 && v.length > 0),
    )
    let skuCleaned: Record<string, string> = { ...skuFromMap, ...skuFromExtra }
    if (productType === 1 && skuPriceCentsAttr) {
      const k = skuPriceCentsAttr.key
      const listed = comboGroups.flatMap((gr) => gr.items).filter((it) => it.name.trim())
      const fromItem = listed.length > 0 ? resolveComboItemPriceCents(listed[0]!) : ''
      const fromGlobal =
        Number.isFinite(Number.parseFloat(priceYuan)) && Number.parseFloat(priceYuan) > 0
          ? String(Math.round(Number.parseFloat(priceYuan) * 100))
          : ''
      const v = fromItem || fromGlobal
      if (v) skuCleaned = { ...skuCleaned, [k]: v }
    }
    if (Object.keys(skuCleaned).length > 0) {
      detail.template_sku_attr_overrides = skuCleaned
    }

    const imageBlock = collectUnpublishableImageProblems(detail)
    if (imageBlock) {
      setActionMsg({ text: imageBlock, ok: false })
      return
    }

    const names = selectedPoiIds
      .map((id) => modalStores.find((s) => s.id === id)?.name)
      .filter(Boolean) as string[]
    let storeLabel = '—'
    if (selectedPoiIds.length === 0) storeLabel = '—'
    else if (names.length === selectedPoiIds.length && selectedPoiIds.length <= 2)
      storeLabel = names.join('、')
    else if (names.length > 0)
      storeLabel =
        selectedPoiIds.length > 2
          ? `${names.slice(0, 2).join('、')}等${selectedPoiIds.length}店`
          : names.join('、')
    else storeLabel = `${selectedPoiIds.length} 家门店`

    let draftRowId = ''
    if (mode === 'draft') {
      draftRowId =
        (persistedProductIdRef.current && persistedProductIdRef.current.trim()) ||
        String(detail.out_id ?? '').trim() ||
        newId('meoo-draft')
    }

    setSaving(true)
    setActionMsg(null)

    if (mode === 'draft') {
      upsertProductEditLibraryDraft({
        id: draftRowId,
        name: detail.product_name,
        platform: '抖音来客',
        store: storeLabel,
        status: '草稿',
        price: detail.price_yuan,
        platformApi: 'douyin',
      })
      saveDraftDetailSnapshot(draftRowId, {
        ...detail,
        product_id: draftRowId,
        out_id: detail.out_id,
      })
    }

    const r = await postDouyinGoodsProductSave({ mode, detail })
    setSaving(false)
    if (r.ok) {
      const finalPid =
        (r.product_id && String(r.product_id).trim()) ||
        (mode === 'draft' ? draftRowId : String(detail.out_id ?? '').trim())

      if (mode === 'draft') {
        if (finalPid !== draftRowId) {
          replaceProductEditLibraryRowId(draftRowId, {
            id: finalPid,
            name: detail.product_name,
            platform: '抖音来客',
            store: storeLabel,
            status: '草稿',
            price: detail.price_yuan,
            platformApi: 'douyin',
          })
          renameDraftDetailSnapshotKey(draftRowId, finalPid)
        }
        upsertProductEditLibraryDraft({
          id: finalPid,
          name: detail.product_name,
          platform: '抖音来客',
          store: storeLabel,
          status: '草稿',
          price: detail.price_yuan,
          platformApi: 'douyin',
        })
      } else {
        upsertProductEditLibraryDraft({
          id: finalPid,
          name: detail.product_name,
          platform: '抖音来客',
          store: storeLabel,
          status: '审核中',
          price: detail.price_yuan,
          platformApi: 'douyin',
        })
      }
      saveDraftDetailSnapshot(finalPid, {
        ...detail,
        product_id: finalPid,
        out_id: detail.out_id,
      })
      if (r.product_id?.trim()) persistedProductIdRef.current = r.product_id.trim()
      setActionMsg({
        text:
          r.message ??
          (mode === 'submit'
            ? `已提交审核。平台商品编号：${r.product_id ?? '-'}`
            : `草稿已保存。平台商品编号：${r.product_id ?? '-'}，已同步至商品编辑库。`),
        ok: true,
      })
      if (mode === 'submit') navigate('/products/list')
    } else {
      if (mode === 'draft') {
        setActionMsg({
          text: `${r.message}。本机「商品列表」草稿箱已写入当前表单（含图片快照），可前往商品列表继续编辑。`,
          ok: false,
        })
      } else {
        const is504 = /504|超时|timeout|未及时完成|超过上限/i.test(r.message)
        setActionMsg({
          text: is504
            ? `${r.message} 可先「保存草稿」保留本机，稍后在网络较好时重试提交。`
            : r.message,
          ok: false,
        })
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" />
        正在检测行业与加载商品品类…
      </div>
    )
  }

  if (variant === 'edit' && editHydrating && !editLoadErr) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500">
        <Loader2 className="mb-3 h-8 w-8 animate-spin" />
        <p className="text-sm">正在从抖音来客或您保存的草稿中加载商品详情…</p>
      </div>
    )
  }

  if (variant === 'edit' && editLoadErr) {
    return (
      <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <Link
          to="/products/list"
          className="inline-flex items-center text-indigo-700 hover:underline"
        >
          <ChevronLeft className="h-4 w-4" />
          返回商品列表
        </Link>
        <p>{editLoadErr}</p>
      </div>
    )
  }

  if (loadErr) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {loadErr}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to={variant === 'edit' ? '/products/list' : '/products'}
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
        >
          <ChevronLeft className="h-4 w-4" />
          {variant === 'edit' ? '返回商品列表' : '返回商品管理'}
        </Link>
        <p className="text-xs text-gray-500">
          行业：<span className="font-medium text-gray-800">{industryName}</span> · 规则与抖音来客开放平台一致，详见{' '}
          <a
            className="text-indigo-600 hover:underline"
            href="https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/category.get"
            target="_blank"
            rel="noreferrer"
          >
            类目说明
          </a>
          、
          <a
            className="text-indigo-600 hover:underline"
            href="https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/template.get"
            target="_blank"
            rel="noreferrer"
          >
            模板说明
          </a>
          、
          <a
            className="text-indigo-600 hover:underline"
            href="https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/goods/save"
            target="_blank"
            rel="noreferrer"
          >
            保存与上架规则
          </a>
        </p>
      </div>

      <div className="flex gap-2 text-sm">
        {(['category', 'productType', 'detail'] as const).map((s, i) => (
          <div
            key={s}
            className={cn(
              'rounded-full px-3 py-1',
              step === s ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500',
            )}
          >
            {i + 1}. {s === 'category' ? '商品品类' : s === 'productType' ? '商品类型' : '商品信息'}
          </div>
        ))}
      </div>

      {step === 'category' && (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900">基础信息</h3>
          <p className="mt-1 text-xs text-gray-500">
            依次选择一级、二级、三级类目。灰色项为当前行业或平台规则下不可创建；黑色为可选。
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-sm font-medium text-gray-800">
                商品品类 <span className="text-red-500">*</span>
              </label>
              <select
                value={cat1}
                onChange={(e) => {
                  setCat1(e.target.value)
                  setCat2('')
                  setCat3('')
                }}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">请输入商品品类（一级）</option>
                {l1Options.map((n) => (
                  <option key={n.category_id} value={n.category_id} disabled={!n.enable}>
                    {!n.enable ? `${n.name}（不可用）` : n.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-800">
                二级类目 <span className="text-red-500">*</span>
              </label>
              <select
                value={cat2}
                onChange={(e) => {
                  setCat2(e.target.value)
                  setCat3('')
                }}
                disabled={!cat1}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
              >
                <option value="">请选择</option>
                {l2Options.map((n) => (
                  <option key={n.category_id} value={n.category_id} disabled={!n.enable}>
                    {!n.enable ? `${n.name}（不可用）` : n.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-800">
                三级类目 <span className="text-red-500">*</span>
              </label>
              <select
                value={cat3}
                onChange={(e) => setCat3(e.target.value)}
                disabled={!cat2}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
              >
                <option value="">请选择</option>
                {l3Options.map((n) => {
                  const ok = leafSelectable(n.category_id, n)
                  return (
                    <option key={n.category_id} value={n.category_id} disabled={!ok}>
                      {!ok ? `${n.name}（不可发）` : n.name}
                    </option>
                  )
                })}
              </select>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              disabled={!canNextCategory}
              onClick={() => setStep('productType')}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              下一步
            </button>
          </div>
        </section>
      )}

      {step === 'productType' && (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900">商品类型</h3>
          <p className="mt-1 text-xs text-gray-500">
            由已选三级类目圈定。全部类型均列出；灰色项表示在当前类目下按平台规则不可选。
          </p>
          {typesLoading ? (
            <div className="mt-6 flex items-center text-gray-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              加载商品类型…
            </div>
          ) : typesLoadError ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {typesLoadError}
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {detailPrepError ? (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  进入下一步失败：{detailPrepError}
                  <span className="mt-1 block text-xs text-amber-800">
                    多为商品模板接口不可用（Network 中查看 template/get 或 meoo-douyin-goods-template-get）。
                  </span>
                </div>
              ) : null}
              {productTypes.map((t) => (
                <label
                  key={t.product_type}
                  className={cn(
                    'flex cursor-pointer items-center rounded-lg border px-3 py-2 text-sm',
                    t.eligible ? 'border-gray-200 hover:bg-gray-50' : 'border-gray-100 bg-gray-50',
                  )}
                >
                  <input
                    type="radio"
                    name="pt"
                    className="mr-2"
                    disabled={!t.eligible}
                    checked={productType === t.product_type}
                    onChange={() => setProductType(t.product_type)}
                  />
                  <span className={cn(!t.eligible && 'text-gray-400')}>
                    {t.label}
                    {!t.eligible ? <span className="ml-1 text-xs text-gray-400">（当前类目不可用）</span> : null}
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="mt-6 flex justify-between">
            <button
              type="button"
              onClick={() => {
                setDetailPrepError(null)
                setStep('category')
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              上一步
            </button>
            <button
              type="button"
              disabled={!canNextType || detailPrepLoading}
              onClick={() => void goDetail()}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {detailPrepLoading ? '加载模板…' : '下一步'}
            </button>
          </div>
        </section>
      )}

      {step === 'detail' && (
        <>
          <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start xl:gap-8">
            <div className="min-w-0 space-y-6">
              <section className="rounded-xl border border-gray-200 bg-gray-50/80 p-6">
                <h3 className="text-base font-semibold text-gray-900">商家信息</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm text-gray-600">商家名称</label>
                    <input
                      readOnly
                      value={merchantName}
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">
                      收款方式 <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={paymentCollectMode}
                      onChange={(e) =>
                        setPaymentCollectMode(
                          e.target.value as 'per_poi' | 'merchant_unified' | 'platform_agent',
                        )
                      }
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800"
                    >
                      <option value="per_poi">各门店独立收款</option>
                      <option value="merchant_unified">商户统一收款</option>
                      <option value="platform_agent">平台代收 / 代分账（按类目资质）</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      将随商品一并提交，用于结算与分账方式（以抖音来客当前类目要求为准）。
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <label className="text-sm font-medium text-gray-800">
                    适用门店 <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={openStoreModal}
                      className="inline-flex items-center rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
                    >
                      <Store className="mr-2 h-4 w-4" />
                      选择门店
                    </button>
                    <span className="text-sm text-gray-600">
                      已选 <span className="font-semibold text-gray-900">{selectedPoiIds.length}</span>{' '}
                      家门店
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    门店列表来自已绑定的抖音来客账号；弹窗内支持搜索与分页。
                  </p>
                </div>
              </section>

              <section className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-900">AI 模型（可选）</h3>
                <p className="mt-1 text-xs text-gray-600">
                  不使用「AI 智能优化 / 生图」时可忽略本节。使用 AI 时需在系统设置或本机为各厂商配置浏览器端 API
                  Key；可选择由系统按已配置 Key 自动挑选厂商，或手选固定模型（仅本机生效）。
                </p>
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-xs font-medium text-gray-700">文案类（标题优化、说明生成）</p>
                    <div className="mt-2 flex flex-wrap items-center gap-4">
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-800">
                        <input
                          type="radio"
                          name="douyin-wizard-text-ai-mode"
                          checked={textAiAutoOn}
                          onChange={() => {
                            writeTextAiAuto(true)
                            setAiModelUiTick((n) => n + 1)
                          }}
                        />
                        自动（当前 {selectedTextAiLabel}）
                      </label>
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-800">
                        <input
                          type="radio"
                          name="douyin-wizard-text-ai-mode"
                          checked={!textAiAutoOn}
                          onChange={() => {
                            writeTextAiAuto(false)
                            setAiModelUiTick((n) => n + 1)
                          }}
                        />
                        手选
                      </label>
                    </div>
                    {!textAiAutoOn ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {aiModelPickOptions.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            title={m.label}
                            onClick={() => {
                              writeTextAiAuto(false)
                              writeTextAiManualModel(m.id)
                              setAiModelUiTick((n) => n + 1)
                            }}
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition',
                              manualTextAiId === m.id
                                ? 'border-indigo-500 bg-white shadow-sm'
                                : 'border-indigo-100 bg-white/70 hover:bg-white',
                            )}
                          >
                            <AiVendorCatalogAvatar id={m.id} label={m.label} logoUrl={m.logoUrl} size="xs" />
                            <span className="max-w-[9rem] truncate">{m.label}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-700">生图类（头图 / 辅助图 / 环境图）</p>
                    <div className="mt-2 flex flex-wrap items-center gap-4">
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-800">
                        <input
                          type="radio"
                          name="douyin-wizard-image-ai-mode"
                          checked={imageAiAutoOn}
                          onChange={() => {
                            writeImageAiAuto(true)
                            setAiModelUiTick((n) => n + 1)
                          }}
                        />
                        自动（当前 {selectedImageAiLabel}）
                      </label>
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-800">
                        <input
                          type="radio"
                          name="douyin-wizard-image-ai-mode"
                          checked={!imageAiAutoOn}
                          onChange={() => {
                            writeImageAiAuto(false)
                            setAiModelUiTick((n) => n + 1)
                          }}
                        />
                        手选
                      </label>
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500">
                      手选可与上文「文案类」相同目录；像素级生图/美化由通义万相、豆包 Seedream、MiniMax 上游执行（自动时优先通义/豆包）。若手选为 OpenAI、Kimi、Claude 等，本网关暂无对应生图 API，将按已配置 Key 自动选用上述三者之一。
                    </p>
                    {!imageAiAutoOn ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {aiModelPickOptions.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            title={m.label}
                            onClick={() => {
                              writeImageAiAuto(false)
                              writeImageAiManualModel(m.id)
                              setAiModelUiTick((n) => n + 1)
                            }}
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition',
                              manualImageAiId === m.id
                                ? 'border-indigo-500 bg-white shadow-sm'
                                : 'border-indigo-100 bg-white/70 hover:bg-white',
                            )}
                          >
                            <AiVendorCatalogAvatar id={m.id} label={m.label} logoUrl={m.logoUrl} size="xs" />
                            <span className="max-w-[9rem] truncate">{m.label}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <p id="douyin-ai-text-model-active" className="mt-3 text-xs text-gray-500">
                  「AI 智能优化」「根据商品名称 AI 生成说明」走文案设置；头图 / 辅助图 / 环境图走生图设置；各任务可并行。
                </p>
              </section>

              <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="text-base font-semibold text-gray-900">商品信息</h3>
                <div className="mt-4 space-y-4">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-sm font-medium text-gray-800">
                        商品名称 <span className="text-red-500">*</span>
                      </label>
                      <button
                        type="button"
                        disabled={aiOn('title') || aiOn('desc')}
                        aria-describedby="douyin-ai-text-model-active"
                        title={`文案模型：${selectedTextAiLabel}`}
                        onClick={() => void optimizeProductTitle()}
                        className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-50"
                      >
                        {aiOn('title') || aiOn('desc') ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        AI 智能优化
                      </button>
                    </div>
                    <input
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      maxLength={40}
                      placeholder="请输入商品名称"
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                    <p className="mt-1 text-xs text-gray-500">{productName.length} / 40</p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                    <h4 className="text-sm font-semibold text-gray-900">商品组</h4>
                    <p className="mt-0.5 text-[11px] text-gray-500">template.get · sku_attrs；团购时含 package_combo 搭配</p>
                    <p className="mt-1 text-xs text-gray-600">
                      与抖音来客「商品组」口径一致：<code className="rounded bg-white px-1 text-[11px]">goods/template/get</code>{' '}
                      返回的 sku 模板写入 <code className="rounded bg-white px-1 text-[11px]">sku.attr_key_value_map</code>；
                      商品类型为「团购」时，下方搭配组与 <code className="rounded bg-white px-1 text-[11px]">package_combo</code>{' '}
                      的 <code className="rounded bg-white px-1 text-[11px]">pick_rule</code>、单品列表一并提交（与开放平台商品 save 文档一致）。
                    </p>

                    {productType === 1 ? (
                      <div className="mt-4 space-y-3 border-t border-slate-200 pt-3">
                        <p className="text-xs font-medium text-gray-800">团购搭配 · 几选几</p>
                        <p className="text-xs text-gray-600">
                          当前类目路径：<span className="font-medium text-gray-800">{goodsCategoryPathZh || '—'}</span>
                          。模板中的「单名 / 售价(分)」已并入下方「添加单品」弹窗；添加单品弹窗中的扩展字段会按类目关键词切换；若与贵司类目模板不一致，请以
                          template.get / product.get 为准并在保存前核对。
                        </p>
                        {comboGroups.map((g, gi) => (
                          <div
                            key={g.id}
                            className="rounded-lg border border-indigo-100 bg-white/95 p-3 shadow-sm"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <span className="text-sm font-semibold text-gray-900">商品组</span>
                              <select
                                value={g.pickRule}
                                onChange={(e) =>
                                  setComboGroups((prev) =>
                                    prev.map((x) => (x.id === g.id ? { ...x, pickRule: e.target.value } : x)),
                                  )
                                }
                                className="max-w-[12rem] rounded border border-gray-300 bg-white px-2 py-1 text-xs"
                                aria-label="几选几"
                              >
                                {pickRuleSelectOptionsForItemCount(
                                  g.items.filter((it) => it.name.trim()).length,
                                ).map((o) => (
                                  <option key={o.value || 'empty'} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <button
                              type="button"
                              onClick={() => openComboItemModal(g.id, null)}
                              className="mt-2 text-xs font-medium text-indigo-700 hover:text-indigo-900 hover:underline"
                            >
                              添加单品
                            </button>
                            {g.items.some((it) => it.name.trim()) ? (
                              <ul className="mt-2 divide-y divide-gray-100 rounded border border-gray-100 bg-gray-50/50">
                                {g.items
                                  .filter((it) => it.name.trim())
                                  .map((it) => (
                                    <li
                                      key={it.id}
                                      className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5 text-xs text-gray-800"
                                    >
                                      <span className="min-w-0 flex-1 truncate font-medium">{it.name}</span>
                                      <span className="shrink-0 text-gray-600">
                                        ×{it.qty} · ¥{it.price}
                                        {skuPriceCentsAttr ? (
                                          <span className="ml-1 font-mono text-[10px] text-indigo-800">
                                            · 单名 {resolveComboItemPriceCents(it) || '—'} 分
                                          </span>
                                        ) : null}
                                      </span>
                                      <span className="flex shrink-0 gap-1">
                                        <button
                                          type="button"
                                          className="text-indigo-700 hover:underline"
                                          onClick={() => openComboItemModal(g.id, it.id)}
                                        >
                                          编辑
                                        </button>
                                        <button
                                          type="button"
                                          className="text-red-600 hover:underline"
                                          onClick={() => removeComboItem(g.id, it.id)}
                                        >
                                          删除
                                        </button>
                                      </span>
                                    </li>
                                  ))}
                              </ul>
                            ) : (
                              <p className="mt-2 text-xs text-gray-500">尚未添加单品；也可留空，保存时按商品名称自动生成一条单品。</p>
                            )}
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                              <button
                                type="button"
                                disabled={gi === 0}
                                onClick={() => moveComboGroupRow(gi, -1)}
                                className="hover:text-gray-900 disabled:opacity-30"
                              >
                                上移
                              </button>
                              <button
                                type="button"
                                disabled={gi >= comboGroups.length - 1}
                                onClick={() => moveComboGroupRow(gi, 1)}
                                className="hover:text-gray-900 disabled:opacity-30"
                              >
                                下移
                              </button>
                              <button
                                type="button"
                                onClick={() => removeComboGroupRow(g.id)}
                                className="text-red-700 hover:underline"
                              >
                                删除组
                              </button>
                            </div>
                          </div>
                        ))}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={addComboGroupRow}
                            className="text-sm font-medium text-indigo-700 hover:underline"
                          >
                            添加商品组
                          </button>
                          <span className="text-xs text-gray-500">
                            共 {comboListedItemCount} 个单品 · {comboGroups.length} 个组
                          </span>
                        </div>
                      </div>
                    ) : null}

                    {productGroupSkuAttrsList.length === 0 && skuAttrExtraRows.length === 0 && productType !== 1 ? (
                      <p className="mt-2 text-xs text-amber-800">
                        当前模板未返回 sku_attrs。若开放平台仍要求补充 SKU 维度字段，可点击下方「新增自定义 SKU 属性」自行添加
                        key/value。
                      </p>
                    ) : productGroupSkuAttrsList.length === 0 &&
                      skuAttrExtraRows.length === 0 &&
                      productType === 1 ? (
                      <p className="mt-2 text-xs text-gray-600">
                        当前模板未返回 sku_attrs，可直接用上方「团购搭配」维护单品；如需补充 SKU 维度字段，可点下方「新增自定义 SKU 属性」。
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-3">
                        {productGroupSkuAttrsList.map((a) => {
                          const skuCovered = templateSkuAttrWizardCovered(a, skuTemplateCoverCtx)
                          const title = displaySkuAttrTitle(a)
                          return (
                            <li
                              key={`sku-info-${a.key}`}
                              className="rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-sm text-gray-800"
                            >
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <span className="font-medium text-gray-900">
                                  {title}
                                  {a.is_required ? <span className="text-red-500"> *</span> : null}
                                </span>
                                <span
                                  className={cn(
                                    'rounded px-2 py-0.5 text-xs',
                                    skuCovered
                                      ? 'bg-emerald-100 text-emerald-900'
                                      : a.is_required
                                        ? 'bg-amber-100 text-amber-950'
                                        : 'bg-slate-100 text-slate-700',
                                  )}
                                >
                                  {skuCovered ? '自动映射' : a.is_required ? '须填写' : '选填'}
                                </span>
                              </div>
                              {title !== (a.name || '').trim() ? (
                                <p className="mt-0.5 text-[11px] text-gray-500">开放平台字段名：{a.name || a.key}</p>
                              ) : null}
                              <p className="mt-1 font-mono text-[11px] text-gray-500">
                                key: {a.key || '—'} · value_type: {a.value_type}
                                {a.is_multi ? ' · multi' : ''}
                              </p>
                              {a.desc ? <p className="mt-1 text-xs text-gray-600">{a.desc}</p> : null}
                              {skuCovered ? (
                                <p className="mt-2 text-xs text-emerald-900">
                                  已由本页「售价 / 划线价 / 库存 / 商品名称」与网关逻辑自动映射，无需再填。
                                </p>
                              ) : templateAttrValueLooksNumeric(a) ? (
                                <input
                                  type="number"
                                  step="any"
                                  value={templateSkuAttrOverrides[a.key] ?? ''}
                                  onChange={(e) =>
                                    setTemplateSkuAttrOverrides((prev) => ({ ...prev, [a.key]: e.target.value }))
                                  }
                                  placeholder="填写数值（将写入 sku.attr_key_value_map）"
                                  className="mt-2 w-full rounded border border-gray-300 px-2 py-1.5 font-mono text-xs"
                                />
                              ) : (
                                <textarea
                                  value={templateSkuAttrOverrides[a.key] ?? ''}
                                  onChange={(e) =>
                                    setTemplateSkuAttrOverrides((prev) => ({ ...prev, [a.key]: e.target.value }))
                                  }
                                  rows={String(a.value_type).toUpperCase().includes('STRUCT') ? 5 : 2}
                                  placeholder="填写该 SKU 模板 key 的字符串值（JSON 须可解析）"
                                  className="mt-2 w-full rounded border border-gray-300 px-2 py-1.5 font-mono text-xs"
                                />
                              )}
                            </li>
                          )
                        })}
                        {skuAttrExtraRows.map((r) => (
                          <li
                            key={r.id}
                            className="rounded-lg border border-dashed border-indigo-200 bg-white/90 px-3 py-2 text-sm text-gray-800"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs font-medium text-indigo-900">自定义 SKU 属性</span>
                              <button
                                type="button"
                                title="删除此行"
                                onClick={() => setSkuAttrExtraRows((prev) => prev.filter((x) => x.id !== r.id))}
                                className="rounded p-1 text-gray-500 hover:bg-red-50 hover:text-red-600"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                              <input
                                value={r.key}
                                onChange={(e) =>
                                  setSkuAttrExtraRows((prev) =>
                                    prev.map((x) => (x.id === r.id ? { ...x, key: e.target.value } : x)),
                                  )
                                }
                                placeholder="attr key（与开放平台字段名一致）"
                                className="w-full rounded border border-gray-300 px-2 py-1.5 font-mono text-xs"
                              />
                              <input
                                value={r.value}
                                onChange={(e) =>
                                  setSkuAttrExtraRows((prev) =>
                                    prev.map((x) => (x.id === r.id ? { ...x, value: e.target.value } : x)),
                                  )
                                }
                                placeholder="值（将写入 sku.attr_key_value_map）"
                                className="w-full rounded border border-gray-300 px-2 py-1.5 font-mono text-xs"
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setSkuAttrExtraRows((prev) => [...prev, { id: newId('sku-x'), key: '', value: '' }])
                      }
                      className="mt-3 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-800 hover:bg-indigo-50"
                    >
                      新增自定义 SKU 属性
                    </button>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-sm font-medium text-gray-800">商品说明</label>
                      <button
                        type="button"
                        disabled={aiOn('desc')}
                        aria-describedby="douyin-ai-text-model-active"
                        title={`文案模型：${selectedTextAiLabel}`}
                        onClick={() => void generateDescOnly()}
                        className="text-xs font-medium text-violet-700 underline decoration-violet-300 hover:text-violet-900 disabled:opacity-50"
                      >
                        {aiOn('desc') ? '生成中…' : '根据商品名称 AI 生成说明'}
                      </button>
                    </div>
                    <textarea
                      value={productDesc}
                      onChange={(e) => setProductDesc(e.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="填写商品搭配、规格等补充说明；可先填名称再点上方「AI 智能优化」自动生成"
                    />
                  </div>
                </div>
              </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900">售价与图片</h3>
            <p id="douyin-ai-image-model-active" className="mt-2 text-xs text-gray-500">
              头图、辅助图、环境图的 AI 使用上文「AI 模型（可选）」中的生图设置；生图每次只生成一张。「AI 优化」基于**当前上传图**与商品标题，并按抖音来客**本地生活场景**做美化（图生图提示词由网关下发）；辅助图与环境图可对单张「优化此图」或「批量优化全部」。
            </p>
            <p className="mt-3 text-xs text-blue-600">服务费以平台结算为准，此处仅采集标价</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-gray-800">
                  售价（元） <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={priceYuan}
                  onChange={(e) => setPriceYuan(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="请输入"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">划线价（元）</label>
                <input
                  type="number"
                  value={originYuan}
                  onChange={(e) => setOriginYuan(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-xs text-gray-700">
              图片须符合抖音来客规范。上传后将用于商品素材；若在体验环境中未接通正式上传通道，则可能显示示意图地址。
            </div>
            <input
              ref={headFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                const url = await runImageUpload(f, 'head')
                if (url) setHeadUrl(url)
              }}
            />
            <div className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-medium text-gray-800">
                  商品头图 <span className="text-red-500">*</span>
                  <span className="font-normal text-gray-500">（{headUrl ? 1 : 0}/1）</span>
                </label>
                <div
                  className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-lg border border-violet-100 bg-violet-50/80 px-2 py-1 text-xs text-violet-900"
                  aria-describedby="douyin-ai-image-model-active"
                  title={
                    imageAiHeadline.auto
                      ? `生图：自动（当前 ${imageAiHeadline.opt?.label ?? imageAiHeadline.id}）`
                      : `生图：${selectedImageAiLabel}`
                  }
                >
                  {renderImageGenTriggerContent(false)}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={Boolean(headUrl.trim()) || !!uploadingSlot || aiOn('img-head')}
                  onClick={() => void aiGenerateHeadImage()}
                  className="rounded-lg border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-violet-800 hover:bg-violet-50 disabled:opacity-50"
                >
                  AI 生成一张头图
                </button>
                <button
                  type="button"
                  disabled={!headUrl.trim() || !!uploadingSlot || aiOn('img-head')}
                  onClick={() => void aiEnhanceHeadImage()}
                  className="rounded-lg border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-violet-800 hover:bg-violet-50 disabled:opacity-50"
                >
                  AI 优化当前头图
                </button>
                {aiOn('img-head') ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-600" /> : null}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                生图每次只生成一张；已有头图时请点「优化」或先移除再生成。模型取自上文「AI 模型（可选）」中的生图设置。
              </p>
              <div className="mt-2 flex flex-wrap items-start gap-3">
                <button
                  type="button"
                  disabled={uploadingSlot === 'head' || aiOn('img-head')}
                  onClick={() => headFileRef.current?.click()}
                  className="inline-flex items-center rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                >
                  {uploadingSlot === 'head' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  上传头图
                </button>
                {headUrl && (
                  <div className="relative">
                    <button
                      type="button"
                      className="block cursor-zoom-in rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      onClick={() => setImagePreviewUrl(headUrl)}
                      title="点击查看大图"
                    >
                      <img src={headUrl} alt="" className="h-20 w-20 rounded-lg border object-cover" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setHeadUrl('')
                      }}
                      className="absolute -right-2 -top-2 rounded-full bg-gray-800 p-1 text-white hover:bg-gray-900"
                      aria-label="移除"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            <input
              ref={auxFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f || auxUrlsList.length >= 4) return
                const url = await runImageUpload(f, 'aux')
                if (url) setAuxUrlsList((prev) => [...prev, url].slice(0, 4))
              }}
            />
            <div className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-medium text-gray-800">
                  辅助图 <span className="font-normal text-gray-500">（{auxUrlsList.length}/4）</span>
                </label>
                <div
                  className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-lg border border-violet-100 bg-violet-50/80 px-2 py-1 text-xs text-violet-900"
                  aria-describedby="douyin-ai-image-model-active"
                  title={
                    imageAiHeadline.auto
                      ? `生图：自动（当前 ${imageAiHeadline.opt?.label ?? imageAiHeadline.id}）`
                      : `生图：${selectedImageAiLabel}`
                  }
                >
                  {renderImageGenTriggerContent(false)}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={auxUrlsList.length >= 4 || !!uploadingSlot || aiOn('img-aux')}
                  onClick={() => void aiGenerateOneAuxImage()}
                  className="rounded-lg border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-violet-800 hover:bg-violet-50 disabled:opacity-50"
                >
                  AI 生成一张
                </button>
                <button
                  type="button"
                  disabled={auxUrlsList.length === 0 || !!uploadingSlot || aiOn('img-aux')}
                  onClick={() => void aiEnhanceAllAux()}
                  className="rounded-lg border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-violet-800 hover:bg-violet-50 disabled:opacity-50"
                >
                  批量优化全部
                </button>
                {aiOn('img-aux') ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-600" /> : null}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                生图每点一次只增加一张（最多 4 张）；缩略图下可「AI 优化此图」单张处理，或用「批量优化全部」一次处理本节已上传的全部图。
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {auxUrlsList.map((u, i) => (
                  <div key={`${u}-${i}`} className="flex flex-col items-center gap-1">
                    <div className="relative">
                      <button
                        type="button"
                        className="block cursor-zoom-in rounded focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        onClick={() => setImagePreviewUrl(u)}
                        title="点击查看大图"
                      >
                        <img src={u} alt="" className="h-16 w-16 rounded border object-cover" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setAuxUrlsList((prev) => prev.filter((_, j) => j !== i))
                        }}
                        className="absolute -right-1 -top-1 rounded-full bg-gray-800 p-0.5 text-white"
                        aria-label="移除"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={uploadingSlot === 'aux' || aiOn('img-aux')}
                      onClick={() => void aiEnhanceAuxOne(i)}
                      className="text-[10px] font-medium text-violet-700 underline decoration-violet-200 hover:text-violet-900 disabled:opacity-40"
                    >
                      AI 优化此图
                    </button>
                  </div>
                ))}
                {auxUrlsList.length < 4 && (
                  <button
                    type="button"
                    disabled={uploadingSlot === 'aux' || aiOn('img-aux')}
                    onClick={() => auxFileRef.current?.click()}
                    className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {uploadingSlot === 'aux' ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Upload className="h-5 w-5" />
                    )}
                  </button>
                )}
              </div>
            </div>
            <input
              ref={envFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f || envUrlsList.length >= 10) return
                const url = await runImageUpload(f, 'env')
                if (url) setEnvUrlsList((prev) => [...prev, url].slice(0, 10))
              }}
            />
            <div className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-medium text-gray-800">
                  环境图 <span className="font-normal text-gray-500">（{envUrlsList.length}/10）</span>
                </label>
                <div
                  className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-lg border border-violet-100 bg-violet-50/80 px-2 py-1 text-xs text-violet-900"
                  aria-describedby="douyin-ai-image-model-active"
                  title={
                    imageAiHeadline.auto
                      ? `生图：自动（当前 ${imageAiHeadline.opt?.label ?? imageAiHeadline.id}）`
                      : `生图：${selectedImageAiLabel}`
                  }
                >
                  {renderImageGenTriggerContent(false)}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={envUrlsList.length >= 10 || !!uploadingSlot || aiOn('img-env')}
                  onClick={() => void aiGenerateOneEnvImage()}
                  className="rounded-lg border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-violet-800 hover:bg-violet-50 disabled:opacity-50"
                >
                  AI 生成一张
                </button>
                <button
                  type="button"
                  disabled={envUrlsList.length === 0 || !!uploadingSlot || aiOn('img-env')}
                  onClick={() => void aiEnhanceAllEnv()}
                  className="rounded-lg border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-violet-800 hover:bg-violet-50 disabled:opacity-50"
                >
                  批量优化全部
                </button>
                {aiOn('img-env') ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-600" /> : null}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                生图每点一次只增加一张（最多 10 张）；缩略图下可「AI 优化此图」单张处理，或用「批量优化全部」一次处理本节已上传的全部图。
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {envUrlsList.map((u, i) => (
                  <div key={`${u}-${i}`} className="flex flex-col items-center gap-1">
                    <div className="relative">
                      <button
                        type="button"
                        className="block cursor-zoom-in rounded focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        onClick={() => setImagePreviewUrl(u)}
                        title="点击查看大图"
                      >
                        <img src={u} alt="" className="h-16 w-16 rounded border object-cover" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEnvUrlsList((prev) => prev.filter((_, j) => j !== i))
                        }}
                        className="absolute -right-1 -top-1 rounded-full bg-gray-800 p-0.5 text-white"
                        aria-label="移除"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={uploadingSlot === 'env' || aiOn('img-env')}
                      onClick={() => void aiEnhanceEnvOne(i)}
                      className="text-[10px] font-medium text-violet-700 underline decoration-violet-200 hover:text-violet-900 disabled:opacity-40"
                    >
                      AI 优化此图
                    </button>
                  </div>
                ))}
                {envUrlsList.length < 10 && (
                  <button
                    type="button"
                    disabled={uploadingSlot === 'env' || aiOn('img-env')}
                    onClick={() => envFileRef.current?.click()}
                    className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {uploadingSlot === 'env' ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Upload className="h-5 w-5" />
                    )}
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900">售卖信息</h3>
            <p className="mt-1 text-xs text-gray-500">
              投放渠道、职人带货等选项来自平台模板规则，会与商品信息一并提交审核。
            </p>
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <span className="font-medium">
                  投放渠道 <span className="text-red-500">*</span>
                </span>
                <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(salesChannelOptions.length ? salesChannelOptions : [{ value: salesChannel, label: salesChannel }]).map(
                      (opt) => (
                        <label
                          key={opt.value}
                          className="flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-2 py-1.5 hover:bg-white"
                        >
                          <input
                            type="radio"
                            name="salesChannel"
                            checked={salesChannel === opt.value}
                            onChange={() => setSalesChannel(opt.value)}
                          />
                          <span>{opt.label}</span>
                        </label>
                      ),
                    )}
                  </div>
                </div>
              </div>
              <div>
                <span className="font-medium">
                  职人/店员带货 <span className="text-red-500">*</span>
                </span>
                <div className="mt-2 flex flex-wrap gap-3">
                  {(staffSalesOptions.length ? staffSalesOptions : [
                    { value: 'allow', label: '允许' },
                    { value: 'deny', label: '不允许' },
                  ]).map((opt) => (
                    <label key={opt.value} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="staffSales"
                        checked={staffSales === opt.value}
                        onChange={() => setStaffSales(opt.value)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  库存 <span className="text-red-500">*</span>
                </span>
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={stockLimited}
                    onChange={() => setStockLimited(true)}
                    className="mr-1"
                  />
                  限库存
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={!stockLimited}
                    onChange={() => setStockLimited(false)}
                    className="mr-1"
                  />
                  不限
                </label>
                {stockLimited && (
                  <input
                    type="number"
                    value={stockQty}
                    onChange={(e) => setStockQty(e.target.value)}
                    className="w-24 rounded border px-2 py-1"
                  />
                )}
                <span className="text-gray-500">份</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  售卖日期 <span className="text-red-500">*</span>
                </span>
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={saleTimeLimited}
                    onChange={() => setSaleTimeLimited(true)}
                    className="mr-1"
                  />
                  限时售卖
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={!saleTimeLimited}
                    onChange={() => setSaleTimeLimited(false)}
                    className="mr-1"
                  />
                  不限
                </label>
              </div>
              {saleTimeLimited && (
                <div className="flex flex-wrap gap-2">
                  <input
                    type="datetime-local"
                    value={saleStart}
                    onChange={(e) => setSaleStart(e.target.value)}
                    className="rounded border px-2 py-1 text-xs"
                  />
                  <span>~</span>
                  <input
                    type="datetime-local"
                    value={saleEnd}
                    onChange={(e) => setSaleEnd(e.target.value)}
                    className="rounded border px-2 py-1 text-xs"
                  />
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900">交易规则</h3>
            <p className="mt-1 text-xs text-gray-500">
              默认值按类目与商品类型由抖音来客下发，可根据经营需要微调后随商品一并保存。
            </p>
            <div className="mt-4 space-y-4 text-sm">
              <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                <p className="font-medium text-gray-900">顾客可消费日期</p>
                <div className="mt-2 space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={consumeDateMode === 'days'}
                      onChange={() => setConsumeDateMode('days')}
                    />
                    指定天数可用
                  </label>
                  {consumeDateMode === 'days' && (
                    <div className="ml-6 flex flex-wrap items-center gap-2 text-xs text-gray-700">
                      <span>自购买次日起</span>
                      <input
                        type="number"
                        min={1}
                        value={consumeValidDays}
                        onChange={(e) => setConsumeValidDays(e.target.value)}
                        className="w-20 rounded border px-2 py-1"
                      />
                      <span>天内可用（购买当日默认可用）</span>
                    </div>
                  )}
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={consumeDateMode === 'calendar'}
                      onChange={() => setConsumeDateMode('calendar')}
                    />
                    指定日期可用（请在商品说明中补充具体日期区间）
                  </label>
                </div>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                <p className="font-medium text-gray-900">顾客不可消费日期</p>
                <div className="mt-2 space-y-1">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={nonConsumeDateMode === 'all_dates'}
                      onChange={() => setNonConsumeDateMode('all_dates')}
                    />
                    所有日期均可用
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={nonConsumeDateMode === 'partial_dates'}
                      onChange={() => setNonConsumeDateMode('partial_dates')}
                    />
                    部分日期不可用（请在说明中列明）
                  </label>
                </div>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                <p className="font-medium text-gray-900">每日消费时段</p>
                <div className="mt-2 space-y-1">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={dailyAllDay}
                      onChange={() => setDailyAllDay(true)}
                    />
                    全天可用
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={!dailyAllDay}
                      onChange={() => setDailyAllDay(false)}
                    />
                    仅指定时间可用（请在说明中补充时段）
                  </label>
                </div>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                <p className="font-medium text-gray-900">限购规则</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={customerPurchaseLimitMode === 'none'}
                      onChange={() => setCustomerPurchaseLimitMode('none')}
                    />
                    不限制购买
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={customerPurchaseLimitMode === 'limited'}
                      onChange={() => setCustomerPurchaseLimitMode('limited')}
                    />
                    限制购买
                  </label>
                  {customerPurchaseLimitMode === 'limited' && (
                    <span className="flex items-center gap-1 text-xs">
                      每人最多
                      <input
                        type="number"
                        min={1}
                        value={customerPurchaseLimitMax}
                        onChange={(e) => setCustomerPurchaseLimitMax(e.target.value)}
                        className="w-16 rounded border px-1 py-0.5"
                      />
                      件
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label className="font-medium">售后政策</label>
                <select
                  value={afterSalePolicy}
                  onChange={(e) => setAfterSalePolicy(e.target.value)}
                  className="mt-1 w-full max-w-md rounded border border-gray-300 px-2 py-1.5"
                >
                  {(afterSalePolicyOptions.length ? afterSalePolicyOptions : [
                    { value: 'refund_anytime', label: '随时退' },
                  ]).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                <p className="font-medium text-gray-900">预约规则</p>
                <div className="mt-2 space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={reserveMode === 'required'}
                      onChange={() => setReserveMode('required')}
                    />
                    到店需要预约
                  </label>
                  {reserveMode === 'required' && (
                    <div className="ml-6 flex flex-wrap items-center gap-2 text-xs">
                      <span>需提前</span>
                      <input
                        type="number"
                        min={1}
                        value={reserveAdvance}
                        onChange={(e) => setReserveAdvance(e.target.value)}
                        className="w-14 rounded border px-1 py-0.5"
                      />
                      <select
                        value={reserveUnit}
                        onChange={(e) => setReserveUnit(e.target.value as 'day' | 'hour')}
                        className="rounded border px-1 py-0.5"
                      >
                        <option value="day">天</option>
                        <option value="hour">小时</option>
                      </select>
                      <span>电话预约</span>
                    </div>
                  )}
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={reserveMode === 'none'}
                      onChange={() => setReserveMode('none')}
                    />
                    到店前不需要预约
                  </label>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="font-medium">
                    券码类型 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={couponType}
                    onChange={(e) => setCouponType(e.target.value)}
                    className="mt-1 w-full rounded border px-2 py-1"
                  >
                    <option value="douyin">抖音券</option>
                  </select>
                </div>
                <div>
                  <label className="font-medium">商家平台商品ID</label>
                  <input
                    value={externalGoodsId}
                    onChange={(e) => setExternalGoodsId(e.target.value)}
                    maxLength={100}
                    className="mt-1 w-full rounded border px-2 py-1"
                    placeholder="与开放平台 product.out_id 一致；三方码场景必填，可填贵司侧商品编码"
                  />
                  <p className="text-right text-xs text-gray-400">{externalGoodsId.length} / 100</p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900">消费规则</h3>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <span className="font-medium">店内其他优惠</span>
                <div className="mt-1 space-y-1">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="disc"
                      checked={inStoreDiscount === 'exclusive'}
                      onChange={() => setInStoreDiscount('exclusive')}
                      className="mr-2"
                    />
                    不与店内优惠同享
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="disc"
                      checked={inStoreDiscount === 'share'}
                      onChange={() => setInStoreDiscount('share')}
                      className="mr-2"
                    />
                    可与店内其他优惠同享
                  </label>
                </div>
              </div>
              <div>
                <span className="font-medium">额外费用</span>
                <label className="ml-2">
                  <input
                    type="checkbox"
                    checked={extraFee}
                    onChange={() => setExtraFee((v) => !v)}
                    className="mr-1"
                  />
                  是
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  使用张数限制 <span className="text-red-500">*</span>
                </span>
                <label className="flex items-center">
                  <input type="radio" checked={!voucherLimit} onChange={() => setVoucherLimit(false)} />
                  <span className="ml-1">不限</span>
                </label>
                <label className="flex items-center">
                  <input type="radio" checked={voucherLimit} onChange={() => setVoucherLimit(true)} />
                  <span className="ml-1">限制</span>
                </label>
                {voucherLimit && (
                  <input
                    type="number"
                    value={voucherMax}
                    onChange={(e) => setVoucherMax(e.target.value)}
                    className="w-16 rounded border px-1"
                  />
                )}
                <span>张</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  使用人数限制 <span className="text-red-500">*</span>
                </span>
                <label className="flex items-center">
                  <input type="radio" checked={!peopleLimit} onChange={() => setPeopleLimit(false)} />
                  <span className="ml-1">不限</span>
                </label>
                <label className="flex items-center">
                  <input type="radio" checked={peopleLimit} onChange={() => setPeopleLimit(true)} />
                  <span className="ml-1">限制</span>
                </label>
                {peopleLimit && (
                  <input
                    type="number"
                    value={peopleMax}
                    onChange={(e) => setPeopleMax(e.target.value)}
                    className="w-16 rounded border px-1"
                  />
                )}
                <span>人</span>
              </div>
              <div>
                <label className="font-medium">其他说明信息</label>
                <textarea
                  value={otherRules}
                  onChange={(e) => setOtherRules(e.target.value)}
                  maxLength={500}
                  rows={3}
                  className="mt-1 w-full rounded border px-2 py-1 text-sm"
                  placeholder="多条规则请换行"
                />
                <p className="text-right text-xs text-gray-400">{otherRules.length} / 500</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-6 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900">开放平台类目必填（template.get）</h3>
            <p className="mt-1 text-xs leading-relaxed text-gray-700">
              依据抖音
              <a
                href="https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/template.get"
                target="_blank"
                rel="noreferrer"
                className="text-blue-700 underline"
              >
                查询商品模板
              </a>
              与
              <a
                href="https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/goods/save"
                target="_blank"
                rel="noreferrer"
                className="text-blue-700 underline"
              >
                创建/更新商品
              </a>
              ：下列为当前类目下 <span className="font-medium">is_required=true</span> 的商品属性。标注「自动映射」的由本页表单 + 网关写入{' '}
              <code className="rounded bg-white/80 px-1 text-[11px]">attr_key_value_map</code>；其余请填写 JSON 字符串（结构体须序列化）。
            </p>
            {requiredTemplateAttrs.length === 0 ? (
              <p className="mt-3 text-sm text-gray-600">
                当前模板未返回必填项，或 template 接口异常；请确认第二步「下一步」已正常加载模板。
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {requiredTemplateAttrs.map((a) => {
                  const covered = templateAttrWizardCovered(a)
                  const comboLike = looksComboTemplateAttr(a)
                  return (
                    <li
                      key={a.key || a.name}
                      className="rounded-lg border border-blue-100 bg-white/90 px-3 py-2 text-sm text-gray-800"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium text-gray-900">
                          {a.name} <span className="text-red-500">*</span>
                        </span>
                        <span
                          className={cn(
                            'rounded px-2 py-0.5 text-xs',
                            covered ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-950',
                          )}
                        >
                          {covered ? '自动映射' : '须填写'}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-gray-500">
                        key: {a.key || '—'} · value_type: {a.value_type}
                        {a.is_multi ? ' · multi' : ''}
                      </p>
                      {a.desc ? <p className="mt-1 text-xs text-gray-600">{a.desc}</p> : null}
                      {comboLike && covered ? (
                        <p className="mt-2 text-xs text-emerald-900">
                          与「商品名称 / 售价 / 套餐数据」生成的{' '}
                          <code className="rounded bg-emerald-50 px-1">package_combo</code> 同源；
                          {productType === 1
                            ? ' 保存时由网关写入抖音请求体顶层 product.combo_rule，并同步填充模板 attr_key_value_map 的 combo_rule。'
                            : ' 保存时将按本属性 key 写入 combo_rule JSON。'}
                        </p>
                      ) : null}
                      {!covered ? (
                        templateAttrValueLooksNumeric(a) ? (
                          <input
                            type="number"
                            step="any"
                            value={templateAttrOverrides[a.key] ?? ''}
                            onChange={(e) =>
                              setTemplateAttrOverrides((prev) => ({ ...prev, [a.key]: e.target.value }))
                            }
                            placeholder="填写数值（将按字符串提交至 attr_key_value_map）"
                            className="mt-2 w-full rounded border border-gray-300 px-2 py-1.5 font-mono text-xs"
                          />
                        ) : (
                          <textarea
                            value={templateAttrOverrides[a.key] ?? ''}
                            onChange={(e) =>
                              setTemplateAttrOverrides((prev) => ({ ...prev, [a.key]: e.target.value }))
                            }
                            rows={comboLike || String(a.value_type).toUpperCase().includes('STRUCT') ? 5 : 2}
                            placeholder="填写该 key 对应的字符串值（JSON 须为单行或可解析文本）"
                            className="mt-2 w-full rounded border border-gray-300 px-2 py-1.5 font-mono text-xs"
                          />
                        )
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
            {templateSkuAttrs.length > 0 ? (
              <div className="mt-5 border-t border-blue-100 pt-4">
                <p className="text-xs text-gray-600">
                  <span className="font-medium text-gray-800">商品组（sku_attrs）</span>
                  已与类目、商品类型对齐的表单项已上移至「商品信息」；保存时经网关合并写入{' '}
                  <code className="rounded bg-white/80 px-1 text-[11px]">sku.attr_key_value_map</code>；团购搭配见同区块「几选几」与{' '}
                  <code className="rounded bg-white/80 px-1 text-[11px]">package_combo</code>。
                </p>
              </div>
            ) : null}
          </section>

          {actionMsg && (
            <div
              className={cn(
                'rounded-lg border px-3 py-2 text-sm',
                actionMsg.ok ? 'border-green-200 bg-green-50 text-green-900' : 'border-amber-200 bg-amber-50',
              )}
            >
              {actionMsg.text}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={() => setStep('productType')}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              上一步
            </button>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave('draft')}
                className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
              >
                保存草稿
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave('submit')}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                提交审核
              </button>
            </div>
          </div>
            </div>

            <aside className="mt-8 hidden min-w-0 xl:mt-0 xl:block">
              <div className="sticky top-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  商品预览（抖音团购样式）
                </p>
                <div className="mx-auto max-w-[280px] overflow-hidden rounded-2xl border-[6px] border-gray-900 bg-white shadow-2xl">
                  <div className="aspect-[4/3] bg-gray-100">
                    {headUrl ? (
                      <img src={headUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-gray-400">头图</div>
                    )}
                  </div>
                  <div className="bg-gradient-to-r from-rose-500 to-pink-500 px-3 py-2 text-white">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xl font-bold">¥{displayPriceYuan}</span>
                      {displayOriginYuan ? (
                        <span className="text-xs line-through opacity-90">¥{displayOriginYuan}</span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[10px] opacity-95">直买约 ¥{directBuyYuan} · 以平台为准</p>
                  </div>
                  <div className="space-y-2 p-3">
                    <p className="line-clamp-2 text-sm font-bold text-gray-900">
                      {productName.trim() || '商品名称'}
                    </p>
                    <div className="flex flex-wrap gap-1 text-[10px] text-gray-600">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5">随时退</span>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5">过期自动退</span>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5">免预约</span>
                    </div>
                    {productType === 1 && previewComboLines.length > 0 ? (
                      <div className="border-t border-gray-100 pt-2">
                        <p className="text-xs font-semibold text-gray-800">团购详情</p>
                        <ul className="mt-1 space-y-1 text-[11px] text-gray-700">
                          {previewComboLines.map((it, idx) => (
                            <li key={`${it.name}-${idx}`} className="flex justify-between gap-2">
                              <span className="truncate">
                                {it.name}（{it.qty || 1} 份）
                              </span>
                              <span className="shrink-0 text-gray-500">¥{it.price || '0'}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <p className="line-clamp-3 text-[11px] leading-snug text-gray-600">
                      {productDesc.trim() || '购买须知、服务说明等将展示在此区域'}
                    </p>
                  </div>
                  <div className="flex border-t border-gray-100 bg-gray-50 px-2 py-2 text-[10px] text-gray-600">
                    <span className="flex-1 text-center">收藏</span>
                    <span className="flex-1 text-center font-medium text-gray-800">去购买 ¥{directBuyYuan}</span>
                    <span className="flex-1 text-center font-semibold text-rose-600">App ¥{displayPriceYuan}</span>
                  </div>
                </div>
                <p className="text-center text-[10px] text-gray-400">布局参考抖音来客 C 端团购页</p>
                <button
                  type="button"
                  onClick={() => setFloatPreviewOpen(true)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
                >
                  打开悬浮预览
                </button>
              </div>
            </aside>
          </div>

          <button
            type="button"
            onClick={() => setFloatPreviewOpen(true)}
            className="fixed bottom-20 right-4 z-30 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-lg xl:hidden"
          >
            预览
          </button>

          {floatPreviewOpen && (
            <div
              className="fixed z-[55] w-[min(100vw-2rem,280px)] rounded-xl border border-gray-200 bg-white shadow-2xl"
              style={{ left: floatPos.x, top: floatPos.y }}
            >
              <div
                className="flex cursor-grab items-center justify-between border-b bg-gray-50 px-2 py-1.5 active:cursor-grabbing"
                onMouseDown={(e) => {
                  e.preventDefault()
                  const sx = e.clientX
                  const sy = e.clientY
                  const ox = floatPos.x
                  const oy = floatPos.y
                  const onMove = (ev: MouseEvent) => {
                    setFloatPos({
                      x: Math.max(8, Math.min(window.innerWidth - 200, ox + ev.clientX - sx)),
                      y: Math.max(8, Math.min(window.innerHeight - 120, oy + ev.clientY - sy)),
                    })
                  }
                  const onUp = () => {
                    window.removeEventListener('mousemove', onMove)
                    window.removeEventListener('mouseup', onUp)
                  }
                  window.addEventListener('mousemove', onMove)
                  window.addEventListener('mouseup', onUp)
                }}
              >
                <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600">
                  <Move className="h-3.5 w-3.5" />
                  悬浮预览
                </span>
                <button
                  type="button"
                  onClick={() => setFloatPreviewOpen(false)}
                  className="rounded p-1 text-gray-500 hover:bg-gray-200"
                  aria-label="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-[70vh] overflow-y-auto p-3">
                <div className="mx-auto max-w-[260px] overflow-hidden rounded-2xl border-[6px] border-gray-900 bg-white shadow-inner">
                  <div className="aspect-[4/3] bg-gray-100">
                    {headUrl ? (
                      <img src={headUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-gray-400">头图</div>
                    )}
                  </div>
                  <div className="bg-gradient-to-r from-rose-500 to-pink-500 px-2 py-1.5 text-[10px] text-white">
                    <div className="flex justify-between font-bold">
                      <span>¥{displayPriceYuan}</span>
                      {displayOriginYuan ? <span className="line-through opacity-90">¥{displayOriginYuan}</span> : null}
                    </div>
                  </div>
                  <div className="space-y-1.5 p-2">
                    <p className="line-clamp-2 text-[11px] font-bold leading-tight text-gray-900">
                      {productName.trim() || '商品名称'}
                    </p>
                    {productType === 1 && previewComboLines.length > 0 ? (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-800">团购详情</p>
                        <ul className="text-[9px] text-gray-700">
                          {previewComboLines.map((it, idx) => (
                            <li key={`f-${it.name}-${idx}`}>
                              {it.name} ×{it.qty || 1} ¥{it.price || '0'}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <p className="line-clamp-3 text-[9px] leading-relaxed text-gray-600">
                      {productDesc.trim() || '商品说明'}
                    </p>
                    <p className="text-[9px] text-gray-400">门店 {selectedPoiIds.length} 家</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {imagePreviewUrl ? (
        <div
          className="fixed inset-0 z-[280] flex items-center justify-center bg-black/80 p-4"
          role="presentation"
          onClick={() => setImagePreviewUrl(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/95 p-2 text-gray-800 shadow-lg hover:bg-white"
            onClick={(e) => {
              e.stopPropagation()
              setImagePreviewUrl(null)
            }}
            aria-label="关闭预览"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={imagePreviewUrl}
            alt=""
            className="max-h-[92vh] max-w-[96vw] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}

      {comboItemModal ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => setComboItemModal(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="combo-item-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 id="combo-item-modal-title" className="text-base font-semibold text-gray-900">
                {comboItemModal.itemId ? '编辑单品' : '添加单品'}
              </h2>
              <button
                type="button"
                onClick={() => setComboItemModal(null)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 px-4 py-3 text-sm">
              <p className="text-xs text-gray-500">
                单品会写入 <code className="rounded bg-gray-100 px-1">package_combo.groups[].items</code>；扩展字段按类目折叠进单品名称。字段全集以{' '}
                <a
                  className="text-indigo-600 hover:underline"
                  href="https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/goods/save"
                  target="_blank"
                  rel="noreferrer"
                >
                  商品 save
                </a>
                、
                <a
                  className="text-indigo-600 hover:underline"
                  href="https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/template.get"
                  target="_blank"
                  rel="noreferrer"
                >
                  template.get
                </a>
                为准。
              </p>
              <div>
                <label className="text-xs font-medium text-gray-700">
                  单品名称 <span className="text-red-500">*</span>
                </label>
                <input
                  value={comboItemModal.draft.name}
                  onChange={(e) =>
                    setComboItemModal({
                      ...comboItemModal,
                      draft: { ...comboItemModal.draft, name: e.target.value },
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="请输入单品名称"
                  maxLength={120}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-gray-700">
                    单品数量 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={comboItemModal.draft.qty}
                    onChange={(e) =>
                      setComboItemModal({
                        ...comboItemModal,
                        draft: { ...comboItemModal.draft, qty: e.target.value },
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">
                    门店售价（元） <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={comboItemModal.draft.price}
                    onChange={(e) =>
                      setComboItemModal({
                        ...comboItemModal,
                        draft: { ...comboItemModal.draft, price: e.target.value },
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="0"
                  />
                </div>
              </div>
              {skuPriceCentsAttr ? (
                <div>
                  <label className="text-xs font-medium text-gray-700">
                    单名（售价·分）
                    {skuPriceCentsAttr.is_required ? <span className="text-red-500"> *</span> : null}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={comboItemModal.draft.price_cents}
                    onChange={(e) =>
                      setComboItemModal({
                        ...comboItemModal,
                        draft: { ...comboItemModal.draft, price_cents: e.target.value },
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
                    placeholder="不填则按门店售价×100 自动换算"
                  />
                  <p className="mt-1 text-[11px] text-gray-500">
                    开放平台字段：{skuPriceCentsAttr.name || skuPriceCentsAttr.key} · key{' '}
                    <span className="font-mono">{skuPriceCentsAttr.key}</span> →{' '}
                    <code className="rounded bg-gray-100 px-1">sku.attr_key_value_map</code>
                  </p>
                </div>
              ) : null}
              <div>
                <label className="text-xs font-medium text-gray-700">规格描述</label>
                <input
                  value={comboItemModal.draft.spec}
                  onChange={(e) =>
                    setComboItemModal({
                      ...comboItemModal,
                      draft: { ...comboItemModal.draft, spec: e.target.value },
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="可选，会附在单品名称后提交"
                />
              </div>
              {comboModalFieldFlags.brand ? (
                <div>
                  <label className="text-xs font-medium text-gray-700">品牌（当前类目展示）</label>
                  <input
                    value={comboItemModal.draft.brand}
                    onChange={(e) =>
                      setComboItemModal({
                        ...comboItemModal,
                        draft: { ...comboItemModal.draft, brand: e.target.value },
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="餐饮 / 丽人等类目常见项"
                  />
                </div>
              ) : null}
              {comboModalFieldFlags.barcode ? (
                <div>
                  <label className="text-xs font-medium text-gray-700">条形码（当前类目展示）</label>
                  <input
                    value={comboItemModal.draft.barcode}
                    onChange={(e) =>
                      setComboItemModal({
                        ...comboItemModal,
                        draft: { ...comboItemModal.draft, barcode: e.target.value },
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="可选"
                  />
                </div>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t bg-gray-50 px-4 py-3">
              <button
                type="button"
                onClick={() => setComboItemModal(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-white"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmComboItemModal}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {storeModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => setStoreModalOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="store-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 id="store-modal-title" className="text-lg font-semibold text-gray-900">
                选择适用门店
              </h2>
              <button
                type="button"
                onClick={() => setStoreModalOpen(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="border-b px-5 py-3">
              <div className="flex flex-wrap gap-2">
                <input
                  type="search"
                  value={modalSearchInput}
                  onChange={(e) => setModalSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setModalKeyword(modalSearchInput.trim())
                      setModalPage(1)
                    }
                  }}
                  placeholder="搜索门店名称"
                  className="min-w-[200px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    setModalKeyword(modalSearchInput.trim())
                    setModalPage(1)
                  }}
                  className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  <Search className="mr-1 h-4 w-4" />
                  搜索
                </button>
              </div>
            </div>
            <div className="max-h-[min(50vh,420px)] overflow-y-auto px-5 py-3">
              {modalLoading ? (
                <div className="flex items-center justify-center py-12 text-gray-500">
                  <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                  加载中…
                </div>
              ) : modalStores.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">暂无门店数据，请检查绑定与 shop.query</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {modalStores.map((s) => (
                    <li key={s.id} className="flex items-center py-2">
                      <input
                        type="checkbox"
                        className="mr-3 h-4 w-4 rounded border-gray-300"
                        checked={modalDraftIds.includes(s.id)}
                        onChange={() => toggleModalPoi(s.id)}
                      />
                      <span className="text-sm text-gray-900">{s.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-gray-50 px-5 py-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                <span>每页</span>
                {[10, 20, 50].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setModalPageSize(n)
                      setModalPage(1)
                    }}
                    className={cn(
                      'rounded px-2 py-1',
                      modalPageSize === n
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50',
                    )}
                  >
                    {n}
                  </button>
                ))}
                <span className="ml-2">
                  共 {modalTotal} 条，第 {modalPage} / {Math.max(1, Math.ceil(modalTotal / modalPageSize))} 页
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={modalPage <= 1}
                  onClick={() => setModalPage((p) => Math.max(1, p - 1))}
                  className="rounded border border-gray-300 bg-white px-3 py-1 text-sm disabled:opacity-40"
                >
                  上一页
                </button>
                <button
                  type="button"
                  disabled={modalPage >= Math.max(1, Math.ceil(modalTotal / modalPageSize))}
                  onClick={() => setModalPage((p) => p + 1)}
                  className="rounded border border-gray-300 bg-white px-3 py-1 text-sm disabled:opacity-40"
                >
                  下一页
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-4">
              <button
                type="button"
                onClick={() => setStoreModalOpen(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmStoreModal}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                确定（已选 {modalDraftIds.length} 家）
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
