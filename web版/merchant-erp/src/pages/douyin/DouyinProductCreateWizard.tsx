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
import { loadDraftDetailSnapshot, saveDraftDetailSnapshot } from '../../lib/productDraftSnapshot'
import { Link, useNavigate } from 'react-router-dom'
import { type DouyinCategoryNode, findNodeById } from '../../data/douyinCategoryMock'
import { cn } from '../../cn'
import AiModelAutoPicker from '../../components/AiModelAutoPicker'
import AiVendorCatalogAvatar from '../../components/AiVendorCatalogAvatar'
import AiVendorDirectoryChips from '../../components/AiVendorDirectoryChips'
import { readMerchantSession } from '../../lib/merchantSession'
import {
  loadDouyinGoodsCategoryTreeForPicker,
  pickerChildrenOf,
  pickerLeafSelectable,
  pickerPathIdsToLeaf,
} from '../../lib/douyinGoodsCategoryPicker'
import { upsertProductEditLibraryDraft } from '../../lib/productEditLibrary'
import { getDouyinStores } from '../../services/douyinMerchantApi'
import {
  collectUploadableLeafCategoryIdsFromTree,
  fetchDouyinGoodsCategoryChildren,
  mergeDouyinCategoryChildrenIntoTree,
  type DouyinCategoryTreeNode,
  type DouyinProductDetailPayload,
  type ProductTypeOption,
  type TemplateSelectOption,
  getDouyinGoodsTemplate,
  getDouyinGoodsProductGet,
  getDouyinGoodsProductOnlineQuery,
  getDouyinProductTypesForCategory,
  postDouyinGoodsProductSave,
  uploadDouyinProductImage,
  type DouyinOnlineProductHit,
} from '../../services/douyinProductApi'
import {
  listAiUiModelOptions,
  type AiAssistRequest,
  type AiModelId,
  postDouyinGoodsAiAssist,
} from '../../services/douyinAiAssistApi'
import { MEOO_AI_VENDOR_CATALOG_EVENT } from '../../services/merchantAiVendorCatalogClient'
import { readVendorKeyMap } from '../../services/merchantAiVendorKeysStorage'
import {
  MERCHANT_AI_MODEL_STORAGE_KEY,
  MERCHANT_IMAGE_AI_MODEL_STORAGE_KEY,
  resolveImageAiModelForRequest,
  resolveModelForAssistAction,
  resolveTextAiModelForRequest,
} from '../../services/merchantAiModelStorage'
import { MEOO_REGISTRY_SYNC_EVENT } from '../../lib/opsRegistryConstants'

type ComboItemRow = {
  id: string
  name: string
  qty: string
  price: string
  /** 来客线上商品匹配（online.query） */
  product_id?: string
  sku_id?: string
}
type ComboGroupRow = { id: string; pickRule: string; items: ComboItemRow[] }

type Step = 'category' | 'productType' | 'detail'

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** 几选几选项随组内单品行数变化；与 goods/save 的 package_combo.pick_rule 对齐 */
function buildComboPickRuleSelectOptions(itemCount: number): { value: string; label: string }[] {
  if (itemCount < 1) return [{ value: '全部必选', label: '全部必选' }]
  const opts: { value: string; label: string }[] = [{ value: '全部必选', label: '全部必选' }]
  if (itemCount >= 2) {
    opts.push({ value: '全部可选', label: '全部可选' })
    for (let m = 1; m < itemCount; m += 1) {
      opts.push({ value: `${itemCount}选${m}`, label: `${itemCount}选${m}` })
    }
    opts.push({ value: '任选其一', label: '任选其一' })
  }
  return opts
}

