import { ImagePlus, Loader2, Save, Sparkles, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { compressImageFileToDataUrl } from '../lib/aiImageCompress'
import {
  createEmptyStoreMenuRecord,
  loadStoreMenuRecord,
  saveStoreMenuRecord,
  type StoreMenuItem,
  type StoreMenuRecord,
} from '../lib/storeMenuStorage'
import { recognizeStoreMenuImage } from '../services/storeIntelApi'
import { fetchStoresForPlatform } from '../services/merchantStoresApi'
import type { DouyinStoreRow } from '../services/douyinMerchantApi'

function mergeMenuItems(existing: StoreMenuItem[], incoming: StoreMenuItem[]): StoreMenuItem[] {
  const key = (it: StoreMenuItem) =>
    `${(it.category ?? '').trim()}|${it.name.trim()}|${it.priceYuan ?? ''}`
  const seen = new Set(existing.map(key))
  const out = [...existing]
  for (const it of incoming) {
    const k = key(it)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(it)
  }
  return out
}

export default function StoreMenuPage() {
  const [record, setRecord] = useState<StoreMenuRecord | null>(null)
  const [stores, setStores] = useState<DouyinStoreRow[]>([])
  const [selectedPoi, setSelectedPoi] = useState('')
  const [recognizing, setRecognizing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const r = loadStoreMenuRecord()
    setRecord(r ?? createEmptyStoreMenuRecord())
    if (r?.poiId) setSelectedPoi(r.poiId)
  }, [])

  useEffect(() => {
    void fetchStoresForPlatform('douyin', { page: 1, pageSize: 50, relationType: '0' }).then((res) => {
      if (res.ok) setStores(res.items)
    })
  }, [])

  const selectedStore = stores.find((s) => s.id === selectedPoi)

  const persist = useCallback(
    (next: StoreMenuRecord) => {
      const merged = {
        ...next,
        poiId: selectedPoi || next.poiId,
        storeName: selectedStore?.name ?? next.storeName,
        updatedAt: new Date().toISOString(),
      }
      setRecord(merged)
      saveStoreMenuRecord(merged)
    },
    [selectedPoi, selectedStore?.name],
  )

  const onPickStore = (poiId: string) => {
    setSelectedPoi(poiId)
    const st = stores.find((s) => s.id === poiId)
    if (record) persist({ ...record, poiId, storeName: st?.name })
  }

  const onUploadImages = async (files: FileList | null) => {
    if (!files?.length || !record) return
    setRecognizing(true)
    setToast(null)
    let mergedItems = [...record.items]
    const newImages = [...record.images]
    let recognizeErr: string | null = null
    try {
      for (let i = 0; i < Math.min(files.length, 6); i++) {
        const file = files[i]
        const dataUrl = await compressImageFileToDataUrl(file, 1600, 0.82)
        const imgId = `img-${Date.now()}-${i}`
        newImages.push({ id: imgId, dataUrl, fileName: file.name })
        const r = await recognizeStoreMenuImage(dataUrl, selectedStore?.name)
        if (r.ok && r.items.length) {
          mergedItems = mergeMenuItems(mergedItems, r.items)
        } else if (!r.ok) {
          recognizeErr = r.message
          break
        }
      }
      persist({
        ...record,
        images: newImages.slice(-12),
        items: mergedItems,
      })
      if (recognizeErr) {
        setToast(recognizeErr)
      } else {
        setToast(
          mergedItems.length
            ? `已识别并合并 ${mergedItems.length} 条价目/菜品`
            : '已上传图片，未识别到条目。若反复失败，请在系统设置配置 AI Key 后重新部署，或手动添加。',
        )
      }
    } finally {
      setRecognizing(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const updateItem = (index: number, patch: Partial<StoreMenuItem>) => {
    if (!record) return
    const items = record.items.map((it, i) => (i === index ? { ...it, ...patch } : it))
    persist({ ...record, items })
  }

  const removeItem = (index: number) => {
    if (!record) return
    persist({ ...record, items: record.items.filter((_, i) => i !== index) })
  }

  const addBlankItem = () => {
    if (!record) return
    persist({
      ...record,
      items: [...record.items, { name: '新菜品', category: '未分类' }],
    })
  }

  if (!record) return null

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="erp-page-title">店铺菜单 / 价目表</h1>
        <p className="mt-1 text-sm text-gray-500">
          上传菜单或价目表照片，AI 自动识别菜品与价格；数据保存在本账号下，供
          <Link to="/ai-agent" className="mx-1 text-indigo-600 underline">
            AI 助手
          </Link>
          创建商品与
          <Link to="/operation/competitors" className="mx-1 text-indigo-600 underline">
            竞争对手分析
          </Link>
          使用。
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-gray-700">关联门店（选填）</label>
          <select
            value={selectedPoi}
            onChange={(e) => onPickStore(e.target.value)}
            className="mt-1 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">不指定门店</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.address ? ` · ${s.address.slice(0, 24)}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void onUploadImages(e.target.files)}
          />
          <button
            type="button"
            disabled={recognizing}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {recognizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {recognizing ? '识别中…' : '上传菜单照片并识别'}
          </button>
          <button
            type="button"
            onClick={() => {
              persist(record)
              setToast('已保存')
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Save className="h-4 w-4" />
            保存
          </button>
        </div>

        {toast && (
          <p className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
            {toast}
          </p>
        )}

        {record.images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {record.images.map((img) => (
              <img
                key={img.id}
                src={img.dataUrl}
                alt=""
                className="h-24 w-24 rounded-lg border object-cover"
              />
            ))}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">识别结果（{record.items.length} 项）</h2>
          <button type="button" onClick={addBlankItem} className="text-sm text-indigo-600 hover:underline">
            + 手动添加
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2">分类</th>
                <th className="px-4 py-2">名称</th>
                <th className="px-4 py-2">价格(元)</th>
                <th className="px-4 py-2">备注</th>
                <th className="px-4 py-2 w-12" />
              </tr>
            </thead>
            <tbody>
              {record.items.map((it, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="px-4 py-2">
                    <input
                      value={it.category ?? ''}
                      onChange={(e) => updateItem(i, { category: e.target.value })}
                      className="w-full min-w-[5rem] rounded border border-gray-200 px-2 py-1"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      value={it.name}
                      onChange={(e) => updateItem(i, { name: e.target.value })}
                      className="w-full min-w-[8rem] rounded border border-gray-200 px-2 py-1"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      value={it.priceYuan ?? ''}
                      onChange={(e) =>
                        updateItem(i, {
                          priceYuan: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="w-24 rounded border border-gray-200 px-2 py-1"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      value={it.note ?? ''}
                      onChange={(e) => updateItem(i, { note: e.target.value })}
                      className="w-full min-w-[6rem] rounded border border-gray-200 px-2 py-1"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      className="text-gray-400 hover:text-red-600"
                      aria-label="删除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {record.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    <Sparkles className="mx-auto mb-2 h-8 w-8 text-indigo-300" />
                    上传菜单照片开始识别，或手动添加菜品
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}