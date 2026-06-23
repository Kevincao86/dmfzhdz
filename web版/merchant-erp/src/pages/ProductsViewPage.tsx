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
import { readMerchantSession } from '../lib/merchantSession'
import {
  type MerchantProductListItem,
  fetchMerchantProductList,
  postMerchantProductShelfOperate,
  pullMerchantProductFromPlatform,
  syncAllMerchantProductsFromPlatforms,
} from '../services/merchantProductListApi'

const GROUPBUY_PLATFORMS = new Set<CreatePlatformId>(['douyin', 'kuaishou'])
const TOKEN_KEY: Record<CreatePlatformId, string> = {
  douyin: 'meoo_douyin_merchant_token',
  kuaishou: 'meoo_kuaishou_merchant_token',
  meituan: 'meoo_meituan_merchant_token',
  xiaohongshu: 'meoo_xhs_merchant_token',
  jd: 'meoo_jd_merchant_token',
  eleme: 'meoo_eleme_merchant_token',
  meituan_waimai: 'meoo_meituan_waimai_merchant_token',
  jd_waimai: 'meoo_jd_waimai_merchant_token',
}

type ListRow = MerchantProductListItem & { origin: 'api' | 'library' }
type OriginFilter = '全部' | 'API' | '本地草稿'
const ALL = '全部'

function libRow(r: ProductEditLibraryRow, plat: CreatePlatformId): ListRow | null {
  if ((r.platformApi ?? 'douyin') !== plat) return null
  return {
    id: r.id,
    name: r.name,
    price: r.price,
    store: r.store,
    status: r.status,
    auditStatus: r.status,
    saleStatus: '未上架',
    platform: r.platform,
    origin: 'library',
  }
}