function normalizePickRule(rule: string, itemCount: number): string {
  const allowed = new Set(buildComboPickRuleSelectOptions(itemCount).map((o) => o.value))
  if (allowed.has(rule)) return rule
  return '全部必选'
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

  /** 与设置页一致：优先展示已配置浏览器 Key 的厂商 */
  const aiVendorChipsForDisplay = useMemo(() => {
    const all = listAiUiModelOptions()
    const keys = readVendorKeyMap()
    const withKey = all.filter((m) => Boolean(keys[m.id]?.trim()))
    return withKey.length > 0 ? withKey : all
  }, [aiOptionsReload])

  const postAssistWithKeys = useCallback(async (body: Omit<AiAssistRequest, 'model'>) => {
    const model = resolveModelForAssistAction(body.action) as AiModelId
    const r = await postDouyinGoodsAiAssist({ ...body, model })
    if (r.ok || !r.needVendorKey) return r
    return {
      ok: false as const,
      message: `${r.message} 请前往「系统设置 → AI 模型绑定」中的「管理各模型 API Key」完成配置。`,
    }
  }, [])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== MERCHANT_AI_MODEL_STORAGE_KEY && e.key !== MERCHANT_IMAGE_AI_MODEL_STORAGE_KEY) return
      setAiModelUiTick((n) => n + 1)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
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

  const [comboGroups, setComboGroups] = useState<ComboGroupRow[]>([])
  /** 团购单品：online.query 联想下拉 key = `${groupId}:${itemId}` */
  const [comboMatch, setComboMatch] = useState<
    Record<string, { open: boolean; loading: boolean; hits: DouyinOnlineProductHit[]; err?: string }>
  >({})
  const comboSearchTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const [salesChannelOptions, setSalesChannelOptions] = useState<TemplateSelectOption[]>([])
  const [staffSalesOptions, setStaffSalesOptions] = useState<TemplateSelectOption[]>([])
  const [afterSalePolicyOptions, setAfterSalePolicyOptions] = useState<TemplateSelectOption[]>([])
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

  const comboSanitizeSig = useMemo(
    () => comboGroups.map((g) => `${g.id}:${g.items.length}:${g.pickRule}`).join('|'),
    [comboGroups],
  )

  useEffect(() => {
    setComboGroups((rows) => {
      let changed = false
      const next = rows.map((g) => {
        const pr = normalizePickRule(g.pickRule, g.items.length)
        if (pr !== g.pickRule) {
          changed = true
          return { ...g, pickRule: pr }
        }
        return g
      })
      return changed ? next : rows
    })
  }, [comboSanitizeSig])

  useEffect(() => {
    return () => {
      for (const t of comboSearchTimers.current.values()) window.clearTimeout(t)
      comboSearchTimers.current.clear()
    }
  }, [])

  const comboRowKey = (groupId: string, itemId: string) => `${groupId}:${itemId}`

  const scheduleComboItemOnlineSearch = useCallback((groupId: string, itemId: string, keyword: string) => {
    const key = comboRowKey(groupId, itemId)
    const prevT = comboSearchTimers.current.get(key)
    if (prevT) window.clearTimeout(prevT)
    const t = window.setTimeout(() => {
      comboSearchTimers.current.delete(key)
      void (async () => {
        const q = keyword.trim()
        if (q.length < 1) {
          setComboMatch((m) => ({ ...m, [key]: { open: false, loading: false, hits: [] } }))
          return
        }
        setComboMatch((m) => ({
          ...m,
          [key]: { open: true, loading: true, hits: m[key]?.hits ?? [], err: undefined },
        }))
        const r = await getDouyinGoodsProductOnlineQuery({ product_name: q, count: 10 })
        if (!r.ok) {
          setComboMatch((m) => ({ ...m, [key]: { open: false, loading: false, hits: [], err: r.message } }))
          return
        }
        setComboMatch((m) => ({
          ...m,
          [key]: {
            open: r.hits.length > 0,
            loading: false,
            hits: r.hits,
            err: r.hits.length
              ? undefined
              : '未命中：已按抖音 online.query 尝试自研/服务商口径及商家与服务商创建来源；若账号下确无已审核上架商品，接口本身也会为空，可直接手填名称继续保存',
          },
        }))
      })()
    }, 450)
    comboSearchTimers.current.set(key, t)
  }, [])

  const applyComboOnlineHit = useCallback((groupId: string, itemId: string, hit: DouyinOnlineProductHit) => {
    const key = comboRowKey(groupId, itemId)
    setComboMatch((m) => ({ ...m, [key]: { open: false, loading: false, hits: [], err: undefined } }))
    setComboGroups((rows) =>
      rows.map((r) =>
        r.id !== groupId
          ? r
          : {
              ...r,
              items: r.items.map((x) =>
                x.id !== itemId
                  ? x
                  : {
                      ...x,
                      name: hit.product_name,
                      price:
                        hit.price_yuan != null && Number.isFinite(hit.price_yuan)
                          ? String(hit.price_yuan)
                          : x.price,
                      product_id: hit.product_id,
                      sku_id: hit.sku_id,
                    },
              ),
            },
      ),
    )
  }, [])

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
    return r.url
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
      if (productType === 1) {
        setComboGroups((prev) =>
          prev.length > 0
            ? prev
            : [
                {
                  id: newId('g'),
                  pickRule: '全部必选',
                  items: [{ id: newId('i'), name: '', qty: '1', price: '' }],
                },
              ],
        )
      } else {
        setComboGroups([])
      }
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
              return {
                id: newId('g'),
                pickRule: String(gr.pick_rule ?? '全部必选'),
                items: (Array.isArray(gr.items) ? gr.items : []).map((it) => {
                  const row = it as Record<string, unknown>
                return {
                id: newId('i'),
                name: String(row.name ?? ''),
                qty: String(row.quantity ?? 1),
                price: String(row.origin_price_yuan ?? ''),
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

  const aiOptimizeHeadImage = useCallback(async () => {
    beginAi('img-head')
    try {
      if (headUrl.trim()) {
        const r = await postAssistWithKeys({
          action: 'image_enhance',
          product_name: productName.trim() || '商品',
          image_urls: [headUrl.trim()],
          image_role: 'head',
        })
        if (!r.ok) window.alert(r.message)
        else if (r.image_urls?.[0]) setHeadUrl(r.image_urls[0])
      } else {
        const n = productName.trim()
        if (!n) {
          window.alert('请先填写商品名称，以便 AI 生成头图')
          return
        }
        const r = await postAssistWithKeys({ action: 'image_generate', product_name: n, image_role: 'head' })
        if (!r.ok) window.alert(r.message)
        else if (r.image_urls?.[0]) setHeadUrl(r.image_urls[0])
      }
    } finally {
      endAi('img-head')
    }
  }, [postAssistWithKeys, headUrl, productName, beginAi, endAi])

  const aiOptimizeAuxImages = useCallback(async () => {
    beginAi('img-aux')
    try {
      if (auxUrlsList.length > 0) {
        const r = await postAssistWithKeys({
          action: 'image_enhance',
          product_name: productName.trim() || '商品',
          image_urls: [...auxUrlsList],
          image_role: 'aux',
        })
        if (!r.ok) window.alert(r.message)
        else if (r.image_urls?.length) setAuxUrlsList(r.image_urls.slice(0, 4))
      } else {
        const n = productName.trim()
        if (!n) {
          window.alert('请先填写商品名称')
          return
        }
        if (auxUrlsList.length >= 4) return
        const r = await postAssistWithKeys({ action: 'image_generate', product_name: n, image_role: 'aux' })
        if (!r.ok) window.alert(r.message)
        else if (r.image_urls?.[0])
          setAuxUrlsList((prev) => [...prev, r.image_urls![0]].slice(0, 4))
      }
    } finally {
      endAi('img-aux')
    }
  }, [postAssistWithKeys, auxUrlsList, productName, beginAi, endAi])

  const aiOptimizeEnvImages = useCallback(async () => {
    beginAi('img-env')
    try {
      if (envUrlsList.length > 0) {
        const r = await postAssistWithKeys({
          action: 'image_enhance',
          product_name: productName.trim() || '商品',
          image_urls: [...envUrlsList],
          image_role: 'env',
        })
        if (!r.ok) window.alert(r.message)
        else if (r.image_urls?.length) setEnvUrlsList(r.image_urls.slice(0, 10))
      } else {
        const n = productName.trim()
        if (!n) {
          window.alert('请先填写商品名称')
          return
        }
        if (envUrlsList.length >= 10) return
        const r = await postAssistWithKeys({ action: 'image_generate', product_name: n, image_role: 'env' })
        if (!r.ok) window.alert(r.message)
        else if (r.image_urls?.[0])
          setEnvUrlsList((prev) => [...prev, r.image_urls![0]].slice(0, 10))
      }
    } finally {
      endAi('img-env')
    }
  }, [postAssistWithKeys, envUrlsList, productName, beginAi, endAi])

  const buildDetailPayload = (): DouyinProductDetailPayload | null => {
    const price = Number.parseFloat(priceYuan)
    if (!productName.trim() || !Number.isFinite(price) || price <= 0) return null
    const head = headUrl.trim() ? [headUrl.trim()] : []
    const aux = auxUrlsList.filter(Boolean).slice(0, 4)
    const env = envUrlsList.filter(Boolean).slice(0, 10)
    const package_combo =
      productType === 1
        ? {
            groups: comboGroups.map((g) => ({
              pick_rule: g.pickRule.trim() || '全部必选',
              items: g.items
                .filter((it) => it.name.trim())
                .map((it) => ({
                  name: it.name.trim(),
                  quantity: Math.max(1, Number.parseInt(it.qty, 10) || 1),
                  origin_price_yuan: Math.max(0, Number.parseFloat(it.price) || 0),
                  ...(it.product_id ? { product_id: it.product_id } : {}),
                  ...(it.sku_id ? { sku_id: it.sku_id } : {}),
                })),
            })),
          }
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
    if (productType === 1) {
      for (const g of comboGroups) {
        const okItems = g.items.filter((it) => it.name.trim() && (Number.parseInt(it.qty, 10) || 0) > 0)
        if (okItems.length === 0) {
          setActionMsg({
            text: '团购商品搭配：每个商品组至少添加 1 个单品并填写名称与数量',
            ok: false,
          })
          return
        }
      }
    }
    const detail = buildDetailPayload()
    if (!detail) {
      setActionMsg({ text: '请完善必填：商品名称、售价、商品头图（上传）', ok: false })
      return
    }
    if (detail.poi_ids.length === 0) {
      setActionMsg({ text: '请至少选择一个适用门店', ok: false })
      return
    }
    setSaving(true)
    setActionMsg(null)
    const r = await postDouyinGoodsProductSave({ mode, detail })
    setSaving(false)
    if (r.ok) {
      const pid = (r.product_id && String(r.product_id).trim()) || detail.out_id
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

      if (mode === 'draft') {
        upsertProductEditLibraryDraft({
          id: pid,
          name: detail.product_name,
          platform: '抖音来客',
          store: storeLabel,
          status: '草稿',
          price: detail.price_yuan,
          platformApi: 'douyin',
        })
      } else {
        upsertProductEditLibraryDraft({
          id: pid,
          name: detail.product_name,
          platform: '抖音来客',
          store: storeLabel,
          status: '审核中',
          price: detail.price_yuan,
          platformApi: 'douyin',
        })
      }
      saveDraftDetailSnapshot(pid, {
        ...detail,
        product_id: pid,
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
      setActionMsg({ text: r.message, ok: false })
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
                <h3 className="text-sm font-semibold text-gray-900">目前绑定的 AI 模型</h3>
                <p className="mt-1 text-xs text-gray-600">
                  下方为当前目录中的模型（logo + 名称）。开关与下拉仍可按「自动 / 指定」分别设置<strong className="font-medium text-gray-700"> 文案</strong>与
                  <strong className="font-medium text-gray-700"> 生图</strong>；当前生效：文案{' '}
                  <span className="font-medium text-gray-800">{selectedTextAiLabel}</span>，生图{' '}
                  <span className="font-medium text-gray-800">{selectedImageAiLabel}</span>。
                </p>
                <div className="mt-3">
                  <AiVendorDirectoryChips options={aiVendorChipsForDisplay} />
                </div>
                <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
                  <div className="min-w-0 flex-1">
                    <div className="mt-2">
                      <AiModelAutoPicker
                        kind="text"
                        options={aiModelPickOptions}
                        onResolutionChange={() => setAiModelUiTick((n) => n + 1)}
                      />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mt-2">
                      <AiModelAutoPicker
                        kind="image"
                        options={aiModelPickOptions}
                        onResolutionChange={() => setAiModelUiTick((n) => n + 1)}
                      />
                    </div>
                  </div>
                </div>
                <p id="douyin-ai-text-model-active" className="mt-3 text-xs text-gray-500">
                  「AI 智能优化」「根据商品名称 AI 生成说明」走文案模型；头图 / 辅助图 / 环境图走生图模型；各任务可同时进行。
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

                  {productType === 1 && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-sm font-semibold text-gray-900">
                          商品搭配 <span className="text-red-500">*</span>
                        </label>
                        <span className="text-xs text-blue-700">查看示例：按组配置单品、数量与原价</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-600">
                        随团购套餐一并提交至抖音来客。单品名称支持调用「
                        <a
                          className="text-blue-600 underline"
                          href="https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/online.query"
                          target="_blank"
                          rel="noreferrer"
                        >
                          查询商品线上数据列表
                        </a>
                        」模糊匹配已上线商品；右上角「几选几」随组内单品行数自动生成（如 3选2）。
                      </p>
                      <div className="mt-3 space-y-4">
                        {comboGroups.map((g, gi) => (
                          <div
                            key={g.id}
                            className="group rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-all duration-200 hover:border-transparent hover:bg-gradient-to-r hover:from-indigo-500 hover:to-indigo-600 hover:shadow-md"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2 group-hover:border-white/20">
                              <span className="text-sm font-medium text-gray-800 group-hover:text-white">
                                商品组 {gi + 1}
                              </span>
                              <select
                                title="可选数量规则随当前组单品行数变化"
                                value={g.pickRule}
                                onChange={(e) =>
                                  setComboGroups((rows) =>
                                    rows.map((r) =>
                                      r.id === g.id ? { ...r, pickRule: e.target.value } : r,
                                    ),
                                  )
                                }
                                className="max-w-[220px] rounded border border-gray-300 px-2 py-1 text-xs group-hover:border-white/40 group-hover:bg-white/10 group-hover:text-white"
                              >
                                {buildComboPickRuleSelectOptions(g.items.length).map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="mt-2 space-y-2">
                              {g.items.map((it) => (
                                <div
                                  key={it.id}
                                  className="flex flex-col gap-1 rounded border border-dashed border-gray-200 p-2 group-hover:border-white/30"
                                >
                                  <div className="flex flex-wrap items-start gap-2">
                                    <div className="relative min-w-[140px] flex-1">
                                    <label className="text-[10px] text-gray-500 group-hover:text-white/80">
                                      单品名称（线上匹配）
                                    </label>
                                    <div className="mt-0.5 flex gap-1">
                                      <input
                                        value={it.name}
                                        onChange={(e) => {
                                          const v = e.target.value
                                          setComboGroups((rows) =>
                                            rows.map((r) =>
                                              r.id === g.id
                                                ? {
                                                    ...r,
                                                    items: r.items.map((x) =>
                                                      x.id === it.id
                                                        ? {
                                                            ...x,
                                                            name: v,
                                                            product_id: undefined,
                                                            sku_id: undefined,
                                                          }
                                                        : x,
                                                    ),
                                                  }
                                                : r,
                                            ),
                                          )
                                          scheduleComboItemOnlineSearch(g.id, it.id, v)
                                        }}
                                        placeholder="输入名称，自动搜线上商品"
                                        className="w-full min-w-0 rounded border border-gray-300 px-2 py-1 text-xs group-hover:border-white/40 group-hover:bg-white/10 group-hover:text-white group-hover:placeholder:text-white/60"
                                      />
                                      <button
                                        type="button"
                                        title="立即搜索抖音线上商品"
                                        className="mt-0.5 shrink-0 rounded border border-gray-300 p-1 text-gray-600 hover:bg-gray-50 group-hover:border-white/40 group-hover:text-white"
                                        onClick={() => {
                                          const q = it.name.trim()
                                          if (q.length < 1) {
                                            window.alert('请先输入单品名称再搜索')
                                            return
                                          }
                                          const key = comboRowKey(g.id, it.id)
                                          setComboMatch((m) => ({
                                            ...m,
                                            [key]: { open: true, loading: true, hits: [], err: undefined },
                                          }))
                                          void (async () => {
                                            const r = await getDouyinGoodsProductOnlineQuery({
                                              product_name: q,
                                              count: 10,
                                            })
                                            if (!r.ok) {
                                              setComboMatch((m) => ({
                                                ...m,
                                                [key]: { open: false, loading: false, hits: [], err: r.message },
                                              }))
                                              return
                                            }
                                            setComboMatch((m) => ({
                                              ...m,
                                              [key]: {
                                                open: r.hits.length > 0,
                                                loading: false,
                                                hits: r.hits,
                                                err: r.hits.length
                                                  ? undefined
                                                  : '未命中：已按 online.query 多策略检索；无上架商品时为空属正常，可手填名称',
                                              },
                                            }))
                                          })()
                                        }}
                                      >
                                        <Search className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                    {comboMatch[comboRowKey(g.id, it.id)]?.open &&
                                    (comboMatch[comboRowKey(g.id, it.id)]?.hits.length ?? 0) > 0 ? (
                                      <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-44 overflow-auto rounded-md border border-gray-200 bg-white text-xs shadow-lg">
                                        {(comboMatch[comboRowKey(g.id, it.id)]?.hits ?? []).map((h) => (
                                          <li key={`${h.product_id}-${h.sku_id ?? ''}`} className="border-b border-gray-50 last:border-0">
                                            <button
                                              type="button"
                                              className="w-full px-2 py-2 text-left hover:bg-indigo-50"
                                              onClick={() => applyComboOnlineHit(g.id, it.id, h)}
                                            >
                                              <div className="font-medium text-gray-900">{h.product_name}</div>
                                              <div className="text-[10px] text-gray-500">
                                                {h.source === 'draft'
                                                  ? '草稿 '
                                                  : h.source === 'local'
                                                    ? '本店已存 '
                                                    : '已上线 '}
                                                {h.price_yuan != null ? `参考价 ¥${h.price_yuan}` : ''}
                                                {h.sku_id ? ` · sku ${h.sku_id}` : ''}
                                              </div>
                                            </button>
                                          </li>
                                        ))}
                                      </ul>
                                    ) : null}
                                    </div>
                                  <div className="w-16 shrink-0">
                                    <label className="text-[10px] text-gray-500 group-hover:text-white/80">
                                      数量
                                    </label>
                                    <input
                                      type="number"
                                      min={1}
                                      value={it.qty}
                                      onChange={(e) =>
                                        setComboGroups((rows) =>
                                          rows.map((r) =>
                                            r.id === g.id
                                              ? {
                                                  ...r,
                                                  items: r.items.map((x) =>
                                                    x.id === it.id ? { ...x, qty: e.target.value } : x,
                                                  ),
                                                }
                                              : r,
                                          ),
                                        )
                                      }
                                      className="mt-0.5 w-full rounded border border-gray-300 px-1 py-1 text-xs group-hover:border-white/40 group-hover:bg-white/10 group-hover:text-white"
                                    />
                                  </div>
                                  <div className="w-24 shrink-0">
                                    <label className="text-[10px] text-gray-500 group-hover:text-white/80">
                                      原价(元)
                                    </label>
                                    <input
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      value={it.price}
                                      onChange={(e) =>
                                        setComboGroups((rows) =>
                                          rows.map((r) =>
                                            r.id === g.id
                                              ? {
                                                  ...r,
                                                  items: r.items.map((x) =>
                                                    x.id === it.id ? { ...x, price: e.target.value } : x,
                                                  ),
                                                }
                                              : r,
                                          ),
                                        )
                                      }
                                      className="mt-0.5 w-full rounded border border-gray-300 px-1 py-1 text-xs group-hover:border-white/40 group-hover:bg-white/10 group-hover:text-white"
                                    />
                                  </div>
                                  </div>
                                  <div className="min-h-[14px] space-y-0.5 text-[10px] leading-snug">
                                    {it.product_id ? (
                                      <p className="text-emerald-700 group-hover:text-emerald-100">
                                        已关联线上 product_id
                                      </p>
                                    ) : null}
                                    {comboMatch[comboRowKey(g.id, it.id)]?.err ? (
                                      <p className="text-rose-600 group-hover:text-amber-100">
                                        {comboMatch[comboRowKey(g.id, it.id)]?.err}
                                      </p>
                                    ) : null}
                                    {comboMatch[comboRowKey(g.id, it.id)]?.loading ? (
                                      <p className="text-gray-500 group-hover:text-white/80">匹配中…</p>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                              <button
                                type="button"
                                className="text-xs font-medium text-blue-600 group-hover:text-white"
                                onClick={() =>
                                  setComboGroups((rows) =>
                                    rows.map((r) => {
                                      if (r.id !== g.id) return r
                                      const nextItems = [
                                        ...r.items,
                                        { id: newId('i'), name: '', qty: '1', price: '' },
                                      ]
                                      return {
                                        ...r,
                                        items: nextItems,
                                        pickRule: normalizePickRule(r.pickRule, nextItems.length),
                                      }
                                    }),
                                  )
                                }
                              >
                                + 添加单品
                              </button>
                            </div>
                            <div className="mt-2 flex flex-wrap justify-end gap-2 text-xs">
                              <button
                                type="button"
                                className="text-blue-600 group-hover:text-white"
                                disabled={gi === 0}
                                onClick={() =>
                                  setComboGroups((rows) => {
                                    const next = [...rows]
                                    ;[next[gi - 1], next[gi]] = [next[gi], next[gi - 1]]
                                    return next
                                  })
                                }
                              >
                                上移
                              </button>
                              <button
                                type="button"
                                className="text-blue-600 group-hover:text-white"
                                disabled={gi >= comboGroups.length - 1}
                                onClick={() =>
                                  setComboGroups((rows) => {
                                    const next = [...rows]
                                    ;[next[gi], next[gi + 1]] = [next[gi + 1], next[gi]]
                                    return next
                                  })
                                }
                              >
                                下移
                              </button>
                              <button
                                type="button"
                                className="text-rose-600 group-hover:text-amber-200"
                                onClick={() => setComboGroups((rows) => rows.filter((r) => r.id !== g.id))}
                              >
                                删除组
                              </button>
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                          onClick={() =>
                            setComboGroups((rows) => [
                              ...rows,
                              {
                                id: newId('g'),
                                pickRule: '全部必选',
                                items: [{ id: newId('i'), name: '', qty: '1', price: '' }],
                              },
                            ])
                          }
                        >
                          + 添加商品组
                        </button>
                      </div>
                    </div>
                  )}

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
              头图、辅助图、环境图的 AI 生成与美化使用上方「目前绑定的 AI 模型」中的生图设置。
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
                <button
                  type="button"
                  disabled={!!uploadingSlot || aiOn('img-head')}
                  aria-describedby="douyin-ai-image-model-active"
                  title={`生图：${selectedImageAiLabel}`}
                  onClick={() => void aiOptimizeHeadImage()}
                  className="inline-flex max-w-[11rem] items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-50 sm:max-w-[14rem]"
                >
                  {aiOn('img-head') ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  ) : (
                    <>
                      <AiVendorCatalogAvatar
                        id={selectedImageAiOption?.id ?? 'minimax'}
                        label={selectedImageAiOption?.label ?? selectedImageAiLabel}
                        logoUrl={selectedImageAiOption?.logoUrl}
                        size="xs"
                      />
                      <span className="min-w-0 truncate">{selectedImageAiOption?.label ?? selectedImageAiLabel}</span>
                    </>
                  )}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                已上传则批量美化当前头图；未上传则按商品名称与上方「目前绑定的 AI 模型」中的生图设置生成一张。
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
                    <img src={headUrl} alt="" className="h-20 w-20 rounded-lg border object-cover" />
                    <button
                      type="button"
                      onClick={() => setHeadUrl('')}
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
                <button
                  type="button"
                  disabled={!!uploadingSlot || aiOn('img-aux')}
                  aria-describedby="douyin-ai-image-model-active"
                  title={`生图：${selectedImageAiLabel}`}
                  onClick={() => void aiOptimizeAuxImages()}
                  className="inline-flex max-w-[11rem] items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-50 sm:max-w-[14rem]"
                >
                  {aiOn('img-aux') ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  ) : (
                    <>
                      <AiVendorCatalogAvatar
                        id={selectedImageAiOption?.id ?? 'minimax'}
                        label={selectedImageAiOption?.label ?? selectedImageAiLabel}
                        logoUrl={selectedImageAiOption?.logoUrl}
                        size="xs"
                      />
                      <span className="min-w-0 truncate">{selectedImageAiOption?.label ?? selectedImageAiLabel}</span>
                    </>
                  )}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                无图时每点一次生成一张（最多 4 张）；已有多张则一次美化全部已上传图。
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {auxUrlsList.map((u, i) => (
                  <div key={`${u}-${i}`} className="relative">
                    <img src={u} alt="" className="h-16 w-16 rounded border object-cover" />
                    <button
                      type="button"
                      onClick={() => setAuxUrlsList((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -right-1 -top-1 rounded-full bg-gray-800 p-0.5 text-white"
                      aria-label="移除"
                    >
                      <X className="h-3 w-3" />
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
                <button
                  type="button"
                  disabled={!!uploadingSlot || aiOn('img-env')}
                  aria-describedby="douyin-ai-image-model-active"
                  title={`生图：${selectedImageAiLabel}`}
                  onClick={() => void aiOptimizeEnvImages()}
                  className="inline-flex max-w-[11rem] items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-50 sm:max-w-[14rem]"
                >
                  {aiOn('img-env') ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  ) : (
                    <>
                      <AiVendorCatalogAvatar
                        id={selectedImageAiOption?.id ?? 'minimax'}
                        label={selectedImageAiOption?.label ?? selectedImageAiLabel}
                        logoUrl={selectedImageAiOption?.logoUrl}
                        size="xs"
                      />
                      <span className="min-w-0 truncate">{selectedImageAiOption?.label ?? selectedImageAiLabel}</span>
                    </>
                  )}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                无图时每点一次生成一张（最多 10 张）；已有多张则一次美化全部已上传图。
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {envUrlsList.map((u, i) => (
                  <div key={`${u}-${i}`} className="relative">
                    <img src={u} alt="" className="h-16 w-16 rounded border object-cover" />
                    <button
                      type="button"
                      onClick={() => setEnvUrlsList((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -right-1 -top-1 rounded-full bg-gray-800 p-0.5 text-white"
                      aria-label="移除"
                    >
                      <X className="h-3 w-3" />
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
                    {productType === 1 && comboGroups.some((g) => g.items.some((it) => it.name.trim())) ? (
                      <div className="border-t border-gray-100 pt-2">
                        <p className="text-xs font-semibold text-gray-800">团购详情</p>
                        <ul className="mt-1 space-y-1 text-[11px] text-gray-700">
                          {comboGroups.flatMap((g) =>
                            g.items
                              .filter((it) => it.name.trim())
                              .map((it) => (
                                <li key={it.id} className="flex justify-between gap-2">
                                  <span className="truncate">
                                    {it.name}（{it.qty || 1} 份）
                                  </span>
                                  <span className="shrink-0 text-gray-500">
                                    ¥{it.price || '0'}
                                  </span>
                                </li>
                              )),
                          )}
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
                    {productType === 1 && comboGroups.some((g) => g.items.some((it) => it.name.trim())) ? (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-800">团购详情</p>
                        <ul className="text-[9px] text-gray-700">
                          {comboGroups.flatMap((g) =>
                            g.items
                              .filter((it) => it.name.trim())
                              .map((it) => (
                                <li key={`f-${it.id}`}>
                                  {it.name} ×{it.qty || 1} ¥{it.price || '0'}
                                </li>
                              )),
                          )}
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
