import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { cn } from '../cn'
import {
  type CreatePlatformId,
  PRODUCT_CREATE_PLATFORMS,
} from '../constants/productCreatePlatforms'
import { MerchantPlatformIcon } from '../lib/platformBranding'
import { saveAiProductDraft } from '../lib/aiProductDraft'
import { fetchAiProductPlan } from '../services/storeIntelApi'
import { postPlatformProductDraft } from '../services/productListingApi'
import {
  probeMerchantPlatforms,
  type PlatformConnStatus,
} from '../services/platformConnectivityProbe'

/** P0 团购三家。抖音/快手仍走现有创建向导，本页不调用来客 save。 */
const P0_IDS = ['douyin', 'kuaishou', 'meituan'] as const
type P0Id = (typeof P0_IDS)[number]

const WIZARD_IDS = new Set<P0Id>(['douyin', 'kuaishou'])

type Step = 'edit' | 'platforms' | 'review' | 'done'

type Master = {
  name: string
  priceYuan: string
  originYuan: string
  combo: string
  validDays: string
  reserve: 'none' | 'need'
  headUrl: string
  storeHint: string
}

type PlatformDraft = {
  title: string
  description: string
}

type ConnMap = Record<string, PlatformConnStatus>

function emptyMaster(): Master {
  return {
    name: '',
    priceYuan: '',
    originYuan: '',
    combo: '',
    validDays: '90',
    reserve: 'none',
    headUrl: '',
    storeHint: '',
  }
}

function p0Meta(id: P0Id) {
  return PRODUCT_CREATE_PLATFORMS.find((p) => p.id === id)
}

function buildBrief(m: Master): string {
  const lines = [
    `套餐名称：${m.name.trim()}`,
    `售价：${m.priceYuan.trim()}元`,
    m.originYuan.trim() ? `划线价：${m.originYuan.trim()}元` : '',
    m.combo.trim() ? `包含：${m.combo.trim()}` : '',
    `有效期：${m.validDays.trim() || '90'}天`,
    m.reserve === 'need' ? '需要预约' : '无需预约',
    m.storeHint.trim() ? `门店：${m.storeHint.trim()}` : '',
  ]
  return lines.filter(Boolean).join('\n')
}

