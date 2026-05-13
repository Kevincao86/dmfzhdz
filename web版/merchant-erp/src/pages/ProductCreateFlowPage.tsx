import { ArrowLeft, Package } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  type CreatePlatformId,
  PRODUCT_CREATE_PLATFORMS,
  createPlatformLabel,
  isCreatePlatformId,
} from '../constants/productCreatePlatforms'
import { cn } from '../cn'
import DouyinProductCreateWizard from './douyin/DouyinProductCreateWizard'
import { postPlatformProductDraft } from '../services/productListingApi'

type LocationState = { platforms?: unknown }

function normalizePlatforms(raw: unknown): CreatePlatformId[] {
  if (!Array.isArray(raw)) return []
  const out: CreatePlatformId[] = []
  for (const x of raw) {
    if (typeof x === 'string' && isCreatePlatformId(x)) out.push(x)
  }
  return out.filter((id) => id !== 'jd')
}

export default function ProductCreateFlowPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const platforms = useMemo(
    () => normalizePlatforms((location.state as LocationState | null)?.platforms),
    [location.state],
  )

  const [active, setActive] = useState<CreatePlatformId | null>(null)
  const [title, setTitle] = useState('')
  const [priceYuan, setPriceYuan] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null)

  useEffect(() => {
    if (platforms.length === 0) {
      navigate('/products', { replace: true })
      return
    }
    setActive((prev) => (prev && platforms.includes(prev) ? prev : platforms[0]))
  }, [platforms, navigate])

  const activeMeta = PRODUCT_CREATE_PLATFORMS.find((p) => p.id === active)

  const handleSubmit = async () => {
    if (!active) return
    const price = Number.parseFloat(priceYuan)
    if (!title.trim()) {
      setFeedback({ text: '请填写商品名称', tone: 'bad' })
      return
    }
    if (!Number.isFinite(price) || price <= 0) {
      setFeedback({ text: '请填写有效售价（元）', tone: 'bad' })
      return
    }
    setSubmitting(true)
    setFeedback(null)
    const r = await postPlatformProductDraft(active, {
      title: title.trim(),
      priceYuan: price,
      description: description.trim() || undefined,
    })
    setSubmitting(false)
    if (r.ok) {
      setFeedback({
        text: r.draftId
          ? `已提交草稿（${r.draftId}）。${r.message ?? '系统将按各平台上架流程继续处理。'}`
          : r.message ?? '已提交，系统将同步至所选平台。',
        tone: 'ok',
      })
    } else {
      setFeedback({ text: r.message, tone: 'bad' })
    }
  }

  if (platforms.length === 0 || !active || !activeMeta) {
    return null
  }

  if (active === 'douyin') {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/products"
            className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回商品管理
          </Link>
        </div>
        <div>
          <h1 className="erp-page-title">抖音来客 · 创建商品</h1>
          <p className="mt-1 text-sm text-gray-500">
            按「类目 → 商品类型 → 商品信息」顺序填写，内容与抖音来客上架要求一致。
          </p>
        </div>
        {platforms.length > 1 && (
          <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2">
            {platforms.map((id) => {
              const meta = PRODUCT_CREATE_PLATFORMS.find((p) => p.id === id)
              if (!meta) return null
              const on = id === active
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActive(id)}
                  className={cn(
                    'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                    on
                      ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-gray-200'
                      : 'text-gray-600 hover:bg-white/80',
                  )}
                >
                  {meta.name}
                </button>
              )
            })}
          </div>
        )}
        <DouyinProductCreateWizard />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/products"
          className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回商品管理
        </Link>
      </div>

      <div>
        <h1 className="erp-page-title">上品页面设置</h1>
        <p className="mt-1 text-sm text-gray-500">
          在此填写商品资料并由系统提交至各平台，无需跳转到第三方网页。
        </p>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2">
        {platforms.map((id) => {
          const meta = PRODUCT_CREATE_PLATFORMS.find((p) => p.id === id)
          if (!meta) return null
          const on = id === active
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setActive(id)
                setFeedback(null)
              }}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                on
                  ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-600 hover:bg-white/80',
              )}
            >
              {meta.name}
            </button>
          )
        })}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-start gap-3">
          <div
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r text-lg font-bold text-white',
              activeMeta.color,
            )}
          >
            {activeMeta.letter}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{activeMeta.name}</h2>
            <p className="mt-1 text-xs text-gray-500">
              提交后由服务端在您已授权的账号下发起「创建商品」流程；请确保已在「系统设置」中完成对应平台绑定。
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">商品名称</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="与平台上架展示名称一致或按运营规范填写"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">售价（元）</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={priceYuan}
              onChange={(e) => setPriceYuan(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">商品说明（选填）</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="卖点、规格等，将随草稿一并提交"
            />
          </div>
        </div>

        {feedback && (
          <p
            className={cn(
              'mt-4 rounded-lg border px-3 py-2 text-sm',
              feedback.tone === 'bad'
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-green-200 bg-green-50 text-green-900',
            )}
          >
            {feedback.text}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="inline-flex items-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            <Package className="mr-2 h-4 w-4" />
            {submitting ? '提交中…' : `提交至${createPlatformLabel(active)}（API）`}
          </button>
        </div>
      </div>
    </div>
  )
}
