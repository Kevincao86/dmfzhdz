/**
 * 抖音来客创建/编辑商品（按官方 template.get + product/save 流程重建）。
 * 开放平台 attr 由服务端网关按模板自动组装，不在此页手填 SubTitle/Description 等易错字段。
 */
import { ChevronLeft, Loader2, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DouyinStorePickerModal from '../../components/store/DouyinStorePickerModal'
import { cn } from '../../cn'
import { readMerchantSession } from '../../lib/merchantSession'
import {
  loadDouyinGoodsCategoryTreeForPicker,
  pickerChildrenOf,
  pickerLeafSelectable,
  pickerLabelsForPath,
  pickerPathIdsToLeaf,
} from '../../lib/douyinGoodsCategoryPicker'
import { normalizeDouyinDescription } from '../../lib/douyinDescriptionNormalize'
import { loadDraftDetailSnapshot, saveDraftDetailSnapshot } from '../../lib/productDraftSnapshot'
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
  const [uploadableLeaves, setUploadableLeaves] = useState<Set<string>>(new Set())

  const [cat1, setCat1] = useState('')
  const [cat2, setCat2] = useState('')
  const [cat3, setCat3] = useState('')

  const [productTypes, setProductTypes] = useState<ProductTypeOption[]>([])
  const [productType, setProductType] = useState<number | null>(null)
  const [typesLoading, setTypesLoading] = useState(false)

  const [productName, setProductName] = useState('')
  const [productDesc, setProductDesc] = useState('')
  const [priceYuan, setPriceYuan] = useState('')
  const [originYuan, setOriginYuan] = useState('')
  const [headUrl, setHeadUrl] = useState('')
  const [auxUrls, setAuxUrls] = useState<string[]>([''])
  const [itemName, setItemName] = useState('')
  const [itemPriceYuan, setItemPriceYuan] = useState('')

  const [selectedPoiIds, setSelectedPoiIds] = useState<string[]>([])
  const [selectedPoiNames, setSelectedPoiNames] = useState<string[]>([])
  const [storeModalOpen, setStoreModalOpen] = useState(false)

  const [afterSalePolicy, setAfterSalePolicy] = useState('refund_anytime')
  const [reserveMode, setReserveMode] = useState<'none' | 'required'>('none')
  const [consumeValidDays, setConsumeValidDays] = useState('360')
  const [salesChannel, setSalesChannel] = useState('unlimited')
  const [stockQty, setStockQty] = useState('999')

  const [saving, setSaving] = useState(false)
  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [detailPrepLoading, setDetailPrepLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  const persistedProductIdRef = useRef<string | null>(editProductId?.trim() ?? null)
  const stableOutIdRef = useRef<string | null>(null)
  const headFileRef = useRef<HTMLInputElement>(null)

  const cat3Node = useMemo(() => {
    if (!cat3) return null
    const path = pickerPathIdsToLeaf(tree, cat3)
    let nodes = tree
    let node: DouyinCategoryTreeNode | undefined
    for (const id of path) {
      node = nodes.find((n) => n.category_id === id)
      nodes = node?.sub_tree_infos ?? []
    }
    return node ?? null
  }, [tree, cat3])

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
      setUploadableLeaves(r.uploadableLeafIds)
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
      setSelectedPoiIds(d.poi_ids ?? [])
      const g0 = d.package_combo?.groups?.[0]
      const it0 = g0?.items?.[0]
      if (it0?.name) setItemName(String(it0.name))
      if (it0?.origin_price_yuan != null) {
        setItemPriceYuan(String(Number(it0.origin_price_yuan) || ''))
      }
      setAfterSalePolicy(String(d.trade_rules?.after_sale_policy ?? 'refund_anytime'))
      setReserveMode(d.trade_rules?.reserve_mode === 'required' ? 'required' : 'none')
      setConsumeValidDays(String(d.trade_rules?.consume_valid_days ?? 360))
      setSalesChannel(String(d.sales_info?.channel ?? 'unlimited'))
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
    void fetchDouyinGoodsCategoryChildren(cat2).then((kids) => {
      if (cancelled || kids.length === 0) return
      setTree((prev) => mergeDouyinCategoryChildrenIntoTree(prev, cat2, kids))
    })
    return () => {
      cancelled = true
    }
  }, [cat2, loading])

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

  const onPickImage = useCallback(async (file: File, slot: 'head' | 'aux', index = 0) => {
    setUploading(true)
    const r = await uploadDouyinProductImage(file)
    setUploading(false)
    if (!r.ok) {
      setActionMsg({ text: r.message, ok: false })
      return
    }
    if (slot === 'head') setHeadUrl(r.url)
    else {
      setAuxUrls((prev) => {
        const next = [...prev]
        while (next.length <= index) next.push('')
        next[index] = r.url
        return next
      })
    }
  }, [])

  const buildPayload = useCallback((): DouyinProductDetailPayload | null => {
    const cat = cat3.trim()
    const name = productName.trim()
    const price = Number.parseFloat(priceYuan)
    if (!cat || productType == null || !name || !Number.isFinite(price) || price <= 0) return null
    const head = headUrl.trim()
    if (!/^https?:\/\//i.test(head)) return null

    const comboName = (itemName.trim() || name).slice(0, 30)
    const comboPrice = Number.parseFloat(itemPriceYuan) || price
    const origin = Number.parseFloat(originYuan) || comboPrice

    const out_id =
      stableOutIdRef.current?.trim() ||
      `erp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    stableOutIdRef.current = out_id

    const sessionAccountName = readAccountName()

    return {
      ...(persistedProductIdRef.current ? { product_id: persistedProductIdRef.current } : {}),
      out_id,
      category_id: cat,
      product_type: productType,
      ...(sessionAccountName ? { account_name: sessionAccountName } : {}),
      product_name: name,
      product_desc: productDesc.trim() || undefined,
      price_yuan: price,
      origin_price_yuan: origin,
      head_image_urls: [head],
      aux_image_urls: auxUrls.map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u)),
      env_image_urls: [],
      poi_ids: selectedPoiIds,
      package_combo:
        productType === 1
          ? {
              groups: [
                {
                  pick_rule: '全部必选',
                  items: [
                    {
                      name: comboName,
                      quantity: 1,
                      origin_price_yuan: comboPrice,
                    },
                  ],
                },
              ],
            }
          : undefined,
      sales_info: {
        channel: salesChannel,
        staff_sales: false,
        stock_limited: false,
        stock_qty: Number.parseInt(stockQty, 10) || 999,
        sale_time_limited: false,
      },
      trade_rules: {
        consume_date_mode: 'days',
        consume_valid_days: Number.parseInt(consumeValidDays, 10) || 360,
        non_consume_date_mode: 'all_dates',
        daily_consume_mode: 'all_day',
        customer_purchase_limit_mode: 'none',
        after_sale_policy: afterSalePolicy,
        reserve_mode: reserveMode,
        reserve_advance_value: reserveMode === 'required' ? 1 : undefined,
        reserve_advance_unit: 'day',
        reserve_channel: 'phone',
        daily_all_day: true,
        coupon_type: 'douyin',
      },
      consume_rules: {
        in_store_discount: false,
        extra_fee: false,
        voucher_limit: true,
        voucher_max: 1,
        people_limit: false,
      },
    }
  }, [
    afterSalePolicy,
    auxUrls,
    cat3,
    consumeValidDays,
    headUrl,
    itemName,
    itemPriceYuan,
    originYuan,
    priceYuan,
    productDesc,
    productName,
    productType,
    reserveMode,
    salesChannel,
    selectedPoiIds,
    stockQty,
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

    setSaving(true)
    const r = await postDouyinGoodsProductSave({ mode, detail })
    setSaving(false)
    if (!r.ok) {
      setActionMsg({ text: r.message, ok: false })
      return
    }
    const finalPid = r.product_id?.trim() || persistedProductIdRef.current?.trim()
    if (finalPid) {
      persistedProductIdRef.current = finalPid
      saveDraftDetailSnapshot(finalPid, { ...detail, product_id: finalPid })
    }
    setActionMsg({
      text: mode === 'submit' ? '已提交审核，请到来客后台查看审核状态' : '草稿已保存',
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
    const tpl = await getDouyinGoodsTemplate({
      category_id: cat3,
      product_type: productType,
      /** 来客侧可选但 template.get 常无 attrs（零售代金券）；保存由网关按 template/synthetic 组装 */
      allowEmptyTemplate: typeEligible,
    })
    setDetailPrepLoading(false)
    if (!tpl.ok) {
      setActionMsg({ text: tpl.message, ok: false })
      return
    }
    setStep('detail')
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
          <h2 className="text-lg font-semibold">选择三级类目</h2>
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
              <option value="">三级类目（末级）</option>
              {pickerChildrenOf(tree, cat2 || null).map((n) => {
                const ok = pickerLeafSelectable(n.category_id, n, uploadableLeaves)
                return (
                  <option key={n.category_id} value={n.category_id} disabled={!ok}>
                    {n.name}
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
        <section className="space-y-4">
          {!isEdit && (
            <button type="button" className="text-sm text-indigo-600" onClick={() => setStep('productType')}>
              <ChevronLeft className="inline h-4 w-4" /> 返回类型
            </button>
          )}

          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            开放平台字段（SubTitle、description_rich_text、图片列表、use_date 等）由服务端按{' '}
            <strong>template.get</strong> 自动写入。SubTitle 为「随时退|免预约」等政策标签，请勿在此页手填副标题。
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
              <h3 className="font-semibold text-gray-900">基础信息</h3>
              <label className="block text-sm">
                <span className="font-medium">商品名称 *</span>
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">商品说明（用于短描述/详情）</span>
                <textarea
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  rows={3}
                  value={productDesc}
                  onChange={(e) => setProductDesc(e.target.value)}
                  placeholder="欢迎到店体验，详询门店。勿只填商品名。"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="font-medium">售价（元）*</span>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                    value={priceYuan}
                    onChange={(e) => setPriceYuan(e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">划线价（元）</span>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                    value={originYuan}
                    onChange={(e) => setOriginYuan(e.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
              <h3 className="font-semibold text-gray-900">图片</h3>
              <div>
                <span className="text-sm font-medium">头图 *</span>
                <div className="mt-2 flex items-center gap-3">
                  {headUrl ? (
                    <img src={headUrl} alt="" className="h-20 w-20 rounded-lg object-cover border" />
                  ) : null}
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => headFileRef.current?.click()}
                    className="inline-flex items-center rounded-lg border px-3 py-2 text-sm"
                  >
                    <Upload className="mr-1 h-4 w-4" />
                    上传头图
                  </button>
                  <input
                    ref={headFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void onPickImage(f, 'head')
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {productType === 1 && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
              <h3 className="font-semibold">团购单品（套餐组）</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm block">
                  单品名称
                  <input
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="如：沐浴露"
                  />
                </label>
                <label className="text-sm block">
                  单品标价（元）
                  <input
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                    value={itemPriceYuan}
                    onChange={(e) => setItemPriceYuan(e.target.value)}
                  />
                </label>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="font-semibold">售卖与规则</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm block">
                售后政策
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={afterSalePolicy}
                  onChange={(e) => setAfterSalePolicy(e.target.value)}
                >
                  <option value="refund_anytime">随时退</option>
                  <option value="refund_auto_expire">过期退</option>
                  <option value="no_refund">不可退</option>
                </select>
              </label>
              <label className="text-sm block">
                预约
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={reserveMode}
                  onChange={(e) => setReserveMode(e.target.value as 'none' | 'required')}
                >
                  <option value="none">免预约</option>
                  <option value="required">需提前预约</option>
                </select>
              </label>
              <label className="text-sm block">
                有效天数
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={consumeValidDays}
                  onChange={(e) => setConsumeValidDays(e.target.value)}
                />
              </label>
            </div>
            <div>
              <button
                type="button"
                onClick={() => setStoreModalOpen(true)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              >
                选择适用门店（已选 {selectedPoiIds.length} 个）
              </button>
              {selectedPoiNames.length > 0 && (
                <p className="mt-2 text-xs text-gray-500">{selectedPoiNames.join('、')}</p>
              )}
            </div>
          </div>

          {actionMsg && (
            <p
              className={cn(
                'rounded-lg border px-3 py-2 text-sm',
                actionMsg.ok
                  ? 'border-green-200 bg-green-50 text-green-900'
                  : 'border-amber-200 bg-amber-50 text-amber-900',
              )}
            >
              {actionMsg.text}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave('draft')}
              className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm"
            >
              保存草稿
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave('submit')}
              className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white disabled:bg-gray-400"
            >
              {saving ? '提交中…' : '提交审核'}
            </button>
          </div>
        </section>
      )}

      <DouyinStorePickerModal
        open={storeModalOpen}
        onClose={() => setStoreModalOpen(false)}
        initialPoiIds={selectedPoiIds}
        onConfirm={(ids, rows) => {
          setSelectedPoiIds(ids)
          setSelectedPoiNames(rows.map((r) => r.name))
          setStoreModalOpen(false)
        }}
      />
    </div>
  )
}

