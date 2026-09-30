import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMembership } from '../../context/MembershipContext'
import { MEMBERSHIP_UPGRADE_HREF } from '../../lib/membershipPlan'
import {
  adviseShop,
  describeShopEvalBasis,
  evaluateShop,
  formatVerifyYuan,
  platformShopEvalMeta,
  readSavedShopEval,
  resolveShopEvalFromStores,
  SHOP_EVAL_PLATFORMS,
  shopEvalGainTargets,
  shopEvalGrade,
  shopEvalGrades,
  shopEvalScopeOf,
  type ShopEvalAdvice,
  type ShopEvalInput,
  type ShopEvalPlatformId,
  type ShopEvalScore,
} from '../../lib/merchantShopEval'
import { MerchantPlatformIcon } from '../../lib/platformBranding'
import { postAiChat } from '../../services/ai/aiClient'
import { fetchStoresForPlatform, type StorePlatformTab } from '../../services/merchantStoresApi'

const storage = {
  getItem: (key: string) => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* ignore */
    }
  },
}

async function askText(system: string, user: string) {
  const data = await postAiChat({
    provider: 'doubao',
    stream: false,
    temperature: 0,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })
  if (String(data.provider || '') !== 'doubao') throw new Error('豆包暂不可用，请稍后再试')
  const content = String(data.content || '').trim()
  if (!content) throw new Error('豆包未返回内容')
  return content
}

function letterOf(name: string) {
  const s = String(name || '').trim()
  return s ? s.slice(0, 1) : '店'
}

function useRiseCount(target: number, play: boolean) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!play) {
      setValue(target)
      return
    }
    const start = performance.now()
    const dur = 1600
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      const eased = 1 - (1 - t) ** 3
      setValue(Math.round(target * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, play])
  return value
}

