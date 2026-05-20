import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  createPlatformLabel,
  getMerchantPlatform,
  type MerchantPlatformId,
} from '../../constants/merchantPlatforms'
import { cn } from '../../cn'
import { readMerchantSession } from '../../lib/merchantSession'

const apiBase = () => (import.meta.env.VITE_MERCHANT_API_BASE_URL as string | undefined) ?? ''

type Props = {
  platformId: Extract<MerchantPlatformId, 'eleme' | 'meituan_waimai' | 'jd_waimai'>
}

type ProductType = { id: string; label: string; hint?: string }

export default function WaimaiProductCreateWizard({ platformId }: Props) {
  const meta = getMerchantPlatform(platformId)
  const [productTypes, setProductTypes] = useState<ProductType[]>([])
  const [productType, setProductType] = useState('single')
  const [title, setTitle] = useState('')
  const [priceYuan, setPriceYuan] = useState('')
  const [stock, setStock] = useState('999')
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [loadingTpl, setLoadingTpl] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null)

  useEffect(() => {
    const token = readMerchantSession(meta.tokenSessionKey)
    if (!token) {
      setLoadingTpl(false)
      setFeedback({ text: `请先在系统设置中绑定${meta.name}`, tone: 'bad' })
      return
    }
    const b = apiBase().replace(/\/$/, '')
    void fetch(`${b}/api/merchant/${meta.apiSegment}/goods/template/get`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
      .then(async (res) => {
        const j = (await res.json()) as { productTypes?: ProductType[] }
        if (Array.isArray(j.productTypes) && j.productTypes.length) {
          setProductTypes(j.productTypes)
          setProductType(j.productTypes[0].id)
        } else {
          setProductTypes([
            { id: 'single', label: '单品' },
            { id: 'combo', label: '套餐' },
          ])
        }
      })
      .catch(() => {
        setProductTypes([
          { id: 'single', label: '单品' },
          { id: 'combo', label: '套餐' },
        ])
      })
      .finally(() => setLoadingTpl(false))
  }, [meta.apiSegment, meta.name, meta.tokenSessionKey])

  const handleSubmit = async () => {
    const token = readMerchantSession(meta.tokenSessionKey)
    if (!token) {
      setFeedback({ text: `请先绑定${meta.name}`, tone: 'bad' })
      return
    }
    const price = Number.parseFloat(priceYuan)
    if (!title.trim()) {
      setFeedback({ text: '请填写商品名称', tone: 'bad' })
      return
    }
    if (!Number.isFinite(price) || price <= 0) {
      setFeedback({ text: '请填写有效售价', tone: 'bad' })
      return
    }
    setSubmitting(true)
    setFeedback(null)
    const b = apiBase().replace(/\/$/, '')
    try {
      const res = await fetch(`${b}/api/merchant/${meta.apiSegment}/goods/product/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          name: title.trim(),
          priceYuan: price,
          stock: Number.parseInt(stock, 10) || 0,
          categoryId: categoryId.trim() || undefined,
          productType,
          description: description.trim() || undefined,
        }),
      })
      const j = (await res.json()) as { ok?: boolean; message?: string; draftId?: string }
      if (!res.ok || j.ok === false) {
        setFeedback({ text: j.message ?? `提交失败 HTTP ${res.status}`, tone: 'bad' })
        return
      }
      setFeedback({
        text: j.message ?? `已提交至${createPlatformLabel(platformId)}，草稿 ID：${j.draftId ?? '—'}`,
        tone: 'ok',
      })
    } catch (e) {
      setFeedback({ text: e instanceof Error ? e.message : '网络错误', tone: 'bad' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingTpl) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载{meta.name}商品模板…
      </div>
    )
  }

  return (
    <div className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-gray-600">
        按<strong>{meta.name}</strong>商家自研 OpenAPI 模板填写；字段与平台类目/审核规则一致，提交后由网关代理上架。
      </p>

      <div>
        <label className="text-sm font-medium text-gray-700">商品类型</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {productTypes.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setProductType(t.id)}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm',
                productType === t.id
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                  : 'border-gray-200 text-gray-700',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {productTypes.find((t) => t.id === productType)?.hint ? (
          <p className="mt-1 text-xs text-gray-500">
            {productTypes.find((t) => t.id === productType)?.hint}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium text-gray-700">商品名称 *</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-700">售价（元）*</span>
          <input
            value={priceYuan}
            onChange={(e) => setPriceYuan(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            inputMode="decimal"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-700">库存</span>
          <input
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            inputMode="numeric"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium text-gray-700">平台类目 ID</span>
          <input
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            placeholder="按开放平台类目树填写"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium text-gray-700">商品描述</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
      </div>

      {feedback ? (
        <p
          className={cn(
            'rounded-lg px-3 py-2 text-sm',
            feedback.tone === 'ok' ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-900',
          )}
        >
          {feedback.text}
        </p>
      ) : null}

      <button
        type="button"
        disabled={submitting}
        onClick={() => void handleSubmit()}
        className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {submitting ? '提交中…' : `提交至${meta.name}`}
      </button>
    </div>
  )
}