export default function ProductMasterPublishPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('edit')
  const [master, setMaster] = useState<Master>(emptyMaster)
  const [selected, setSelected] = useState<P0Id[]>([])
  const [conn, setConn] = useState<ConnMap>({})
  const [drafts, setDrafts] = useState<Partial<Record<P0Id, PlatformDraft>>>({})
  const [aiBusy, setAiBusy] = useState(false)
  const [aiHint, setAiHint] = useState<string | null>(null)
  const [submitBusy, setSubmitBusy] = useState(false)
  const [results, setResults] = useState<{ id: P0Id; text: string; ok: boolean }[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const rows = await probeMerchantPlatforms()
      if (cancelled) return
      setConn(Object.fromEntries(rows.map((r) => [r.id, r.status])))
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const priceOk = useMemo(() => {
    const n = Number.parseFloat(master.priceYuan)
    return Number.isFinite(n) && n > 0
  }, [master.priceYuan])

  const masterOk = master.name.trim().length > 0 && priceOk

  const toggle = (id: P0Id) => {
    if (conn[id] !== 'connected') return
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  const patchMaster = (p: Partial<Master>) => setMaster((m) => ({ ...m, ...p }))

  const patchDraft = (id: P0Id, p: Partial<PlatformDraft>) => {
    setDrafts((d) => ({
      ...d,
      [id]: {
        title: d[id]?.title ?? master.name,
        description: d[id]?.description ?? master.combo,
        ...p,
      },
    }))
  }

  const runAiFill = async () => {
    if (selected.length === 0) return
    setAiBusy(true)
    setAiHint(null)
    const brief = buildBrief(master)
    const next: Partial<Record<P0Id, PlatformDraft>> = { ...drafts }
    for (const id of selected) {
      const fallback: PlatformDraft = {
        title: master.name.trim(),
        description: [master.combo.trim(), master.storeHint.trim(), `有效期${master.validDays || 90}天`].filter(Boolean).join('\n'),
      }
      const r = await fetchAiProductPlan({
        userBrief: brief,
        platform: id,
        storeName: master.storeHint.trim() || undefined,
        menuSummary: master.combo.trim() || undefined,
      })
      if (r.ok) {
        next[id] = {
          title: r.plan.productName || fallback.title,
          description: [r.plan.description, ...(r.plan.comboLines ?? [])].filter(Boolean).join('\n') || fallback.description,
        }
      } else {
        next[id] = fallback
        setAiHint((h) => (h ? `${h}；${p0Meta(id)?.name}：${r.message}` : `${p0Meta(id)?.name}：${r.message}`))
      }
    }
    setDrafts(next)
    setAiBusy(false)
    setStep('review')
  }

  const confirmPublish = async () => {
    setSubmitBusy(true)
    const rows: { id: P0Id; text: string; ok: boolean }[] = []
    const wizardIds = selected.filter((id) => WIZARD_IDS.has(id))
    const draftIds = selected.filter((id) => !WIZARD_IDS.has(id))

    for (const id of draftIds) {
      const d = drafts[id]
      const price = Number.parseFloat(master.priceYuan)
      const r = await postPlatformProductDraft(id as CreatePlatformId, {
        title: (d?.title || master.name).trim(),
        priceYuan: price,
        description: (d?.description || master.combo).trim() || undefined,
      })
      rows.push({
        id,
        ok: r.ok,
        text: r.ok ? r.message ?? '已提交平台草稿' : r.message,
      })
    }

    if (wizardIds.includes('douyin')) {
      const d = drafts.douyin
      saveAiProductDraft({
        productName: (d?.title || master.name).trim(),
        productDesc: (d?.description || master.combo).trim() || undefined,
        priceYuan: master.priceYuan.trim(),
        originYuan: master.originYuan.trim() || undefined,
        headUrl: master.headUrl.trim() || undefined,
        platform: 'douyin',
        comboSummary: master.combo.trim() || undefined,
        autoSubmit: false,
      })
      rows.push({
        id: 'douyin',
        ok: true,
        text: '将进入现有抖音来客创建向导（类目/门店/保存仍走已验证上传，本页不代为提审）',
      })
    } else if (wizardIds.includes('kuaishou')) {
      const d = drafts.kuaishou
      saveAiProductDraft({
        productName: (d?.title || master.name).trim(),
        productDesc: (d?.description || master.combo).trim() || undefined,
        priceYuan: master.priceYuan.trim(),
        originYuan: master.originYuan.trim() || undefined,
        headUrl: master.headUrl.trim() || undefined,
        platform: 'douyin',
        comboSummary: master.combo.trim() || undefined,
        autoSubmit: false,
      })
      rows.push({
        id: 'kuaishou',
        ok: true,
        text: '将进入现有快手团购创建向导预填名称售价，保存仍走原向导',
      })
    }

    if (wizardIds.includes('kuaishou') && wizardIds.includes('douyin')) {
      rows.push({
        id: 'kuaishou',
        ok: true,
        text: '快手请在创建页顶部分页进入，沿用原快手向导（不改保存逻辑）',
      })
    }

    setResults(rows)
    setSubmitBusy(false)
    setStep('done')
  }

  const goExistingWizards = () => {
    const wizardIds = selected.filter((id) => WIZARD_IDS.has(id))
    const ordered: CreatePlatformId[] = []
    if (wizardIds.includes('douyin')) ordered.push('douyin')
    if (wizardIds.includes('kuaishou')) ordered.push('kuaishou')
    if (ordered.length === 0) {
      navigate('/products')
      return
    }
    navigate('/products/create', { state: { platforms: ordered, autoSubmit: false } })
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
        <h1 className="erp-page-title">一份套餐，多平台发布</h1>
        <p className="mt-1 text-sm text-gray-500">
          先编好套餐再勾平台。抖音来客仍用现有创建向导上传（已验证可成功），本流程只预填，不改其保存/提审。
        </p>
      </div>

      <div className="flex gap-2 text-xs text-gray-500">
        {(['edit', 'platforms', 'review', 'done'] as Step[]).map((s, i) => (
          <span
            key={s}
            className={cn(
              'rounded-full px-3 py-1',
              step === s ? 'bg-slate-800 text-white' : 'bg-gray-100',
            )}
          >
            {i + 1}. {s === 'edit' ? '编辑套餐' : s === 'platforms' ? '选平台' : s === 'review' ? '核对' : '结果'}
          </span>
        ))}
      </div>

      {step === 'edit' && (
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
          <label className="block text-sm">
            <span className="font-medium text-gray-800">套餐名称 *</span>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={master.name}
              maxLength={40}
              onChange={(e) => patchMaster({ name: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="font-medium text-gray-800">售价（元）*</span>
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={master.priceYuan}
                onChange={(e) => patchMaster({ priceYuan: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-800">划线价（元）</span>
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={master.originYuan}
                onChange={(e) => patchMaster({ originYuan: e.target.value })}
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="font-medium text-gray-800">套餐包含什么</span>
            <textarea
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              rows={3}
              placeholder="例：招牌面×2、例汤×2、饮料×2"
              value={master.combo}
              onChange={(e) => patchMaster({ combo: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="font-medium text-gray-800">有效期（天）</span>
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={master.validDays}
                onChange={(e) => patchMaster({ validDays: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-800">预约</span>
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={master.reserve}
                onChange={(e) => patchMaster({ reserve: e.target.value as Master['reserve'] })}
              >
                <option value="none">无需预约</option>
                <option value="need">需要预约</option>
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="font-medium text-gray-800">头图链接（https）</span>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              placeholder="可留空，在抖音来客向导里再上传"
              value={master.headUrl}
              onChange={(e) => patchMaster({ headUrl: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-800">适用门店（备注）</span>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              placeholder="正式勾选门店仍在抖音来客向导内完成"
              value={master.storeHint}
              onChange={(e) => patchMaster({ storeHint: e.target.value })}
            />
          </label>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!masterOk}
              onClick={() => setStep('platforms')}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              下一步：选平台
            </button>
          </div>
        </div>
      )}

      {step === 'platforms' && (
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-600">只勾已接通的。外卖/小红书本步不做。</p>
          <div className="space-y-2">
            {P0_IDS.map((id) => {
              const meta = p0Meta(id)
              if (!meta) return null
              const st = conn[id] ?? 'pending'
              const on = selected.includes(id)
              const selectable = st === 'connected'
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggle(id)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left text-sm',
                    selectable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
                    on ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <MerchantPlatformIcon
                      platformId={id}
                      name={meta.name}
                      letter={meta.letter}
                      color={meta.color}
                      size="sm"
                    />
                    <span className="font-medium text-gray-900">{meta.name}</span>
                    {WIZARD_IDS.has(id) ? (
                      <span className="text-xs text-gray-500">沿用现有向导上传</span>
                    ) : (
                      <span className="text-xs text-gray-500">提交平台草稿</span>
                    )}
                  </span>
                  <span className="text-xs text-gray-500">
                    {st === 'connected' ? '已接通' : st === 'pending' ? '检测中…' : '未接通'}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep('edit')}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              返回修改套餐
            </button>
            <button
              type="button"
              disabled={selected.length === 0 || aiBusy}
              onClick={() => void runAiFill()}
              className="inline-flex items-center rounded-lg bg-indigo-600 px-5 py-2 text-sm text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {aiBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {aiBusy ? '正在按平台补全…' : '生成草稿并核对'}
            </button>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-4">
          {aiHint ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              部分平台 AI 未生成成功，已用你填的套餐兜底，可直接改：{aiHint}
            </p>
          ) : null}
          <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-700">
            <p>
              <span className="text-gray-500">你填的 · 名称</span> {master.name}　
              <span className="text-gray-500">售价</span> {master.priceYuan} 元
            </p>
          </div>
          {selected.map((id) => {
            const meta = p0Meta(id)
            const d = drafts[id]
            return (
              <div key={id} className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="text-sm font-semibold text-gray-900">{meta?.name}</h3>
                <label className="block text-sm">
                  <span className="text-gray-600">平台标题（AI 补，可改）</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                    value={d?.title ?? ''}
                    onChange={(e) => patchDraft(id, { title: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-600">说明 / 卖点（AI 补，可改）</span>
                  <textarea
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                    rows={3}
                    value={d?.description ?? ''}
                    onChange={(e) => patchDraft(id, { description: e.target.value })}
                  />
                </label>
              </div>
            )
          })}
          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep('platforms')}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              返回选平台
            </button>
            <button
              type="button"
              disabled={submitBusy}
              onClick={() => void confirmPublish()}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm text-white hover:bg-indigo-700 disabled:bg-gray-300"
            >
              {submitBusy ? '处理中…' : `确认（${selected.length} 个平台）`}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
          <ul className="space-y-2 text-sm">
            {results.map((r, i) => (
              <li
                key={`${r.id}-${i}`}
                className={cn(
                  'rounded-lg border px-3 py-2',
                  r.ok ? 'border-green-200 bg-green-50 text-green-900' : 'border-amber-200 bg-amber-50 text-amber-900',
                )}
              >
                {p0Meta(r.id)?.name}：{r.text}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3">
            {selected.some((id) => WIZARD_IDS.has(id)) ? (
              <button
                type="button"
                onClick={goExistingWizards}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm text-white hover:bg-indigo-700"
              >
                进入现有创建向导（抖音来客原上传）
              </button>
            ) : null}
            <Link
              to="/products"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              回商品管理
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