export default function MerchantShopEvalPanel() {
  const { plan } = useMembership()
  const navigate = useNavigate()
  const [platformId, setPlatformId] = useState<ShopEvalPlatformId>('douyin')
  const [input, setInput] = useState<ShopEvalInput>({ platformId: 'douyin' })
  const [score, setScore] = useState<ShopEvalScore | null>(null)
  const [advice, setAdvice] = useState<ShopEvalAdvice | null>(null)
  const [evaluating, setEvaluating] = useState(false)
  const [advising, setAdvising] = useState(false)
  const [err, setErr] = useState('')
  const [displayScore, setDisplayScore] = useState(0)
  const [animateScore, setAnimateScore] = useState(false)
  const [animateGains, setAnimateGains] = useState(false)
  const scope = shopEvalScopeOf(input)
  const meta = platformShopEvalMeta(platformId, scope)
  const canEval = Boolean(String(input.storeName || '').trim())
  const paid = plan !== 'free'
  const grade = score ? shopEvalGrade(score.score, scope) : null
  const grades = shopEvalGrades(scope)
  const displayName = input.brandName && scope === 'chain' ? input.brandName : input.storeName
  const gains = score ? shopEvalGainTargets(score, input) : null
  const shownExposure = useRiseCount(gains?.exposure || 0, animateGains)
  const shownVerify = useRiseCount(gains?.verify || 0, animateGains)
  const basis = useMemo(() => describeShopEvalBasis(input), [input])

  const loadStore = useCallback(async (tab: ShopEvalPlatformId) => {
    const res = await fetchStoresForPlatform(tab as StorePlatformTab, { page: 1, pageSize: 50 })
    const items = res.ok ? res.items || [] : []
    const total = res.ok && 'total' in res ? Number(res.total) : items.length
    setInput(resolveShopEvalFromStores(tab, items, total))
  }, [])

  useEffect(() => {
    void loadStore(platformId)
  }, [platformId, loadStore])

  useEffect(() => {
    const saved = readSavedShopEval(input, storage)
    setErr('')
    setAdvice(saved?.advice || null)
    setScore(saved?.score || null)
    setDisplayScore(saved?.score?.score || 0)
    setAnimateScore(false)
    setAnimateGains(Boolean(saved?.score))
  }, [input.platformId, input.scope, input.storeCount, input.storeName, input.address, input.phone, input.businessHours, input.offerName, input.offerPrice])

  useEffect(() => {
    if (!score || !animateScore) return
    const goal = score.score
    const start = performance.now()
    const dur = 1400
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      const eased = 1 - (1 - t) ** 3
      setDisplayScore(Math.round(goal * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [score, animateScore])

  function requirePaid() {
    if (plan !== 'free') return true
    navigate(MEMBERSHIP_UPGRADE_HREF)
    return false
  }

  async function onEvaluate() {
    if (!requirePaid()) return
    if (!canEval || evaluating || advising) return
    setEvaluating(true)
    setErr('')
    try {
      const next = await evaluateShop(input, { force: true, storage, askText })
      setAdvice(null)
      setAnimateScore(true)
      setAnimateGains(true)
      setDisplayScore(0)
      setScore(next)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setEvaluating(false)
    }
  }

  async function onAdvise() {
    if (!requirePaid()) return
    if (!score || evaluating || advising) return
    setAdvising(true)
    setErr('')
    try {
      setAdvice(await adviseShop(input, score, { force: true, storage, askText }))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setAdvising(false)
    }
  }

  return (
    <section className="shop-eval overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-[#1E3A5F]">门店经营评估</p>
          <p className="mt-1 text-sm text-slate-500">
            {scope === 'chain'
              ? '多维看这个品牌各店是否统一、能不能被搜到、被核销'
              : '多维看这家店能不能被搜到、被相信、被核销'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {SHOP_EVAL_PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlatformId(p.id)}
              className={`inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-xs font-medium ${
                platformId === p.id
                  ? 'bg-[#1E3A5F] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <MerchantPlatformIcon
                platformId={p.id}
                name={p.name}
                size="sm"
                className="!h-5 !w-5 rounded-md bg-white p-0.5 shadow-none"
              />
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-2">
        <div className="flex items-start gap-4 rounded-2xl bg-[#f6f8fb] p-4">
          {displayName ? (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#1E3A5F] text-2xl font-bold text-white">
              {letterOf(displayName)}
            </div>
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-slate-200 text-lg font-bold text-slate-500">
              店
            </div>
          )}
          <div className="min-w-0 text-left">
            <p className="text-lg font-bold text-slate-900">{displayName || '尚未读取到门店'}</p>
            <p className="mt-1 text-sm text-slate-500">
              <span className="mr-2 inline-flex rounded-full bg-[#1E3A5F]/10 px-2 py-0.5 text-xs font-semibold text-[#1E3A5F]">
                {scope === 'chain' ? `连锁品牌 · ${input.storeCount || '多'}家` : '单门店'}
              </span>
              {meta.name}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {basis || '请先在「店铺信息」完善门店名称、地址和电话'}
            </p>
            {!canEval ? (
              <button
                type="button"
                onClick={() => navigate('/store/info')}
                className="mt-2 text-sm font-medium text-[#1E3A5F] hover:underline"
              >
                去完善店铺信息
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col items-center rounded-2xl bg-[#f6f8fb] p-4">
          <div className="relative h-44 w-44">
            {evaluating ? <div className="shop-eval-scan" /> : null}
            <div
              className="flex h-full w-full items-center justify-center rounded-full"
              style={{
                background: `conic-gradient(from -90deg, #1E3A5F 0%, #5b8def ${displayScore}%, #e8eef6 ${displayScore}%)`,
              }}
            >
              <div className="flex h-[9.5rem] w-[9.5rem] items-center justify-center rounded-full bg-white">
                <span className="text-5xl font-extrabold tabular-nums text-[#1E3A5F]">{displayScore}</span>
              </div>
            </div>
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-800">{meta.title}</p>
          {grade ? (
            <div className="mt-2 text-center">
              <p className="text-lg font-extrabold text-[#1E3A5F]">{grade.label}</p>
              <p className="text-xs text-slate-500">{grade.note}</p>
            </div>
          ) : null}
          {score ? (
            <div className="mt-2 text-center text-xs text-slate-500">
              <p>
                {meta.levelA} {score.searchLevel}
              </p>
              <p>
                {meta.levelB} {score.verifyLevel}
              </p>
            </div>
          ) : null}
          <button
            type="button"
            disabled={!canEval || evaluating || advising}
            onClick={() => void onEvaluate()}
            className="mt-3 w-full rounded-xl bg-[#1E3A5F] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {evaluating ? '评估中…' : score ? '重新评估' : '门店评估'}
          </button>
        </div>
      </div>

      <div className="px-5 pb-5">
        {gains ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[#eef4ff] px-4 py-4 text-left">
              <p className="text-xs tracking-wide text-slate-500">预计提升曝光</p>
              <p className="shop-eval-gain mt-1 text-3xl font-extrabold text-[#1d4ed8]">▲ +{shownExposure}%</p>
            </div>
            <div className="rounded-2xl bg-[#fff4e8] px-4 py-4 text-left">
              <p className="text-xs tracking-wide text-slate-500">预计提升核销额</p>
              <p className="shop-eval-gain mt-1 text-3xl font-extrabold text-[#c2410c]">
                ▲ +{formatVerifyYuan(shownVerify)}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">
            完成评估后，这里显示预计提升的曝光和核销额
          </div>
        )}

        <button
          type="button"
          disabled={!score || evaluating || advising}
          onClick={() => void onAdvise()}
          className="mt-3 w-full rounded-xl bg-[#c2410c] px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
        >
          {advising ? '分析中…' : '查看分析与提升方案'}
        </button>
        {!paid ? (
          <p className="mt-2 text-center text-xs text-slate-500">
            免费版可看页面，评估和分析需开通会员。
            <button type="button" className="ml-1 text-[#1E3A5F] hover:underline" onClick={() => navigate(MEMBERSHIP_UPGRADE_HREF)}>
              去升级
            </button>
          </p>
        ) : null}
        {err ? <p className="mt-2 text-center text-sm text-red-600">{err}</p> : null}
        {!canEval ? <p className="mt-2 text-center text-sm text-slate-500">请先完善门店名称后再评估</p> : null}

        {score?.situations?.length ? (
          <div className="mt-4 rounded-2xl bg-[#f3f7ff] p-4">
            <p className="text-sm font-extrabold text-[#1d4ed8]">{meta.statusTitle}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {score.situations.map((row, index) => (
                <div key={row.name} className="rounded-xl bg-[#e8f1ff] p-3 text-left">
                  <p className="text-xs font-bold text-[#1d4ed8]">{String(index + 1).padStart(2, '0')}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{row.name}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{row.now}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {advice?.sections?.length ? (
          <div className="mt-4 rounded-2xl bg-[#fff7ed] p-4">
            <p className="text-sm font-extrabold text-[#c2410c]">分析与提升方案</p>
            <div className="mt-3 space-y-3">
              {advice.sections.map((row, index) => (
                <div key={row.name} className="rounded-xl bg-white p-4 text-left">
                  <p className="text-sm font-bold text-slate-900">
                    <span className="mr-2 text-[#c2410c]">{String(index + 1).padStart(2, '0')}</span>
                    {row.name}
                  </p>
                  {row.finding ? (
                    <div className="mt-3 rounded-lg bg-[#e8f1ff] p-3">
                      <p className="text-xs font-bold text-[#1d4ed8]">分析结果</p>
                      <p className="mt-1 text-sm leading-6 text-slate-700">{row.finding}</p>
                    </div>
                  ) : null}
                  {row.adjust ? (
                    <div className="mt-2 rounded-lg bg-[#f3e8ff] p-3">
                      <p className="text-xs font-bold text-[#6d28d9]">怎么调整</p>
                      <p className="mt-1 text-sm leading-6 text-slate-700">{row.adjust}</p>
                    </div>
                  ) : null}
                  {row.soon ? (
                    <div className="mt-2 rounded-lg bg-[#ffedd5] p-3">
                      <p className="text-xs font-bold text-[#c2410c]">近期要做</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{row.soon}</p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {grades.map((item) => (
            <div
              key={item.key}
              className={`rounded-xl p-3 text-left ${grade?.key === item.key ? 'bg-[#e8eef6] ring-1 ring-[#1E3A5F]/30' : 'bg-slate-50'}`}
            >
              <p className="text-xs font-bold text-slate-500">{item.range}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{item.label}</p>
              <p className="mt-1 text-sm text-slate-600">{item.note}</p>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .shop-eval-scan {
          position: absolute;
          inset: -6px;
          border-radius: 999px;
          border: 4px solid rgba(30, 58, 95, 0.16);
          border-top-color: #1E3A5F;
          animation: shop-eval-spin 0.75s linear infinite;
        }
        .shop-eval-gain {
          animation: shop-eval-float 2.6s ease-in-out infinite;
        }
        @keyframes shop-eval-spin { to { transform: rotate(360deg); } }
        @keyframes shop-eval-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
    </section>
  )
}
