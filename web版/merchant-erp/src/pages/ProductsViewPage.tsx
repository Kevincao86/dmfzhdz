import { ArrowLeft, ArrowUpDown, ExternalLink, Loader2, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  PRODUCT_CREATE_PLATFORMS,
  type CreatePlatformId,
  createPlatformLabel,
} from '../constants/productCreatePlatforms'
import { cn } from '../cn'
import {
  deleteProductEditLibraryDraft,
  loadProductEditLibrary,
  updateProductEditLibraryRow,
  type ProductEditLibraryRow,
} from '../lib/productEditLibrary'
import { loadDraftDetailSnapshot, removeDraftDetailSnapshot, saveDraftDetailSnapshot } from '../lib/productDraftSnapshot'
import { douyinPoiIdsMatch } from '../lib/douyinReviewSyncHelpers'
import { DouyinStorePickerTrigger } from '../components/store/DouyinStorePickerModal'
import { KuaishouStorePickerTrigger } from '../components/store/KuaishouStorePickerModal'
import {
  type MerchantProductListItem,
  fetchMerchantProductList,
  postMerchantProductShelfOperate,
  pullMerchantProductFromPlatform,
  syncAllMerchantProductsFromPlatforms,
} from '../services/productListingApi'

const GROUPBUY_GOODS_PLATFORMS = new Set<CreatePlatformId>(['douyin', 'kuaishou'])

function isGroupbuyGoodsPlatform(plat: CreatePlatformId): boolean {
  return GROUPBUY_GOODS_PLATFORMS.has(plat)
}

type ListRow = MerchantProductListItem & { origin: 'api' | 'library' }

function productMatchesPoiFilter(row: ListRow, filterPoiId: string | null): boolean {
  if (!filterPoiId) return true
  if (row.poiIds?.some((id) => douyinPoiIdsMatch(id, filterPoiId))) return true
  return douyinPoiIdsMatch(row.store, filterPoiId)
}

type OriginFilter = '全部' | 'API' | '本地草稿'

const ALL_FILTER = '全部'

function libToRow(r: ProductEditLibraryRow, plat: CreatePlatformId): ListRow | null {
  const api = r.platformApi ?? 'douyin'
  if (api !== plat) return null
  const auditStatus = r.status
  return {
    id: r.id,
    name: r.name,
    price: r.price,
    store: r.store,
    status: auditStatus,
    auditStatus,
    saleStatus: '未上架',
    platform: r.platform,
    origin: 'library',
  }
}

