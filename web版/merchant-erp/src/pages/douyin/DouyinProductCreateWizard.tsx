/**
 * 抖音来客创建/编辑商品（按官方 template.get + product/save 流程重建）。
 * 开放平台 attr 由服务端网关按模板自动组装，不在此页手填 SubTitle/Description 等易错字段。
 */
import { ChevronLeft, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '../../cn'
import {
  comboGroupsFromPackageCombo,
  createDefaultComboGroups,
  packageComboFromFormGroups,
  type ComboGroupFormRow,
} from '../../lib/douyinComboGroupsForm'
import {
  composeProductDescWithRules,
  parseFormRulesFromDetailPayload,
  type DouyinProductFormRules,
  type DouyinTimePeriod,
  type DouyinWeekdayKey,
} from '../../lib/douyinProductRuleText'
import {
  loadDraftDetailSnapshot,
  renameDraftDetailSnapshotKey,
  saveDraftDetailSnapshot,
} from '../../lib/productDraftSnapshot'
import {
  replaceProductEditLibraryRowId,
  upsertProductEditLibraryDraft,
} from '../../lib/productEditLibrary'
import { readMerchantSession } from '../../lib/merchantSession'
import {
  loadDouyinGoodsCategoryTreeForPicker,
  pickerChildrenOf,
  pickerLeafSelectable,
  pickerLabelsForPath,
  pickerLevel3Options,
  pickerPathIdsToLeaf,
  pickerUploadableLeafIdsFromTree,
} from '../../lib/douyinGoodsCategoryPicker'
import { findNodeById } from '../../data/douyinCategoryMock'
import { normalizeDouyinDescription } from '../../lib/douyinDescriptionNormalize'
import DouyinProductWizardDetail from './DouyinProductWizardDetail'
import {
  fetchDouyinGoodsCategoryChildren,
  getDouyinGoodsProductGet,
  getDouyinGoodsTemplate,
  getDouyinProductTypesForCategory,
  mergeDouyinCategoryChildrenIntoTree,
  postDouyinGoodsProductSave,
  uploadDouyinProductImage,
  type DouyinCategoryTreeNode,
  type DouyinProductDetailPayload,
  type ProductTypeOption,
} from '../../services/douyinProductApi'

type Step = 'category' | 'productType' | 'detail'

export type DouyinProductWizardProps = {
  variant?: 'create' | 'edit'
  editProductId?: string
}

function readAccountName(): string {
  return readMerchantSession('meoo_douyin_account_name') ?? ''
}

function newDraftRowId(): string {
  return `meoo-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function DouyinProductCreateWizard({
  variant = 'create',
  editProductId,
}: DouyinProductWizardProps = {}) {
  const navigate = useNavigate()
  const isEdit = variant === 'edit' && Boolean(editProductId?.trim())

  const [step, setStep] = useState<Step>(isEdit ? 'detail' : 'category')
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [tree, setTree] = useState<DouyinCategoryTreeNode[]>([])
  /** 随 mergeDouyinCategoryChildrenIntoTree 更新，避免懒加载三级后 uploadableLeaves 仍为首包快照 */
  const uploadableLeaves = useMemo(() => pickerUploadableLeafIdsFromTree(tree), [tree])

  const [cat1, setCat1] = useState('')
  const [cat2, setCat2] = useState('')
  const [cat3, setCat3] = useState('')
  const [catSubtreeLoading, setCatSubtreeLoading] = useState<string | null>(null)

  const [productTypes, setProductTypes] = useState<ProductTypeOption[]>([])
  const [productType, setProductType] = useState<number | null>(null)
  const [typesLoading, setTypesLoading] = useState(false)

  const [productName, setProductName] = useState('')
  const [productDesc, setProductDesc] = useState('')
  const [priceYuan, setPriceYuan] = useState('')
  const [originYuan, setOriginYuan] = useState('')
  const [headUrl, setHeadUrl] = useState('')
  const [auxUrls, setAuxUrls] = useState<string[]>([''])
  const [envUrls, setEnvUrls] = useState<string[]>([''])
  const [comboGroups, setComboGroups] = useState<ComboGroupFormRow[]>(() => createDefaultComboGroups())

  const [selectedPoiIds, setSelectedPoiIds] = useState<string[]>([])
  const [selectedPoiNames, setSelectedPoiNames] = useState<string[]>([])
  const [storeModalOpen, setStoreModalOpen] = useState(false)

  const [afterSalePolicy, setAfterSalePolicy] = useState('refund_anytime')
  const [reserveMode, setReserveMode] = useState<'none' | 'required'>('none')
  const [reserveAdvanceDays, setReserveAdvanceDays] = useState(1)
  const [consumeValidDays, setConsumeValidDays] = useState('360')
  const [salesChannel, setSalesChannel] = useState('unlimited')
  const [saleTimeLimited, setSaleTimeLimited] = useState(false)
  const [saleStart, setSaleStart] = useState('')
  const [saleEnd, setSaleEnd] = useState('')
  const [nonConsumeDateMode, setNonConsumeDateMode] = useState<'all_dates' | 'partial_dates'>(
    'all_dates',
  )
  const [nonConsumeWeekdays, setNonConsumeWeekdays] = useState<DouyinWeekdayKey[]>([])
  const [nonConsumeHolidays, setNonConsumeHolidays] = useState<string[]>([])
  const [nonConsumeSpecificDates, setNonConsumeSpecificDates] = useState<string[]>([])
  const [dailyAllDay, setDailyAllDay] = useState(true)
  const [dailyTimePeriods, setDailyTimePeriods] = useState<DouyinTimePeriod[]>([
    { start: '09:00', end: '22:00' },
  ])
  const [purchaseLimitMode, setPurchaseLimitMode] = useState<'none' | 'limited'>('none')
  const [purchaseLimitPerPerson, setPurchaseLimitPerPerson] = useState(0)
  const [purchaseLimitPerDay, setPurchaseLimitPerDay] = useState(0)
  const [voucherUseLimit, setVoucherUseLimit] = useState(true)
  const [voucherUseMax, setVoucherUseMax] = useState(1)
  const [stockQty, setStockQty] = useState('999')

  const [saving, setSaving] = useState(false)
  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [detailPrepLoading, setDetailPrepLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  const persistedProductIdRef = useRef<string | null>(editProductId?.trim() ?? null)
  const stableOutIdRef = useRef<string | null>(null)
  const buildFormRules = useCallback((): DouyinProductFormRules => {
    return {
      salesChannel,
      saleTimeLimited,
      saleStart: saleStart || undefined,
      saleEnd: saleEnd || undefined,
      consumeValidDays: Number.parseInt(consumeValidDays, 10) || 360,
      nonConsumeDateMode,
      nonConsumeWeekdays,
      nonConsumeHolidays,
      nonConsumeSpecificDates,
      dailyAllDay,
      dailyTimePeriods,
      purchaseLimitMode,
      purchaseLimitPerPerson: purchaseLimitPerPerson || undefined,
      purchaseLimitPerDay: purchaseLimitPerDay || undefined,
      reserveMode,
      reserveAdvanceDays,
      voucherUseLimit,
      voucherUseMax,
      afterSalePolicy,
    }
  }, [
    afterSalePolicy,
    consumeValidDays,
    dailyAllDay,
    dailyTimePeriods,
    nonConsumeDateMode,
    nonConsumeHolidays,
    nonConsumeSpecificDates,
    nonConsumeWeekdays,
    purchaseLimitMode,
    purchaseLimitPerDay,
    purchaseLimitPerPerson,
    reserveAdvanceDays,
    reserveMode,
    saleEnd,
    saleStart,
    saleTimeLimited,
    salesChannel,
    voucherUseLimit,
    voucherUseMax,
  ])

  const cat3Node = useMemo(() => {
    if (!cat3) return null
    return findNodeById(tree, cat3)
  }, [tree, cat3])

  const l3Options = useMemo(
    () => (cat2 ? pickerLevel3Options(tree, cat2, uploadableLeaves) : []),
    [tree, cat2, uploadableLeaves],
  )

  const categoryPathLabel = useMemo(() => {
    if (!cat3) return ''
    return pickerLabelsForPath(tree, pickerPathIdsToLeaf(tree, cat3)).path
  }, [tree, cat3])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      const r = await loadDouyinGoodsCategoryTreeForPicker()
      if (cancelled) return
      setLoading(false)
      if (!r.ok) {
        setLoadErr(r.message)
        return
      }
      setTree(r.tree)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isEdit || !editProductId?.trim()) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      const key = editProductId.trim()
      let detail = loadDraftDetailSnapshot(key)
      if (!detail) {
        const r = await getDouyinGoodsProductGet(key)
        if (cancelled) return
        if (!r.ok) {
          setLoading(false)
          setLoadErr(r.message)
          return
        }
        detail = r.detail
      }
      if (cancelled) return
      setLoading(false)
      const d = detail
      persistedProductIdRef.current = d.product_id ?? editProductId.trim()
      stableOutIdRef.current = d.out_id ?? null
      setCat3(d.category_id)
      const path = pickerPathIdsToLeaf(tree, d.category_id)
      if (path[0]) setCat1(path[0])
      if (path[1]) setCat2(path[1])
      setProductType(d.product_type)
      setProductName(d.product_name)
      setProductDesc(d.product_desc ?? '')
      setPriceYuan(String(d.price_yuan))
      setOriginYuan(String(d.origin_price_yuan ?? d.price_yuan))
      setHeadUrl(d.head_image_urls?.[0] ?? '')
      setAuxUrls(d.aux_image_urls?.length ? d.aux_image_urls : [''])
      setEnvUrls(d.env_image_urls?.length ? d.env_image_urls : [''])
      setSelectedPoiIds(d.poi_ids ?? [])
      setComboGroups(comboGroupsFromPackageCombo(d.package_combo))
      const parsed = parseFormRulesFromDetailPayload(
        d.trade_rules,
        d.sales_info,
        d.consume_rules,
      )
      setAfterSalePolicy(parsed.afterSalePolicy ?? 'refund_anytime')
      setReserveMode(parsed.reserveMode ?? 'none')
      setReserveAdvanceDays(parsed.reserveAdvanceDays ?? 1)
      setConsumeValidDays(String(parsed.consumeValidDays ?? 360))
      setSalesChannel(parsed.salesChannel ?? 'unlimited')
      setSaleTimeLimited(parsed.saleTimeLimited ?? false)
      if (parsed.saleStart) setSaleStart(parsed.saleStart)
      if (parsed.saleEnd) setSaleEnd(parsed.saleEnd)
      setNonConsumeDateMode(parsed.nonConsumeDateMode ?? 'all_dates')
      setNonConsumeWeekdays(parsed.nonConsumeWeekdays ?? [])
      setNonConsumeHolidays(parsed.nonConsumeHolidays ?? [])
      setNonConsumeSpecificDates(parsed.nonConsumeSpecificDates ?? [])
      setDailyAllDay(parsed.dailyAllDay ?? true)
      setDailyTimePeriods(parsed.dailyTimePeriods ?? [{ start: '09:00', end: '22:00' }])
      setPurchaseLimitMode(parsed.purchaseLimitMode ?? 'none')
      setPurchaseLimitPerPerson(parsed.purchaseLimitPerPerson ?? 0)
      setPurchaseLimitPerDay(parsed.purchaseLimitPerDay ?? 0)
      setVoucherUseLimit(parsed.voucherUseLimit ?? true)
      setVoucherUseMax(parsed.voucherUseMax ?? 1)
      setStockQty(String(d.sales_info?.stock_qty ?? 999))
      setStep('detail')
    })()
    return () => {
      cancelled = true
    }
  }, [isEdit, editProductId, tree])

  useEffect(() => {
    if (!cat1 || loading) return
    let cancelled = false
    void fetchDouyinGoodsCategoryChildren(cat1).then((kids) => {
      if (cancelled || kids.length === 0) return
      setTree((prev) => mergeDouyinCategoryChildrenIntoTree(prev, cat1, kids))
    })
    return () => {
      cancelled = true
    }
  }, [cat1, loading])

  useEffect(() => {
    if (!cat2 || loading) return
    let cancelled = false
    setCatSubtreeLoading(cat2)
    void fetchDouyinGoodsCategoryChildren(cat2).then((kids) => {
      if (cancelled) return
      setCatSubtreeLoading(null)
      if (kids.length > 0) {
        setTree((prev) => mergeDouyinCategoryChildrenIntoTree(prev, cat2, kids))
      }
    })
    return () => {
      cancelled = true
      setCatSubtreeLoading(null)
    }
  }, [cat2, loading])

  /** 部分行业仅两级类目：二级即为末级时自动选中 */
  useEffect(() => {
    if (!cat2 || loading || catSubtreeLoading === cat2) return
    const opts = pickerLevel3Options(tree, cat2, uploadableLeaves)
    if (opts.length === 1 && opts[0]?.category_id === cat2) {
      setCat3(cat2)
    }
  }, [cat2, tree, uploadableLeaves, loading, catSubtreeLoading])

  useEffect(() => {
    if (!cat3) return
    let cancelled = false
    setTypesLoading(true)
    void getDouyinProductTypesForCategory(cat3).then((r) => {
      if (cancelled) return
      setTypesLoading(false)
      if (r.ok) {
        setProductTypes(r.types)
        const curOk =
          productType != null &&
          r.types.some((t) => t.product_type === productType && t.eligible)
        if (!curOk) {
          const first = r.types.find((t) => t.eligible)
          setProductType(first ? first.product_type : null)
        }
      }
    })
    return () => {
      cancelled = true
    }
  }, [cat3, productType])

  const onPickImage = useCallback(
    async (file: File, slot: 'head' | 'aux' | 'env', index = 0) => {
      setUploading(true)
      const r = await uploadDouyinProductImage(file)
      setUploading(false)
      if (!r.ok) {
        setActionMsg({ text: r.message, ok: false })
        return
      }
      if (slot === 'head') setHeadUrl(r.url)
      else if (slot === 'aux') {
        setAuxUrls((prev) => {
          const next = [...prev]
          while (next.length <= index) next.push('')
          next[index] = r.url
          return next
        })
      } else {
        setEnvUrls((prev) => {
          const next = [...prev]
          while (next.length <= index) next.push('')
          next[index] = r.url
          return next
        })
      }
    },
    [],
  )

  const buildPayload = useCallback((): DouyinProductDetailPayload | null => {
    const cat = cat3.trim()
    const name = productName.trim()
    const price = Number.parseFloat(priceYuan)
    if (!cat || productType == null || !name || !Number.isFinite(price) || price <= 0) return null
    const head = headUrl.trim()
    if (!/^https?:\/\//i.test(head)) return null

    const origin = Number.parseFloat(originYuan) || price

    const out_id =
      stableOutIdRef.current?.trim() ||
      `erp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    stableOutIdRef.current = out_id

    const sessionAccountName = readAccountName()
    const descForSave = composeProductDescWithRules(productDesc)

    return {
      ...(persistedProductIdRef.current ? { product_id: persistedProductIdRef.current } : {}),
      out_id,
      category_id: cat,
      product_type: productType,
      ...(sessionAccountName ? { account_name: sessionAccountName } : {}),
      product_name: name,
      product_desc: descForSave.trim() || undefined,
      price_yuan: price,
      origin_price_yuan: origin,
      head_image_urls: [head],
      aux_image_urls: auxUrls.map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u)),
      env_image_urls: envUrls.map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u)),
      poi_ids: selectedPoiIds,
      package_combo:
        productType === 1
          ? packageComboFromFormGroups(comboGroups, { productName: name, priceYuan: price })
          : undefined,
      sales_info: {
        channel: salesChannel,
        staff_sales: false,
        stock_limited: false,
        stock_qty: Number.parseInt(stockQty, 10) || 999,
        sale_time_limited: saleTimeLimited,
        ...(saleTimeLimited && saleStart ? { sale_start: saleStart } : {}),
        ...(saleTimeLimited && saleEnd ? { sale_end: saleEnd } : {}),
      },
      trade_rules: {
        consume_date_mode: 'days',
        consume_valid_days: Number.parseInt(consumeValidDays, 10) || 360,
        non_consume_date_mode: nonConsumeDateMode,
        ...(nonConsumeDateMode === 'partial_dates'
          ? {
              non_consume_weekdays: nonConsumeWeekdays,
              non_consume_holidays: nonConsumeHolidays,
              non_consume_specific_dates: nonConsumeSpecificDates,
            }
          : {}),
        daily_consume_mode: dailyAllDay ? 'all_day' : 'time_slots',
        daily_time_periods: dailyAllDay ? undefined : dailyTimePeriods,
        daily_all_day: dailyAllDay,
        customer_purchase_limit_mode: purchaseLimitMode,
        ...(purchaseLimitMode === 'limited'
          ? {
              customer_purchase_limit_max: purchaseLimitPerPerson || undefined,
              customer_purchase_limit_per_day: purchaseLimitPerDay || undefined,
            }
          : {}),
        after_sale_policy: afterSalePolicy,
        reserve_mode: reserveMode,
        reserve_advance_value: reserveMode === 'required' ? reserveAdvanceDays : undefined,
        reserve_advance_unit: 'day',
        reserve_channel: 'phone',
        coupon_type: 'douyin',
      },
      consume_rules: {
        in_store_discount: false,
        extra_fee: false,
        voucher_limit: voucherUseLimit,
        voucher_max: voucherUseLimit ? Math.max(1, voucherUseMax) : undefined,
        people_limit: false,
      },
    }
  }, [
    afterSalePolicy,
    auxUrls,
    buildFormRules,
    cat3,
    consumeValidDays,
    dailyAllDay,
    dailyTimePeriods,
    envUrls,
    headUrl,
    comboGroups,
    nonConsumeDateMode,
    nonConsumeHolidays,
    nonConsumeSpecificDates,
    nonConsumeWeekdays,
    originYuan,
    priceYuan,
    productDesc,
    productName,
    productType,
    purchaseLimitMode,
    purchaseLimitPerDay,
    purchaseLimitPerPerson,
    reserveAdvanceDays,
    reserveMode,
    saleEnd,
    saleStart,
    saleTimeLimited,
    salesChannel,
    selectedPoiIds,
    stockQty,
    voucherUseLimit,
    voucherUseMax,
  ])

  const handleSave = async (mode: 'draft' | 'submit') => {
    setActionMsg(null)
    const detail = buildPayload()
    if (!detail) {
      setActionMsg({
        text: '请完善：三级类目、商品类型、名称、售价、头图(https)、至少一个适用门店',
        ok: false,
      })
      return
    }
    if (detail.poi_ids.length === 0) {
      setActionMsg({ text: '请至少选择一个适用门店', ok: false })
      return
    }
    if (mode === 'submit') {
      const descCheck = normalizeDouyinDescription(
        detail.product_desc ?? '',
        detail.product_name,
        undefined,
        undefined,
        detail.category_id,
      )
      if (descCheck.length < 4 && !detail.product_desc?.trim()) {
        setActionMsg({
          text: '建议填写商品说明（写入 description_rich_text 富文本；顶层短描述自动生成）',
          ok: false,
        })
        return
      }
    }

    const storeLabel =
      selectedPoiNames.length > 0 ? selectedPoiNames.join('、') : '—'

    let draftRowId = ''
    if (mode === 'draft') {
      draftRowId =
        (persistedProductIdRef.current && persistedProductIdRef.current.trim()) ||
        String(detail.out_id ?? '').trim() ||
        newDraftRowId()
    }

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

    setSaving(true)
    let r: Awaited<ReturnType<typeof postDouyinGoodsProductSave>>
    try {
      r = await postDouyinGoodsProductSave({ mode, detail })
    } catch (e) {
      r = {
        ok: false,
        message: `保存请求异常：${e instanceof Error ? e.message : String(e)}`,
      }
    }
    setSaving(false)

    if (!r.ok) {
      setActionMsg({ text: r.message, ok: false })
      return
    }

    const finalPid =
      (r.product_id && String(r.product_id).trim()) ||
      (mode === 'draft' ? draftRowId : String(detail.out_id ?? '').trim())

    if (mode === 'draft') {
      if (finalPid && finalPid !== draftRowId) {
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
      const listId =
        finalPid || String(detail.out_id ?? '').trim() || persistedProductIdRef.current?.trim() || newDraftRowId()
      upsertProductEditLibraryDraft({
        id: listId,
        name: detail.product_name,
        platform: '抖音来客',
        store: storeLabel,
        status: '审核中',
        price: detail.price_yuan,
        platformApi: 'douyin',
      })
      if (!finalPid) persistedProductIdRef.current = listId
    }

    if (finalPid) {
      persistedProductIdRef.current = finalPid
      saveDraftDetailSnapshot(finalPid, { ...detail, product_id: finalPid })
    }

    setActionMsg({
      text:
        r.message ??
        (mode === 'submit'
          ? `已提交审核，商品已加入列表。编号：${finalPid || '-'}`
          : `草稿已保存并同步至商品列表。编号：${finalPid || '-'}`),
      ok: true,
    })
    if (mode === 'submit') {
      setTimeout(() => navigate('/products/list'), 800)
    }
  }

  const goDetail = async () => {
    if (!cat3 || productType == null) return
    setActionMsg(null)
    setDetailPrepLoading(true)
    const typeEligible = productTypes.some(
      (t) => t.product_type === productType && t.eligible,
    )
    try {
      const tpl = await getDouyinGoodsTemplate({
        category_id: cat3,
        product_type: productType,
        /** 来客侧可选但 template.get 常无 attrs（零售代金券）；保存由网关按 template/synthetic 组装 */
        allowEmptyTemplate: typeEligible,
      })
      setDetailPrepLoading(false)
      if (!tpl.ok) {
        if (typeEligible) {
          setStep('detail')
          setActionMsg({
            text: '模板预检未通过，仍可填写商品；提交时由服务端按来客规则组装字段。',
            ok: true,
          })
          return
        }
        setActionMsg({ text: tpl.message, ok: false })
        return
      }
      setStep('detail')
    } catch (e) {
      setDetailPrepLoading(false)
      if (typeEligible) {
        setStep('detail')
        setActionMsg({
          text: '模板接口暂不可用，已允许继续填写；提交时由服务端组装。',
          ok: true,
        })
        return
      }
      setActionMsg({
        text: e instanceof Error ? e.message : String(e),
        ok: false,
      })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        加载类目与配置…
      </div>
    )
  }

  if (loadErr) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {loadErr}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(['category', 'productType', 'detail'] as Step[]).map((s, i) => (
          <span
            key={s}
            className={cn(
              'rounded-full px-3 py-1',
              step === s ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600',
            )}
          >
            {i + 1}. {s === 'category' ? '类目' : s === 'productType' ? '类型' : '商品信息'}
          </span>
        ))}
      </div>

      {step === 'category' && (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold">选择发品类目</h2>
          <p className="text-sm text-gray-500">
            须选至末级类目（部分行业仅两级，选完二级后会自动带出末级）。数据来自抖音{' '}
            <code className="text-xs">goodlife/v1/goods/category/get</code>。
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <select
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={cat1}
              onChange={(e) => {
                setCat1(e.target.value)
                setCat2('')
                setCat3('')
              }}
            >
              <option value="">一级类目</option>
              {pickerChildrenOf(tree, null).map((n) => (
                <option key={n.category_id} value={n.category_id}>
                  {n.name}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={cat2}
              disabled={!cat1}
              onChange={(e) => {
                setCat2(e.target.value)
                setCat3('')
              }}
            >
              <option value="">二级类目</option>
              {pickerChildrenOf(tree, cat1 || null).map((n) => (
                <option key={n.category_id} value={n.category_id}>
                  {n.name}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={cat3}
              disabled={!cat2}
              onChange={(e) => setCat3(e.target.value)}
            >
              <option value="">
                {catSubtreeLoading === cat2 ? '加载末级类目…' : '末级类目'}
              </option>
              {l3Options.map((n) => {
                const ok = pickerLeafSelectable(n.category_id, n, uploadableLeaves)
                return (
                  <option key={n.category_id} value={n.category_id} disabled={!ok}>
                    {n.name}
                    {n.category_id === cat2 && l3Options.length === 1 ? '（本级为末级）' : ''}
                    {!ok ? '（不可发品）' : ''}
                  </option>
                )
              })}
            </select>
          </div>
          {cat3 && cat3Node && (
            <p className="text-sm text-gray-600">
              已选：<span className="font-medium text-gray-900">{categoryPathLabel}</span>
            </p>
          )}
          <button
            type="button"
            disabled={!cat3 || !pickerLeafSelectable(cat3, cat3Node!, uploadableLeaves)}
            onClick={() => setStep('productType')}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white disabled:bg-gray-300"
          >
            下一步：商品类型
          </button>
        </section>
      )}

      {step === 'productType' && (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <button type="button" className="text-sm text-indigo-600" onClick={() => setStep('category')}>
            <ChevronLeft className="inline h-4 w-4" /> 返回类目
          </button>
          <h2 className="text-lg font-semibold">商品类型</h2>
          <p className="text-sm text-gray-500">{categoryPathLabel}</p>
          {typesLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          ) : (
            <div className="flex flex-wrap gap-2">
              {productTypes.map((t) => (
                <button
                  key={t.product_type}
                  type="button"
                  disabled={!t.eligible}
                  onClick={() => setProductType(t.product_type)}
                  className={cn(
                    'rounded-lg border px-4 py-2 text-sm',
                    productType === t.product_type
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-800'
                      : 'border-gray-200',
                    !t.eligible && 'opacity-40',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          {actionMsg && !actionMsg.ok && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {actionMsg.text}
            </p>
          )}
          <button
            type="button"
            disabled={productType == null || detailPrepLoading}
            onClick={() => void goDetail()}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white disabled:bg-gray-300"
          >
            {detailPrepLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            下一步：填写商品
          </button>
        </section>
      )}

      {step === 'detail' && (
        <DouyinProductWizardDetail
          isEdit={isEdit}
          productType={productType}
          productName={productName}
          setProductName={setProductName}
          productDesc={productDesc}
          setProductDesc={setProductDesc}
          priceYuan={priceYuan}
          setPriceYuan={setPriceYuan}
          originYuan={originYuan}
          setOriginYuan={setOriginYuan}
          headUrl={headUrl}
          setHeadUrl={setHeadUrl}
          auxUrls={auxUrls}
          goodsContext={{
            goods_category_id: cat3.trim() || undefined,
            goods_product_type: productType ?? undefined,
            goods_category_path_zh: categoryPathLabel || undefined,
            goods_product_type_label:
              productTypes.find((t) => t.product_type === productType)?.label ?? undefined,
          }}
          setAuxUrls={setAuxUrls}
          envUrls={envUrls}
          setEnvUrls={setEnvUrls}
          comboGroups={comboGroups}
          setComboGroups={setComboGroups}
          salesChannel={salesChannel}
          setSalesChannel={setSalesChannel}
          saleTimeLimited={saleTimeLimited}
          setSaleTimeLimited={setSaleTimeLimited}
          saleStart={saleStart}
          saleEnd={saleEnd}
          setSalePeriod={(start, end) => {
            setSaleStart(start)
            setSaleEnd(end)
          }}
          consumeValidDays={consumeValidDays}
          setConsumeValidDays={setConsumeValidDays}
          nonConsumeDateMode={nonConsumeDateMode}
          setNonConsumeDateMode={setNonConsumeDateMode}
          nonConsumeWeekdays={nonConsumeWeekdays}
          nonConsumeHolidays={nonConsumeHolidays}
          nonConsumeSpecificDates={nonConsumeSpecificDates}
          setNonConsumePartial={(w, h, d) => {
            setNonConsumeWeekdays(w)
            setNonConsumeHolidays(h)
            setNonConsumeSpecificDates(d)
          }}
          dailyAllDay={dailyAllDay}
          setDailyAllDay={setDailyAllDay}
          dailyTimePeriods={dailyTimePeriods}
          setDailyTimePeriods={setDailyTimePeriods}
          purchaseLimitMode={purchaseLimitMode}
          setPurchaseLimitMode={setPurchaseLimitMode}
          purchaseLimitPerPerson={purchaseLimitPerPerson}
          purchaseLimitPerDay={purchaseLimitPerDay}
          setPurchaseLimits={(perPerson, perDay) => {
            setPurchaseLimitPerPerson(perPerson)
            setPurchaseLimitPerDay(perDay)
          }}
          reserveMode={reserveMode}
          setReserveMode={setReserveMode}
          reserveAdvanceDays={reserveAdvanceDays}
          setReserveAdvanceDays={setReserveAdvanceDays}
          voucherUseLimit={voucherUseLimit}
          setVoucherUseLimit={setVoucherUseLimit}
          voucherUseMax={voucherUseMax}
          setVoucherUseMax={setVoucherUseMax}
          afterSalePolicy={afterSalePolicy}
          setAfterSalePolicy={setAfterSalePolicy}
          selectedPoiIds={selectedPoiIds}
          selectedPoiNames={selectedPoiNames}
          storeModalOpen={storeModalOpen}
          setStoreModalOpen={setStoreModalOpen}
          onPoiConfirm={(ids, names) => {
            setSelectedPoiIds(ids)
            setSelectedPoiNames(names)
            setStoreModalOpen(false)
          }}
          uploading={uploading}
          onPickImage={onPickImage}
          saving={saving}
          actionMsg={actionMsg}
          onSaveDraft={() => void handleSave('draft')}
          onSubmit={() => void handleSave('submit')}
          onBackType={() => setStep('productType')}
        />
      )}
    </div>
  )
}

