import { Loader2, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '../../cn'
import { getDouyinStores } from '../../services/douyinMerchantApi'

function readToken() {
  try {
    return sessionStorage.getItem('meoo_douyin_merchant_token')?.trim() || null
  } catch {
    return null
  }
}

function readMerchantId() {
  try {
    return sessionStorage.getItem('meoo_douyin_merchant_id')?.trim() || null
  } catch {
    return null
  }
}

export type DouyinStorePickerModalProps = {
  open: boolean
  onClose: () => void
  /** 与创建商品「适用门店」一致：返回勾选的 poi_id 及名称行 */
  onConfirm: (poiIds: string[], rows: { id: string; name: string }[]) => void
  initialPoiIds?: string[]
}

/**
 * 抖音来客门店多选弹窗（分页、搜索），与商品创建向导「选择适用门店」交互一致。
 */
export default function DouyinStorePickerModal({
  open,
  onClose,
  onConfirm,
  initialPoiIds = [],
}: DouyinStorePickerModalProps) {
  const [modalDraftIds, setModalDraftIds] = useState<string[]>([])
  const [modalKeyword, setModalKeyword] = useState('')
  const [modalSearchInput, setModalSearchInput] = useState('')
  const [modalPage, setModalPage] = useState(1)
  const [modalPageSize, setModalPageSize] = useState(10)
  const [modalStores, setModalStores] = useState<{ id: string; name: string }[]>([])
  const [modalTotal, setModalTotal] = useState(0)
  const [modalLoading, setModalLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setModalDraftIds([...initialPoiIds])
    setModalPage(1)
    setModalKeyword('')
    setModalSearchInput('')
  }, [open, initialPoiIds])

  useEffect(() => {
    if (!open) return
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
  }, [open, modalPage, modalPageSize, modalKeyword])

  const toggleModalPoi = (id: string) => {
    setModalDraftIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const handleConfirm = () => {
    const rows = modalStores.filter((s) => modalDraftIds.includes(s.id))
    onConfirm([...modalDraftIds], rows)
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
        aria-labelledby="douyin-store-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 id="douyin-store-picker-title" className="text-lg font-semibold text-gray-900">
            选择适用门店
          </h2>
          <button
            type="button"
            onClick={onClose}
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
            <p className="py-8 text-center text-sm text-gray-500">暂无门店数据，请检查绑定与门店列表接口</p>
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
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            确定（已选 {modalDraftIds.length} 家）
          </button>
        </div>
      </div>
    </div>
  )
}
