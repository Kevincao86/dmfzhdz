import { ArrowLeft, ArrowUpDown, ExternalLink, Filter, Loader2, Pencil, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  PRODUCT_CREATE_PLATFORMS,
  type CreatePlatformId,
  createPlatformLabel,
} from '../constants/productCreatePlatforms'
import { cn } from '../cn'
import {
  loadProductEditLibrary,
  updateProductEditLibraryRow,
  type ProductEditLibraryRow,
} from '../lib/productEditLibrary'
import { loadDraftDetailSnapshot, saveDraftDetailSnapshot } from '../lib/productDraftSnapshot'
import {
  type MerchantProductListItem,
  fetchMerchantProductList,
  postMerchantProductShelfOperate,
  pullMerchantProductFromPlatform,
  syncAllMerchantProductsFromPlatforms,
} from '../services/productListingApi'

type ListRow = MerchantProductListItem & { origin: 'api' | 'library' }

function libToRow(r: ProductEditLibraryRow, plat: CreatePlatformId): ListRow | null {
  const api = r.platformApi ?? 'douyin'
  if (api !== plat) return null
  return {
    id: r.id,
    name: r.name,
    price: r.price,
    store: r.store,
    status: r.status,
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

  const [filterOpen, setFilterOpen] = useState(false)
  const [status, setStatus] = useState<string>('全部')
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

  const statuses = useMemo(
    () => ['全部', ...Array.from(new Set(mergedRows.map((r) => r.status)))],
    [mergedRows],
  )

  const filtered = useMemo(() => {
    return mergedRows.filter((r) => {
      if (status !== '全部' && r.status !== status) return false
      if (keyword.trim() !== '' && !r.name.includes(keyword.trim())) return false
      return true
    })
  }, [mergedRows, status, keyword])

  const resetFilters = () => {
    setStatus('全部')
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

  const isOnShelfStatus = (s: string) =>
    s === '在售' || s.includes('上架') || s === '审核通过'

  const openShelfConfirm = (row: ListRow) => {
    const goOnline = !isOnShelfStatus(row.status)
    setShelfConfirm({ id: row.id, name: row.name, goOnline })
  }

  const confirmShelfChange = async () => {
    if (!shelfConfirm || activePlat !== 'douyin') return
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
    setSyncToast(r.ok ? r.message ?? '同步完成' : r.message)
    window.setTimeout(() => setSyncToast(null), 5200)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {syncToast && (
        <div className="fixed bottom-6 left-1/2 z-[60] max-w-md -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2 text-center text-sm text-white shadow-lg">
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
        <div className="relative">
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className={cn(
              'flex items-center rounded-lg border px-4 py-2 text-sm transition-colors',
              filterOpen || status !== '全部' || keyword.trim() !== ''
                ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50',
            )}
          >
            <Filter className="mr-2 h-4 w-4" />
            筛选
            {mergedRows.length > 0 && filtered.length !== mergedRows.length && (
              <span className="ml-2 rounded-full bg-indigo-200 px-2 py-0.5 text-xs text-indigo-900">
                {filtered.length}/{mergedRows.length}
              </span>
            )}
          </button>
          {filterOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-10 cursor-default bg-transparent"
                aria-label="关闭筛选"
                onClick={() => setFilterOpen(false)}
              />
              <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900">筛选条件</span>
                  <button
                    type="button"
                    onClick={() => setFilterOpen(false)}
                    className="rounded p-1 hover:bg-gray-100"
                    aria-label="关闭"
                  >
                    <X className="h-4 w-4 text-gray-500" />
                  </button>
                </div>
                <label className="mb-3 block text-xs font-medium text-gray-600">
                  商品名称
                  <input
                    type="search"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="输入关键词"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                  />
                </label>
                <label className="mb-4 block text-xs font-medium text-gray-600">
                  状态
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => resetFilters()}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    重置
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterOpen(false)}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
                  >
                    应用
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex justify-end">
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
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">价格</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
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
                  <td className="px-4 py-3 text-gray-700">{r.status}</td>
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
                      {activePlat === 'douyin' ? (
                        <Link
                          to={`/products/edit/douyin/${encodeURIComponent(r.id)}`}
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
                      {activePlat === 'douyin' && (
                        <>
                          <Link
                            to={`/products/edit/douyin/${encodeURIComponent(r.id)}`}
                            className="inline-flex items-center rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                            title="编辑平台商品（来客字段）"
                          >
                            <ExternalLink className="mr-1 h-3.5 w-3.5" />
                            平台商品
                          </Link>
                          <button
                            type="button"
                            onClick={() => openShelfConfirm(r)}
                            className="inline-flex items-center rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                            title="上下架（确认后同步至抖音来客）"
                          >
                            <ArrowUpDown className="mr-1 h-3.5 w-3.5" />
                            {isOnShelfStatus(r.status) ? '下架' : '上架'}
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        disabled={activePlat !== 'douyin' || syncingId === r.id}
                        onClick={() => void runPullSync(r.id)}
                        className="inline-flex items-center rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                        title={
                          activePlat === 'douyin'
                            ? '从抖音来客拉取该商品信息与状态'
                            : '当前仅抖音来客支持同步'
                        }
                      >
                        <RefreshCw
                          className={cn('mr-1 h-3.5 w-3.5', syncingId === r.id && 'animate-spin')}
                        />
                        同步
                      </button>
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
    </div>
  )
}