export default function ProductsViewPage() {
  const [plat, setPlat] = useState<CreatePlatformId>('douyin')
  const [libTick, setLibTick] = useState(0)
  const [apiRows, setApiRows] = useState<MerchantProductListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [filterOrigin, setFilterOrigin] = useState<OriginFilter>(ALL)
  const [filterAudit, setFilterAudit] = useState(ALL)
  const [filterSale, setFilterSale] = useState(ALL)
  const [filterStore, setFilterStore] = useState(ALL)
  const [keyword, setKeyword] = useState('')
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [bulkSync, setBulkSync] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [shelfConfirm, setShelfConfirm] = useState<{ id: string; name: string; online: boolean } | null>(
    null,
  )
  const [shelfBusy, setShelfBusy] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [priceEditId, setPriceEditId] = useState<string | null>(null)
  const [priceEditValue, setPriceEditValue] = useState('')

  const bumpLib = useCallback(() => setLibTick((n) => n + 1), [])
  const hasToken = Boolean(readMerchantSession(TOKEN_KEY[plat]))

  const reloadApi = useCallback(async () => {
    setLoading(true)
    setErr(null)
    setNote(null)
    const r = await fetchMerchantProductList(plat, { page: 1, pageSize: 50, full: true })
    setLoading(false)
    if (!r.ok) {
      setApiRows([])
      setErr(r.message)
      return
    }
    setApiRows(r.items)
    setNote(r.message ?? null)
  }, [plat])

  useEffect(() => {
    void reloadApi()
  }, [reloadApi])

  useEffect(() => {
    setFilterOrigin(ALL)
    setFilterAudit(ALL)
    setFilterSale(ALL)
    setFilterStore(ALL)
    setKeyword('')
  }, [plat])

  useEffect(() => {
    bumpLib()
    const on = () => bumpLib()
    window.addEventListener('meoo-product-edit-library-changed', on)
    return () => window.removeEventListener('meoo-product-edit-library-changed', on)
  }, [bumpLib])

  const merged = useMemo(() => {
    const map = new Map<string, ListRow>()
    for (const a of apiRows) map.set(a.id, { ...a, origin: 'api' })
    for (const r of loadProductEditLibrary()) {
      const row = libRow(r, plat)
      if (row && !map.has(row.id)) map.set(row.id, row)
    }
    return Array.from(map.values())
  }, [apiRows, plat, libTick])

  const auditOpts = useMemo(
    () => [ALL, ...Array.from(new Set(merged.map((r) => r.auditStatus || r.status).filter(Boolean)))],
    [merged],
  )
  const saleOpts = useMemo(
    () => [ALL, ...Array.from(new Set(merged.map((r) => r.saleStatus).filter(Boolean)))],
    [merged],
  )
  const storeOpts = useMemo(
    () => [ALL, ...Array.from(new Set(merged.map((r) => r.store.trim()).filter((s) => s && s !== '—')))],
    [merged],
  )

  const filtered = useMemo(() => {
    const kw = keyword.trim()
    return merged.filter((r) => {
      if (filterOrigin === 'API' && r.origin !== 'api') return false
      if (filterOrigin === '本地草稿' && r.origin !== 'library') return false
      if (filterAudit !== ALL && (r.auditStatus || r.status) !== filterAudit) return false
      if (filterSale !== ALL && r.saleStatus !== filterSale) return false
      if (filterStore !== ALL && r.store !== filterStore) return false
      if (kw && !r.name.includes(kw)) return false
      return true
    })
  }, [merged, filterOrigin, filterAudit, filterSale, filterStore, keyword])

  const onShelf = (row: ListRow) => {
    const online = !(row.saleStatus === '上架中' || row.saleStatus === '在售')
    setShelfConfirm({ id: row.id, name: row.name, online })
  }

  const confirmShelf = async () => {
    if (!shelfConfirm || !GROUPBUY_PLATFORMS.has(plat)) return
    setShelfBusy(true)
    const r = await postMerchantProductShelfOperate(
      plat,
      shelfConfirm.id,
      shelfConfirm.online ? 'online' : 'offline',
    )
    setShelfBusy(false)
    setShelfConfirm(null)
    if (r.ok) await reloadApi()
    bumpLib()
    setToast(r.ok ? r.message ?? '已同步上下架' : r.message)
    window.setTimeout(() => setToast(null), 4800)
  }

  const confirmDelete = async () => {
    if (!deleteConfirm) return
    setDeleteBusy(true)
    const ok = deleteProductEditLibraryDraft(deleteConfirm.id)
    if (ok) {
      removeDraftDetailSnapshot(deleteConfirm.id)
      bumpLib()
      setToast(`已删除本地草稿「${deleteConfirm.name}」`)
    } else setToast('删除失败')
    setDeleteBusy(false)
    setDeleteConfirm(null)
    window.setTimeout(() => setToast(null), 4200)
  }

  const pullOne = async (id: string) => {
    setSyncingId(id)
    const r = await pullMerchantProductFromPlatform(plat, id)
    setSyncingId(null)
    if (r.ok) {
      await reloadApi()
      bumpLib()
    }
    setToast(r.ok ? r.message ?? '已同步' : r.message)
    window.setTimeout(() => setToast(null), 4200)
  }

  const syncAll = async () => {
    setBulkSync(true)
    const r = await syncAllMerchantProductsFromPlatforms()
    await reloadApi()
    bumpLib()
    setBulkSync(false)
    setToast(r.message ?? (r.ok ? '同步完成' : '同步失败'))
    window.setTimeout(() => setToast(null), 8000)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] max-w-xl -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-3 text-center text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <Link to="/products" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="mr-1 h-4 w-4" />
        返回商品管理
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="erp-page-title">商品列表</h1>
          <p className="mt-1 text-sm text-gray-500">
            抖音来客按开放平台 online.query / draft.query 拉取；请求须带 Authorization Bearer（绑定 token）。
          </p>
          {!hasToken && (
            <p className="mt-2 text-sm text-red-700">
              未检测到{createPlatformLabel(plat)}绑定。
              <Link to="/settings" className="ml-1 font-medium underline">
                前往系统设置绑定
              </Link>
            </p>
          )}
          {note && <p className="mt-1 text-xs text-amber-800">{note}</p>}
          {err && <p className="mt-1 text-xs text-red-700">{err}</p>}
        </div>
        <button
          type="button"
          disabled={bulkSync || !hasToken}
          onClick={() => void syncAll()}
          className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={cn('mr-2 h-4 w-4', bulkSync && 'animate-spin')} />
          {bulkSync ? '同步中…' : '同步商品'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2">
        {PRODUCT_CREATE_PLATFORMS.map((p) => {
          const on = p.id === plat
          const off = p.id === 'jd'
          return (
            <button
              key={p.id}
              type="button"
              disabled={off}
              onClick={() => !off && setPlat(p.id)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium',
                off && 'cursor-not-allowed opacity-50',
                on && !off ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-gray-200' : 'text-gray-600',
              )}
            >
              {p.name}
              {off ? '（开发中）' : ''}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
        <label className="block min-w-[140px] flex-1 text-xs font-medium text-gray-600">
          商品名称
          <input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block min-w-[100px] text-xs font-medium text-gray-600">
          来源
          <select
            value={filterOrigin}
            onChange={(e) => setFilterOrigin(e.target.value as OriginFilter)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value={ALL}>全部</option>
            <option value="API">API</option>
            <option value="本地草稿">本地草稿</option>
          </select>
        </label>
        <label className="block min-w-[100px] text-xs font-medium text-gray-600">
          审核状态
          <select
            value={filterAudit}
            onChange={(e) => setFilterAudit(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            {auditOpts.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-[100px] text-xs font-medium text-gray-600">
          商品状态
          <select
            value={filterSale}
            onChange={(e) => setFilterSale(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            {saleOpts.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-[140px] text-xs font-medium text-gray-600">
          门店
          <select
            value={filterStore}
            onChange={(e) => setFilterStore(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            {storeOpts.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void reloadApi()}
          disabled={loading || !hasToken}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          刷新列表
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {loading && (
          <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
            正在拉取 {createPlatformLabel(plat)} 商品…
          </div>
        )}
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
                <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                  {merged.length === 0
                    ? hasToken
                      ? '平台未返回商品。请确认来客已授权第三方应用，或先在创建流程中保存本地草稿。'
                      : '请先绑定平台授权后再同步。'
                    : '无符合筛选条件的商品'}
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3">
                    {r.origin === 'api' ? (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">API</span>
                    ) : (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">本地草稿</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{r.store}</td>
                  <td className="px-4 py-3">{r.auditStatus || r.status}</td>
                  <td className="px-4 py-3">{r.saleStatus || '—'}</td>
                  <td className="px-4 py-3">
                    {priceEditId === r.id ? (
                      <form
                        className="flex items-center gap-1"
                        onSubmit={(e) => {
                          e.preventDefault()
                          const p = Number.parseFloat(priceEditValue)
                          if (Number.isFinite(p) && p > 0) {
                            updateProductEditLibraryRow(r.id, { price: Math.round(p) })
                            const snap = loadDraftDetailSnapshot(r.id)
                            if (snap) saveDraftDetailSnapshot(r.id, { ...snap, price_yuan: p })
                            bumpLib()
                          }
                          setPriceEditId(null)
                        }}
                      >
                        <input
                          type="number"
                          className="w-20 rounded border px-2 py-1 text-sm"
                          value={priceEditValue}
                          onChange={(e) => setPriceEditValue(e.target.value)}
                          autoFocus
                        />
                        <button type="submit" className="text-xs text-indigo-600">
                          确定
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1"
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
                      {GROUPBUY_PLATFORMS.has(plat) && (
                        <>
                          <Link
                            to={`/products/edit/${plat}/${encodeURIComponent(r.id)}`}
                            className="rounded-lg border px-2.5 py-1 text-xs hover:bg-gray-50"
                          >
                            编辑
                          </Link>
                          <button
                            type="button"
                            onClick={() => onShelf(r)}
                            className="rounded-lg border px-2.5 py-1 text-xs hover:bg-gray-50"
                          >
                            <ArrowUpDown className="mr-1 inline h-3.5 w-3.5" />
                            {r.saleStatus === '上架中' || r.saleStatus === '在售' ? '下架' : '上架'}
                          </button>
                          <button
                            type="button"
                            disabled={syncingId === r.id}
                            onClick={() => void pullOne(r.id)}
                            className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs text-indigo-800 disabled:opacity-50"
                          >
                            <RefreshCw className={cn('mr-1 inline h-3.5 w-3.5', syncingId === r.id && 'animate-spin')} />
                            同步
                          </button>
                        </>
                      )}
                      {r.origin === 'library' && (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm({ id: r.id, name: r.name })}
                          className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-800"
                        >
                          <Trash2 className="mr-1 inline h-3.5 w-3.5" />
                          删除
                        </button>
                      )}
                      {GROUPBUY_PLATFORMS.has(plat) && (
                        <Link
                          to={`/products/edit/${plat}/${encodeURIComponent(r.id)}`}
                          className="rounded-lg border px-2.5 py-1 text-xs text-gray-600"
                        >
                          <ExternalLink className="mr-1 inline h-3.5 w-3.5" />
                          平台商品
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {shelfConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">确认{shelfConfirm.online ? '上架' : '下架'}</h3>
            <p className="mt-2 text-sm text-gray-600">「{shelfConfirm.name}」将同步至{createPlatformLabel(plat)}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" disabled={shelfBusy} onClick={() => setShelfConfirm(null)} className="rounded-lg border px-4 py-2 text-sm">
                取消
              </button>
              <button type="button" disabled={shelfBusy} onClick={() => void confirmShelf()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">
                {shelfBusy ? '处理中…' : '确认'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">删除本地草稿</h3>
            <p className="mt-2 text-sm text-gray-600">将删除「{deleteConfirm.name}」的本地记录</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" disabled={deleteBusy} onClick={() => setDeleteConfirm(null)} className="rounded-lg border px-4 py-2 text-sm">
                取消
              </button>
              <button type="button" disabled={deleteBusy} onClick={() => void confirmDelete()} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white">
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
