import { ArrowLeft, Filter, Loader2, Pencil, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  PRODUCT_CREATE_PLATFORMS,
  type CreatePlatformId,
  createPlatformLabel,
} from '../constants/productCreatePlatforms'
import { cn } from '../cn'
import { loadProductEditLibrary, type ProductEditLibraryRow } from '../lib/productEditLibrary'
import {
  type MerchantProductListItem,
  fetchMerchantProductList,
  postMerchantProductSync,
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
  const [syncToast, setSyncToast] = useState<string | null>(null)

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

  const runSync = async (id: string) => {
    setSyncingId(id)
    setSyncToast(null)
    const r = await postMerchantProductSync(activePlat, id)
    setSyncingId(null)
    setSyncToast(r.ok ? r.message ?? '已请求与各平台同步商品信息' : r.message)
    window.setTimeout(() => setSyncToast(null), 4200)
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
            列表合并展示本地草稿与当前账号下的平台商品。可筛选、编辑；「同步」将把变更推到抖音来客对应商品（本地草稿无平台编号时会用本机保存的快照自动重试）。
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
                  <td className="px-4 py-3 text-gray-900">¥{r.price}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
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
                      <button
                        type="button"
                        disabled={activePlat !== 'douyin' || syncingId === r.id}
                        onClick={() => void runSync(r.id)}
                        className="inline-flex items-center rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                        title={
                          activePlat === 'douyin'
                            ? '将本行商品变更同步到抖音来客'
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
    </div>
  )
}