export default function ProductsViewPage() {
  const [activePlat, setActivePlat] = useState<CreatePlatformId>('douyin')
  const [libraryTick, setLibraryTick] = useState(0)
  const [apiItems, setApiItems] = useState<MerchantProductListItem[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listErr, setListErr] = useState<string | null>(null)
  const [listNote, setListNote] = useState<string | null>(null)

  const [filterOrigin, setFilterOrigin] = useState<OriginFilter>(ALL_FILTER)
  const [filterAuditStatus, setFilterAuditStatus] = useState(ALL_FILTER)
  const [filterSaleStatus, setFilterSaleStatus] = useState(ALL_FILTER)
  const [filterStore, setFilterStore] = useState(ALL_FILTER)
  const [filterPoiId, setFilterPoiId] = useState<string | null>(null)
  const [filterPoiName, setFilterPoiName] = useState('')
  const [keyword, setKeyword] = useState('')

  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [bulkSyncing, setBulkSyncing] = useState(false)
  const [syncToast, setSyncToast] = useState<string | null>(null)
  const [shelfConfirm, setShelfConfirm] = useState<{
    id: string
    name: string
    goOnline: boolean
  } | null>(null)
  const [shelfBusy, setShelfBusy] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [priceEditId, setPriceEditId] = useState<string | null>(null)
  const [priceEditValue, setPriceEditValue] = useState('')

  const refreshLibrary = useCallback(() => setLibraryTick((n) => n + 1), [])

  useEffect(() => {
    refreshLibrary()
    const on = () => refreshLibrary()
    window.addEventListener('meoo-product-edit-library-changed', on)
    return () => window.removeEventListener('meoo-product-edit-library-changed', on)
  }, [refreshLibrary])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setListLoading(true)
      setListErr(null)
      setListNote(null)
      const r = await fetchMerchantProductList(activePlat, { page: 1, pageSize: 50 })
      if (cancelled) return
      setListLoading(false)
      if (r.ok) {
        setApiItems(r.items)
        setListNote(r.message ?? null)
      } else {
        setApiItems([])
        setListErr(r.message)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [activePlat])

  useEffect(() => {
    setFilterOrigin(ALL_FILTER)
    setFilterAuditStatus(ALL_FILTER)
    setFilterSaleStatus(ALL_FILTER)
    setFilterStore(ALL_FILTER)
    setFilterPoiId(null)
    setFilterPoiName('')
    setKeyword('')
  }, [activePlat])

  const mergedRows = useMemo(() => {
    const libRows = loadProductEditLibrary()
      .map((r) => libToRow(r, activePlat))
      .filter(Boolean) as ListRow[]
    const map = new Map<string, ListRow>()
    for (const a of apiItems) {
      map.set(a.id, { ...a, origin: 'api' })
    }
    for (const l of libRows) {
      if (!map.has(l.id)) map.set(l.id, l)
    }
    return Array.from(map.values())
  }, [apiItems, activePlat, libraryTick])

  const auditStatusOptions = useMemo(
    () => [
      ALL_FILTER,
      ...Array.from(new Set(mergedRows.map((r) => r.auditStatus || r.status).filter(Boolean))),
    ],
    [mergedRows],
  )

  const saleStatusOptions = useMemo(
    () => [
      ALL_FILTER,
      ...Array.from(new Set(mergedRows.map((r) => r.saleStatus).filter(Boolean))),
    ],
    [mergedRows],
  )

  const storeOptions = useMemo(() => {
    if (isGroupbuyGoodsPlatform(activePlat)) return [ALL_FILTER]
    const stores = mergedRows
      .map((r) => r.store.trim())
      .filter((s) => s && s !== '—' && !/^\d+\s*家门店$/.test(s))
    return [ALL_FILTER, ...Array.from(new Set(stores))]
  }, [mergedRows, activePlat])

  const filtersActive =
    filterOrigin !== ALL_FILTER ||
    filterAuditStatus !== ALL_FILTER ||
    filterSaleStatus !== ALL_FILTER ||
    filterStore !== ALL_FILTER ||
    filterPoiId != null ||
    keyword.trim() !== ''

  const filtered = useMemo(() => {
    const kw = keyword.trim()
    return mergedRows.filter((r) => {
      if (filterOrigin === 'API' && r.origin !== 'api') return false
      if (filterOrigin === '本地草稿' && r.origin !== 'library') return false
      if (filterAuditStatus !== ALL_FILTER && (r.auditStatus || r.status) !== filterAuditStatus)
        return false
      if (filterSaleStatus !== ALL_FILTER && r.saleStatus !== filterSaleStatus) return false
      if (isGroupbuyGoodsPlatform(activePlat)) {
        if (!productMatchesPoiFilter(r, filterPoiId)) return false
      } else if (filterStore !== ALL_FILTER && r.store !== filterStore) {
        return false
      }
      if (kw && !r.name.includes(kw)) return false
      return true
    })
  }, [mergedRows, filterOrigin, filterAuditStatus, filterSaleStatus, filterStore, filterPoiId, activePlat, keyword])

  const resetFilters = () => {
    setFilterOrigin(ALL_FILTER)
    setFilterAuditStatus(ALL_FILTER)
    setFilterSaleStatus(ALL_FILTER)
    setFilterStore(ALL_FILTER)
    setFilterPoiId(null)
    setFilterPoiName('')
    setKeyword('')
  }

  const applyLocalPrice = (id: string, price: number) => {
    if (!Number.isFinite(price) || price <= 0) return
    updateProductEditLibraryRow(id, { price: Math.round(price) })
    const snap = loadDraftDetailSnapshot(id)
    if (snap) {
      saveDraftDetailSnapshot(id, { ...snap, price_yuan: price })
    }
    refreshLibrary()
    setSyncToast(`已更新价格为 ¥${Math.round(price)}，可在编辑页保存后推送至抖音来客`)
    window.setTimeout(() => setSyncToast(null), 4200)
  }

  const isOnShelfRow = (row: ListRow) =>
    row.saleStatus === '上架中' || row.saleStatus === '在售'

  const openShelfConfirm = (row: ListRow) => {
    const goOnline = !isOnShelfRow(row)
    setShelfConfirm({ id: row.id, name: row.name, goOnline })
  }

  const confirmShelfChange = async () => {
    if (!shelfConfirm || !isGroupbuyGoodsPlatform(activePlat)) return
    setShelfBusy(true)
    setSyncToast(null)
    const r = await postMerchantProductShelfOperate(
      activePlat,
      shelfConfirm.id,
      shelfConfirm.goOnline ? 'online' : 'offline',
    )
    setShelfBusy(false)
    setShelfConfirm(null)
    if (r.ok) {
      const r2 = await fetchMerchantProductList(activePlat, { page: 1, pageSize: 50 })
      if (r2.ok) setApiItems(r2.items)
      refreshLibrary()
    }
    setSyncToast(r.ok ? r.message ?? '上下架已同步至平台' : r.message)
    window.setTimeout(() => setSyncToast(null), 4800)
  }

  const confirmDeleteDraft = async () => {
    if (!deleteConfirm) return
    setDeleteBusy(true)
    setSyncToast(null)
    const ok = deleteProductEditLibraryDraft(deleteConfirm.id)
    if (ok) {
      removeDraftDetailSnapshot(deleteConfirm.id)
      refreshLibrary()
      setSyncToast(`已删除本地草稿「${deleteConfirm.name}」`)
    } else {
      setSyncToast('删除失败：未找到该草稿')
    }
    setDeleteBusy(false)
    setDeleteConfirm(null)
    window.setTimeout(() => setSyncToast(null), 4200)
  }

  const runPullSync = async (id: string) => {
    setSyncingId(id)
    setSyncToast(null)
    const r = await pullMerchantProductFromPlatform(activePlat, id)
    setSyncingId(null)
    if (r.ok) {
      const r2 = await fetchMerchantProductList(activePlat, { page: 1, pageSize: 50 })
      if (r2.ok) setApiItems(r2.items)
      refreshLibrary()
    }
    setSyncToast(r.ok ? r.message ?? '已从平台拉取该商品信息' : r.message)
    window.setTimeout(() => setSyncToast(null), 4200)
  }

  const runBulkSync = async () => {
    setBulkSyncing(true)
    setSyncToast(null)
    const r = await syncAllMerchantProductsFromPlatforms()
    const r2 = await fetchMerchantProductList(activePlat, { page: 1, pageSize: 50 })
    if (r2.ok) setApiItems(r2.items)
    refreshLibrary()
    setBulkSyncing(false)
    setSyncToast(r.message ?? (r.ok ? '同步完成' : '同步失败'))
    window.setTimeout(() => setSyncToast(null), 8000)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {syncToast && (
        <div className="fixed bottom-6 left-1/2 z-[60] max-w-xl -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-3 text-center text-sm leading-relaxed text-white shadow-lg">
          {syncToast}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <Link
          to="/products"
          className="flex items-center text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回商品管理
        </Link>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="erp-page-title">商品列表</h1>
          <p className="mt-1 text-sm text-gray-500">
            合并展示本地草稿与平台商品。「同步商品」拉取各平台全量状态；行内「同步」仅拉取该商品在平台侧的信息；上下架需确认后同步至来客。
          </p>
          {listNote && <p className="mt-1 text-xs text-amber-800">{listNote}</p>}
          {listErr && <p className="mt-1 text-xs text-red-700">加载失败：{listErr}</p>}
        </div>
        <button
          type="button"
          disabled={bulkSyncing}
          onClick={() => void runBulkSync()}
          className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={cn('mr-2 h-4 w-4', bulkSyncing && 'animate-spin')} />
          {bulkSyncing ? '同步中…' : '同步商品'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2">
        {PRODUCT_CREATE_PLATFORMS.map((p) => {
          const on = p.id === activePlat
          const disabled = p.id === 'jd'
          return (
            <button
              key={p.id}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && setActivePlat(p.id)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                disabled && 'cursor-not-allowed opacity-50',
                on && !disabled
                  ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-600 hover:bg-white/80 disabled:hover:bg-transparent',
              )}
            >
              {p.name}
              {disabled ? '（开发中）' : ''}
            </button>
          )
        })}
      </div>

      <div
        className={cn(
          'flex flex-wrap items-end gap-3 rounded-xl border bg-white px-4 py-3',
          filtersActive ? 'border-indigo-200 bg-indigo-50/40' : 'border-gray-200',
        )}
      >
        <label className="block min-w-[140px] flex-1 text-xs font-medium text-gray-600">
          商品名称
          <input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="输入关键词"
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </label>
        <label className="block min-w-[120px] text-xs font-medium text-gray-600">
          来源
          <select
            value={filterOrigin}
            onChange={(e) => setFilterOrigin(e.target.value as OriginFilter)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          >
            <option value={ALL_FILTER}>全部</option>
            <option value="API">API</option>
            <option value="本地草稿">本地草稿</option>
          </select>
        </label>
        <label className="block min-w-[120px] text-xs font-medium text-gray-600">
          审核状态
          <select
            value={filterAuditStatus}
            onChange={(e) => setFilterAuditStatus(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          >
            {auditStatusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-[120px] text-xs font-medium text-gray-600">
          商品状态
          <select
            value={filterSaleStatus}
            onChange={(e) => setFilterSaleStatus(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          >
            {saleStatusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-[160px] flex-[1.2] text-xs font-medium text-gray-600">
          门店
          {activePlat === 'douyin' ? (
            <div className="mt-1">
              <DouyinStorePickerTrigger
                label=""
                value={filterPoiId}
                valueLabel={filterPoiId ? filterPoiName || filterPoiId : '全部门店'}
                placeholder="全部门店"
                showAllOption
                allOptionLabel="全部门店"
                pickerTitle="筛选门店"
                onChange={(id, row) => {
                  setFilterPoiId(id)
                  setFilterPoiName(row?.name ?? '')
                  setFilterStore(ALL_FILTER)
                  return false
                }}
              />
            </div>
          ) : activePlat === 'kuaishou' ? (
            <div className="mt-1">
              <KuaishouStorePickerTrigger
                label=""
                value={filterPoiId}
                valueLabel={filterPoiId ? filterPoiName || filterPoiId : '全部门店'}
                placeholder="全部门店"
                showAllOption
                allOptionLabel="全部门店"
                pickerTitle="筛选门店"
                onChange={(id, row) => {
                  setFilterPoiId(id)
                  setFilterPoiName(row?.name ?? '')
                  setFilterStore(ALL_FILTER)
                  return false
                }}
              />
            </div>
          ) : (
            <select
              value={filterStore}
              onChange={(e) => setFilterStore(e.target.value)}
              className="mt-1 w-full max-w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            >
              {storeOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </label>
        <div className="flex items-center gap-2 pb-0.5">
          <button
            type="button"
            onClick={resetFilters}
            disabled={!filtersActive}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            重置
          </button>
          {mergedRows.length > 0 && (
            <span className="text-xs text-gray-500 whitespace-nowrap">
              {filtered.length}/{mergedRows.length} 条
            </span>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-600">
          {listLoading && (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
              正在请求 {createPlatformLabel(activePlat)} 商品列表…
            </>
          )}
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-100 bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-3">商品名称</th>
              <th className="px-4 py-3">来源</th>
              <th className="px-4 py-3">门店</th>
              <th className="px-4 py-3">审核状态</th>
              <th className="px-4 py-3">商品状态</th>
              <th className="px-4 py-3">价格</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  {mergedRows.length === 0
                    ? '暂无商品。请先完成平台绑定并刷新列表，或在抖音创建流程中「保存草稿」写入本机草稿库。'
                    : '没有符合筛选条件的商品，请调整条件后重试。'}
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {r.origin === 'api' ? (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">API</span>
                    ) : (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">本地草稿</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{r.store}</td>
                  <td className="px-4 py-3 text-gray-700">{r.auditStatus || r.status}</td>
                  <td className="px-4 py-3 text-gray-700">{r.saleStatus || '—'}</td>
                  <td className="px-4 py-3 text-gray-900">
                    {priceEditId === r.id ? (
                      <form
                        className="flex items-center gap-1"
                        onSubmit={(e) => {
                          e.preventDefault()
                          applyLocalPrice(r.id, Number.parseFloat(priceEditValue))
                          setPriceEditId(null)
                        }}
                      >
                        <input
                          type="number"
                          className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                          value={priceEditValue}
                          onChange={(e) => setPriceEditValue(e.target.value)}
                          autoFocus
                        />
                        <button type="submit" className="text-xs text-indigo-600">
                          确定
                        </button>
                        <button
                          type="button"
                          className="text-xs text-gray-500"
                          onClick={() => setPriceEditId(null)}
                        >
                          取消
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-indigo-700"
                        title="简易修改价格"
                        onClick={() => {
                          setPriceEditId(r.id)
                          setPriceEditValue(String(r.price))
                        }}
                      >
                        ¥{r.price}
                        <Pencil className="h-3 w-3 text-gray-400" />
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      {isGroupbuyGoodsPlatform(activePlat) ? (
                        <Link
                          to={`/products/edit/${activePlat}/${encodeURIComponent(r.id)}`}
                          className="inline-flex items-center rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50"
                        >
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          编辑
                        </Link>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="inline-flex cursor-not-allowed items-center rounded-lg border border-gray-100 px-2.5 py-1 text-xs text-gray-400"
                          title="该平台编辑向导尚未开放，请稍后再试或联系管理员开通"
                        >
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          编辑
                        </button>
                      )}
                      {isGroupbuyGoodsPlatform(activePlat) && (
                        <>
                          <Link
                            to={`/products/edit/${activePlat}/${encodeURIComponent(r.id)}`}
                            className="inline-flex items-center rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                            title={`编辑平台商品（${createPlatformLabel(activePlat)}字段）`}
                          >
                            <ExternalLink className="mr-1 h-3.5 w-3.5" />
                            平台商品
                          </Link>
                          <button
                            type="button"
                            onClick={() => openShelfConfirm(r)}
                            className="inline-flex items-center rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                            title={`上下架（确认后同步至${createPlatformLabel(activePlat)}）`}
                          >
                            <ArrowUpDown className="mr-1 h-3.5 w-3.5" />
                            {isOnShelfRow(r) ? '下架' : '上架'}
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        disabled={!isGroupbuyGoodsPlatform(activePlat) || syncingId === r.id}
                        onClick={() => void runPullSync(r.id)}
                        className="inline-flex items-center rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                        title={
                          isGroupbuyGoodsPlatform(activePlat)
                            ? `从${createPlatformLabel(activePlat)}拉取该商品信息与状态`
                            : '当前仅抖音来客与快手团购支持同步'
                        }
                      >
                        <RefreshCw
                          className={cn('mr-1 h-3.5 w-3.5', syncingId === r.id && 'animate-spin')}
                        />
                        同步
                      </button>
                      {r.origin === 'library' ? (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm({ id: r.id, name: r.name })}
                          className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-100"
                          title="删除本地草稿（不影响平台已提交商品）"
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          删除
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {shelfConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={() => !shelfBusy && setShelfConfirm(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shelf-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="shelf-confirm-title" className="text-lg font-semibold text-gray-900">
              确认{shelfConfirm.goOnline ? '上架' : '下架'}
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              商品「{shelfConfirm.name}」将{shelfConfirm.goOnline ? '上架' : '下架'}
              并同步至抖音来客，是否继续？
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={shelfBusy}
                onClick={() => setShelfConfirm(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={shelfBusy}
                onClick={() => void confirmShelfChange()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {shelfBusy ? '处理中…' : '确认'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={() => !deleteBusy && setDeleteConfirm(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-draft-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-draft-title" className="text-lg font-semibold text-gray-900">
              确认删除本地草稿
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              将删除「{deleteConfirm.name}」的本地草稿记录。若已提交至平台审核，平台侧商品不受影响。
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setDeleteConfirm(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => void confirmDeleteDraft()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteBusy ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
