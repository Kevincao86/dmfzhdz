import { ChevronDown, Loader2, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '../../cn'
import { fetchAllDouyinOnlineProducts, type DouyinOnlineProductRow } from '../../lib/douyinReviewSyncHelpers'

export type DouyinProductPickerModalProps = {
  open: boolean
  onClose: () => void
  title?: string
  selectedId?: string | null
  showAllOption?: boolean
  allOptionLabel?: string
  onConfirm: (productId: string | null, row: DouyinOnlineProductRow | null) => void
}

export default function DouyinProductPickerModal({
  open,
  onClose,
  title = '选择商品',
  selectedId = null,
  showAllOption = true,
  allOptionLabel = '全部在线商品',
  onConfirm,
}: DouyinProductPickerModalProps) {
  const [allProducts, setAllProducts] = useState<DouyinOnlineProductRow[]>([])
  const [loadingAll, setLoadingAll] = useState(false)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [draftId, setDraftId] = useState<string | null>(selectedId ?? null)

  useEffect(() => {
    if (!open) return
    setDraftId(selectedId ?? null)
    setKeyword('')
    setSearchInput('')
    setPage(1)
    setLoadErr(null)
    let cancelled = false
    ;(async () => {
      setLoadingAll(true)
      const r = await fetchAllDouyinOnlineProducts()
      if (cancelled) return
      setLoadingAll(false)
      if (!r.ok) {
        setLoadErr(r.message)
        setAllProducts([])
        return
      }
      setAllProducts(r.items)
    })()
    return () => {
      cancelled = true
    }
  }, [open, selectedId])

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return allProducts
    return allProducts.filter(
      (p) => p.name.toLowerCase().includes(kw) || p.id.toLowerCase().includes(kw),
    )
  }, [allProducts, keyword])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize)

  const handleConfirm = () => {
    if (!draftId) {
      onConfirm(null, null)
      return
    }
    const row = allProducts.find((p) => p.id === draftId) ?? null
    onConfirm(draftId, row)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="关闭">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-b px-5 py-3">
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setKeyword(searchInput.trim())
                  setPage(1)
                }
              }}
              placeholder="搜索商品名称或 ID"
              className="min-w-[200px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => {
                setKeyword(searchInput.trim())
                setPage(1)
              }}
              className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Search className="mr-1 h-4 w-4" />
              搜索
            </button>
          </div>
        </div>
        <div className="max-h-[min(50vh,420px)] overflow-y-auto px-5 py-3">
          {loadingAll ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 className="mr-2 h-6 w-6 animate-spin" />
              加载商品中…
            </div>
          ) : loadErr ? (
            <p className="py-8 text-center text-sm text-red-600">{loadErr}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {showAllOption ? (
                <li className="flex items-center py-2">
                  <input
                    type="radio"
                    name="douyin-product-pick"
                    className="mr-3 h-4 w-4"
                    checked={draftId === null}
                    onChange={() => setDraftId(null)}
                  />
                  <span className="text-sm font-medium text-gray-900">{allOptionLabel}</span>
                </li>
              ) : null}
              {pageItems.length === 0 ? (
                <li className="py-6 text-center text-sm text-gray-500">暂无匹配商品</li>
              ) : (
                pageItems.map((p) => (
                  <li key={p.id} className="flex items-start py-2">
                    <input
                      type="radio"
                      name="douyin-product-pick"
                      className="mr-3 mt-0.5 h-4 w-4"
                      checked={draftId === p.id}
                      onChange={() => setDraftId(p.id)}
                    />
                    <div className="min-w-0 text-sm">
                      <p className="font-medium text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.id}</p>
                    </div>
                  </li>
                ))
              )}
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
                  setPageSize(n)
                  setPage(1)
                }}
                className={cn(
                  'rounded px-2 py-1',
                  pageSize === n ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50',
                )}
              >
                {n}
              </button>
            ))}
            <span className="ml-2">
              共 {filtered.length} 条，第 {page} / {totalPages} 页
            </span>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded border border-gray-300 bg-white px-3 py-1 text-sm disabled:opacity-40">
              上一页
            </button>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded border border-gray-300 bg-white px-3 py-1 text-sm disabled:opacity-40">
              下一页
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            取消
          </button>
          <button type="button" onClick={handleConfirm} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            确定
          </button>
        </div>
      </div>
    </div>
  )
}

export function DouyinProductPickerTrigger({
  label,
  value,
  valueLabel,
  placeholder = '请选择商品',
  onChange,
  showAllOption = true,
  allOptionLabel,
  pickerTitle,
}: {
  label: string
  value: string | null
  valueLabel: string
  placeholder?: string
  onChange: (productId: string | null, row: DouyinOnlineProductRow | null) => void
  showAllOption?: boolean
  allOptionLabel?: string
  pickerTitle?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-slate-500">{label}</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-w-[240px] max-w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-800 hover:border-indigo-300"
        >
          <span className={cn('truncate', !valueLabel && 'text-slate-400')}>{valueLabel || placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        </button>
      </label>
      <DouyinProductPickerModal
        open={open}
        onClose={() => setOpen(false)}
        title={pickerTitle ?? label}
        selectedId={value}
        showAllOption={showAllOption}
        allOptionLabel={allOptionLabel}
        onConfirm={(id, row) => {
          onChange(id, row)
          setOpen(false)
        }}
      />
    </>
  )
}
