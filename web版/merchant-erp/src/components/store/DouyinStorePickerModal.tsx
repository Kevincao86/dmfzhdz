import { ChevronDown, Loader2, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../../cn'
import { readMerchantSession } from '../../lib/merchantSession'
import { getDouyinStores } from '../../services/douyinMerchantApi'
import ModalPortal from '../ui/ModalPortal'

const EMPTY_POI_IDS: string[] = []

function readToken() {
  return readMerchantSession('meoo_douyin_merchant_token')
}

function readMerchantId() {
  return readMerchantSession('meoo_douyin_merchant_id')
}

export type DouyinStoreRow = { id: string; name: string; address?: string }

export type DouyinStorePickerModalProps = {
  open: boolean
  onClose: () => void
  title?: string
  selectionMode?: 'multiple' | 'single'
  showAllOption?: boolean
  allOptionLabel?: string
  onConfirm?: (poiIds: string[], rows: DouyinStoreRow[]) => void
  onConfirmSingle?: (poiId: string | null, row: DouyinStoreRow | null) => void
  initialPoiIds?: string[]
  initialSelectedId?: string | null
}

export default function DouyinStorePickerModal({
  open,
  onClose,
  title,
  selectionMode = 'multiple',
  showAllOption = false,
  allOptionLabel = '全部门店（同步全部绑定门店）',
  onConfirm,
  onConfirmSingle,
  initialPoiIds = EMPTY_POI_IDS,
  initialSelectedId = null,
}: DouyinStorePickerModalProps) {
  const isSingle = selectionMode === 'single'
  const modalTitle = title ?? (isSingle ? '选择门店' : '选择适用门店')
  const wasOpenRef = useRef(false)

  const [modalDraftIds, setModalDraftIds] = useState<string[]>([])
  const [modalDraftSingle, setModalDraftSingle] = useState<string | null>(null)
  const [modalKeyword, setModalKeyword] = useState('')
  const [modalSearchInput, setModalSearchInput] = useState('')
  const [modalPage, setModalPage] = useState(1)
  const [modalPageSize, setModalPageSize] = useState(10)
  const [modalStores, setModalStores] = useState<DouyinStoreRow[]>([])
  const [modalTotal, setModalTotal] = useState(0)
  const [modalLoading, setModalLoading] = useState(false)

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current
    wasOpenRef.current = open
    if (!justOpened) return
    if (isSingle) {
      setModalDraftSingle(initialSelectedId ?? null)
    } else {
      setModalDraftIds([...initialPoiIds])
    }
    setModalPage(1)
    setModalKeyword('')
    setModalSearchInput('')
  }, [open, initialPoiIds, initialSelectedId, isSingle])

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
        relationType: 'all',
      })
      if (cancelled) return
      setModalLoading(false)
      if (r.ok) {
        setModalStores(
          r.items.map((x) => ({
            id: x.id,
            name: x.name,
            address: x.address,
          })),
        )
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
    if (isSingle) {
      if (!onConfirmSingle) return
      if (!modalDraftSingle) {
        onConfirmSingle(null, null)
        return
      }
      const row = modalStores.find((s) => s.id === modalDraftSingle) ?? {
        id: modalDraftSingle,
        name: modalDraftSingle,
      }
      onConfirmSingle(modalDraftSingle, row)
      return
    }
    if (!onConfirm) return
    const rows = modalStores.filter((s) => modalDraftIds.includes(s.id))
    onConfirm([...modalDraftIds], rows)
  }

  if (!open) return null

  return (
    <ModalPortal open={open}>
      <div
        className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
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
            {modalTitle}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="关闭">
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
          ) : modalStores.length === 0 && !(isSingle && showAllOption) ? (
            <p className="py-8 text-center text-sm text-gray-500">暂无门店数据，请检查绑定与门店列表接口</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {isSingle && showAllOption ? (
                <li
                  className="flex cursor-pointer items-center rounded-lg px-1 py-2 hover:bg-gray-50"
                  onClick={() => setModalDraftSingle(null)}
                >
                  <input
                    type="radio"
                    name="douyin-store-pick"
                    className="mr-3 h-4 w-4"
                    checked={modalDraftSingle === null}
                    onChange={() => setModalDraftSingle(null)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="text-sm font-medium text-gray-900">{allOptionLabel}</span>
                </li>
              ) : null}
              {modalStores.map((s) => (
                <li
                  key={s.id}
                  className="flex cursor-pointer items-start rounded-lg px-1 py-2 hover:bg-gray-50"
                  onClick={() => (isSingle ? setModalDraftSingle(s.id) : toggleModalPoi(s.id))}
                >
                  {isSingle ? (
                    <input
                      type="radio"
                      name="douyin-store-pick"
                      className="mr-3 mt-0.5 h-4 w-4"
                      checked={modalDraftSingle === s.id}
                      onChange={() => setModalDraftSingle(s.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <input
                      type="checkbox"
                      className="mr-3 mt-0.5 h-4 w-4 rounded border-gray-300"
                      checked={modalDraftIds.includes(s.id)}
                      onChange={() => toggleModalPoi(s.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium text-gray-900">{s.name}</p>
                    {s.address ? <p className="text-xs text-gray-500">{s.address}</p> : null}
                  </div>
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
                  modalPageSize === n ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50',
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
            <button type="button" disabled={modalPage <= 1} onClick={() => setModalPage((p) => Math.max(1, p - 1))} className="rounded border border-gray-300 bg-white px-3 py-1 text-sm disabled:opacity-40">
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
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            取消
          </button>
          <button type="button" onClick={handleConfirm} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            {isSingle ? '确定' : `确定（已选 ${modalDraftIds.length} 家）`}
          </button>
        </div>
      </div>
      </div>
    </ModalPortal>
  )
}

export function DouyinStorePickerTrigger({
  label,
  value,
  valueLabel,
  placeholder = '请选择门店',
  onChange,
  showAllOption = false,
  allOptionLabel,
  pickerTitle,
}: {
  label: string
  value: string | null
  valueLabel: string
  placeholder?: string
  onChange: (poiId: string | null, row: DouyinStoreRow | null) => boolean | void
  showAllOption?: boolean
  allOptionLabel?: string
  pickerTitle?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="block text-sm">
        <span className="mb-1 block text-xs text-slate-500">{label}</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-w-[240px] max-w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-800 hover:border-indigo-300"
        >
          <span className={cn('truncate', !valueLabel && 'text-slate-400')}>{valueLabel || placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        </button>
      </div>
      <DouyinStorePickerModal
        open={open}
        onClose={() => setOpen(false)}
        title={pickerTitle ?? label}
        selectionMode="single"
        showAllOption={showAllOption}
        allOptionLabel={allOptionLabel}
        initialSelectedId={value}
        onConfirmSingle={(id, row) => {
          const keepOpen = onChange(id, row) === false
          if (!keepOpen) setOpen(false)
        }}
      />
    </>
  )
}
