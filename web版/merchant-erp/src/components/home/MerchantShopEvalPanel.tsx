import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMembership } from '../../context/MembershipContext'
import { MEMBERSHIP_UPGRADE_HREF } from '../../lib/membershipPlan'
import {
  adviseShop,
  boundEvalBrandTarget,
  evaluateShop,
  formatVerifyYuan,
  hydrateShopEval,
  platformShopEvalMeta,
  readSavedShopEval,
  resolveShopEvalFromStores,
  SHOP_EVAL_PLATFORMS,
  shopEvalGainTargets,
  shopEvalGrade,
  shopEvalGrades,
  shopEvalScopeOf,
  splitCnRegion,
  type ShopEvalAdvice,
  type ShopEvalBoundStore,
  type ShopEvalInput,
  type ShopEvalPlatformId,
  type ShopEvalScore,
} from '../../lib/merchantShopEval'
import { MerchantPlatformIcon } from '../../lib/platformBranding'
import { merchantApiAuthHeaders, resolveMerchantApiBearer } from '../../lib/merchantApiAuth'
import { merchantApiFetchUrls } from '../../lib/merchantErpApiBase'
import { postAiChat } from '../../services/ai/aiClient'
import { checkErpPointsAffordable, spendErpPointsForUsage, type ErpPointsSpendKind } from '../../services/tenantBillingClient'
import { MOCK_CATEGORY_TREE } from '../../data/douyinCategoryMock'
import { fetchStoresForPlatform, storeTabToken, type StorePlatformTab } from '../../services/merchantStoresApi'

function readableLines(rows?: string[]) {
  return (rows || []).filter((line) => typeof line === 'string' && line.trim() && !line.includes('[object Object]'))
}

const CATEGORY_TREE = MOCK_CATEGORY_TREE.map((node) => ({
  name: node.name,
  children: (node.sub_tree_infos || []).map((child) => child.name).filter(Boolean),
}))

async function postLocate(body: Record<string, unknown>) {
  const auth = await resolveMerchantApiBearer()
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...merchantApiAuthHeaders(auth.token, auth.source),
  }
  let last = '高德定位失败'
  for (const url of merchantApiFetchUrls('/api/meoo-shop-eval-locate')) {
    try {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
      const data = (await res.json()) as {
        ok?: boolean
        message?: string
        names?: string[]
        mapNote?: string
        brandNote?: string
        brandCount?: number
        brandNames?: string[]
        publicTitles?: string[]
        paid?: boolean
        remaining?: number
        limit?: number
      }
      if (data && data.ok !== false) return data
      last = String(data.message || data || last)
    } catch {
      /* 下一条地址 */
    }
  }
  throw new Error(last)
}

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

async function askText(system: string, user: string, opts?: { webSearch?: boolean }) {
  const data = await postAiChat({
    provider: 'doubao',
    stream: false,
    temperature: 0,
    ...(opts?.webSearch ? { webSearch: true } : {}),
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

function readBoundEvalPlatforms(): ShopEvalPlatformId[] {
  return SHOP_EVAL_PLATFORMS.map((item) => item.id).filter((id) => Boolean(storeTabToken(id)))
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
  const [boundIds, setBoundIds] = useState<ShopEvalPlatformId[]>(readBoundEvalPlatforms)
  const [platformId, setPlatformId] = useState<ShopEvalPlatformId>(() => readBoundEvalPlatforms()[0] || 'douyin')
  const [input, setInput] = useState<ShopEvalInput>(() => ({
    platformId: readBoundEvalPlatforms()[0] || 'douyin',
  }))
  const [score, setScore] = useState<ShopEvalScore | null>(null)
  const [advice, setAdvice] = useState<ShopEvalAdvice | null>(null)
  const [evaluating, setEvaluating] = useState(false)
  const [advising, setAdvising] = useState(false)
  const [err, setErr] = useState('')
  const [formName, setFormName] = useState('')
  const [province, setProvince] = useState('')
  const [cityName, setCityName] = useState('')
  const [district, setDistrict] = useState('')
  const [detailAddress, setDetailAddress] = useState('')
  const [provinces, setProvinces] = useState<string[]>([])
  const [cities, setCities] = useState<string[]>([])
  const [districts, setDistricts] = useState<string[]>([])
  const [cat1, setCat1] = useState('')
  const [cat2, setCat2] = useState('')
  const formTouched = useRef(false)
  const cat2Options = CATEGORY_TREE.find((item) => item.name === cat1)?.children || []
  const fullAddress = [province, cityName, district, detailAddress].filter(Boolean).join('')
  const categoryLabel = cat1 && cat2 ? `${cat1} / ${cat2}` : ''
  const [displayScore, setDisplayScore] = useState(0)
  const [animateScore, setAnimateScore] = useState(false)
  const [animateGains, setAnimateGains] = useState(false)
  const scope = shopEvalScopeOf(input)
  const meta = platformShopEvalMeta(platformId, scope)
  const platformBound = boundIds.includes(platformId)
  const [boundStores, setBoundStores] = useState<ShopEvalBoundStore[]>([])
  const [chooser, setChooser] = useState<null | 'mode' | 'store'>(null)
  const [storeQuery, setStoreQuery] = useState('')
  const boundAccount = platformBound && boundStores.length > 0
  const boundName = String(input.evalFocus === 'store' ? input.storeName : input.brandName || input.storeName || formName || '').trim()
  const canEval = boundAccount
    ? Boolean(boundName)
    : Boolean(formName.trim() && province && cityName && district && detailAddress.trim() && categoryLabel)
  const paid = plan !== 'free'
  const [quota, setQuota] = useState<{ paid: boolean; remaining: number; limit: number } | null>(null)
  const adviceKind = 'shop_eval_advice' as ErpPointsSpendKind
  const grade = score ? shopEvalGrade(score.score, scope) : null
  const grades = shopEvalGrades(scope)
  const displayName =
    input.evalFocus === 'brand'
      ? input.brandName || formName.trim() || input.storeName
      : formName.trim() || input.storeName || ''
  const scopeText =
    input.evalFocus === 'brand'
      ? `总品牌 · ${input.storeCount || boundStores.length || '多'}家`
      : input.evalFocus === 'store'
        ? '单门店'
        : scope === 'chain'
          ? `连锁品牌 · ${input.storeCount || '多'}家`
          : '单门店'
  const shownStores = boundStores.filter((store) => {
    const q = storeQuery.trim()
    if (!q) return true
    return store.name.includes(q) || String(store.address || '').includes(q)
  })
  const highlightLines = readableLines(score?.highlights)
  const gapLines = readableLines(score?.gaps)
  const gains = score ? shopEvalGainTargets(score, input) : null
  const shownExposure = useRiseCount(gains?.exposure || 0, animateGains && Boolean(gains))
  const shownVerify = useRiseCount(gains?.verify || 0, animateGains && Boolean(gains))

  const loadStore = useCallback(async (tab: ShopEvalPlatformId) => {
    const res = await fetchStoresForPlatform(tab as StorePlatformTab, { page: 1, pageSize: 100 })
    const items = res.ok ? res.items || [] : []
    const total = res.ok && 'total' in res ? Number(res.total) : items.length
    const mapped: ShopEvalBoundStore[] = items
      .map((row, index) => ({
        id: String(row.id || `${row.name || 'store'}-${index}`),
        name: String(row.name || '').trim(),
        address: String(row.address || '').trim(),
        city: String(row.city || '').trim(),
        phone: String(row.phone || '').trim(),
        businessHours: String(row.businessHours || '').trim(),
        brandName: String(row.brandName || '').trim(),
      }))
      .filter((row) => row.name)
    setBoundStores(mapped)
    const next = resolveShopEvalFromStores(tab, mapped, Math.max(total, mapped.length))
    if (mapped.length >= 2) {
      const target = boundEvalBrandTarget(mapped)
      const anchor = target.anchor
      const region = anchor ? splitCnRegion(anchor.address || '', anchor.city) : { province: '', city: '', district: '', detail: '' }
      next.evalFocus = 'brand'
      next.scope = 'chain'
      next.storeCount = Math.max(target.storeCount, mapped.length, 2)
      next.brandName = target.brandName
      next.storeName = target.brandName
      next.storeNames = target.storeNames
      next.storeId = ''
      next.city = region.city || anchor?.city || next.city
      next.address = [region.province, region.city, region.district, region.detail || anchor?.address || ''].filter(Boolean).join('')
      next.phone = anchor?.phone || next.phone
      next.businessHours = anchor?.businessHours || next.businessHours
      if (!formTouched.current) {
        setFormName(target.brandName)
        if (region.province) setProvince(region.province)
        if (region.city) setCityName(region.city)
        if (region.district) setDistrict(region.district)
        if (region.detail || anchor?.address) setDetailAddress(region.detail || anchor?.address || '')
        if (region.province) {
          void postLocate({ action: 'districts', keywords: region.province })
            .then((data) => setCities(data.names || []))
            .catch(() => setCities([]))
        }
        if (region.city) {
          void postLocate({ action: 'districts', keywords: region.city })
            .then((data) => setDistricts(data.names || []))
            .catch(() => setDistricts([]))
        }
      }
    } else if (!formTouched.current && next.storeName) {
      setFormName(next.storeName)
      if (next.address) setDetailAddress(next.address)
    }
    setInput(next)
  }, [])

  useEffect(() => {
    const sync = () => {
      const next = readBoundEvalPlatforms()
      setBoundIds(next)
      setPlatformId((cur) => (next.includes(cur) ? cur : next[0] || cur))
    }
    sync()
    window.addEventListener('focus', sync)
    return () => window.removeEventListener('focus', sync)
  }, [])

  useEffect(() => {
    formTouched.current = false
  }, [platformId])

  useEffect(() => {
    if (!platformBound) {
      setBoundStores([])
      setInput((prev) => ({
        ...prev,
        platformId,
        evalFocus: '',
        scope: 'single',
        storeCount: 1,
        storeNames: '',
        storeId: '',
      }))
      return
    }
    void loadStore(platformId)
  }, [platformId, platformBound, loadStore])

  useEffect(() => {
    void postLocate({ action: 'eval-quota' })
      .then((data) =>
        setQuota({
          paid: Boolean(data.paid),
          remaining: Number(data.remaining) || 0,
          limit: Number(data.limit) || 0,
        }),
      )
      .catch(() => setQuota(null))
  }, [])

  useEffect(() => {
    void postLocate({ action: 'districts', keywords: '中国' })
      .then((data) => setProvinces(data.names || []))
      .catch(() => setProvinces([]))
  }, [])

  useEffect(() => {
    let cancel = false
    const apply = (saved: ReturnType<typeof readSavedShopEval>) => {
      if (cancel) return
      setErr('')
      setAdvice(saved?.advice || null)
      setScore(saved?.score || null)
      setDisplayScore(saved?.score?.score || 0)
      setAnimateScore(false)
      setAnimateGains(Boolean(saved?.score))
      const profile = saved?.profile
      if (profile && profile.evalFocus !== 'store' && profile.storeCount >= 2) {
        setInput((prev) => {
          if (prev.evalFocus === 'store') return prev
          if (prev.scope === 'chain' && (prev.storeCount || 0) >= profile.storeCount) return prev
          return {
            ...prev,
            storeCount: profile.storeCount,
            scope: 'chain',
            storeNames: profile.storeNames || prev.storeNames,
            brandName: profile.brandName || prev.brandName,
          }
        })
      }
    }
    apply(readSavedShopEval(input, storage))
    void hydrateShopEval(input, storage).then(apply)
    return () => {
      cancel = true
    }
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

  function diagnosisAllowed() {
    return plan === 'member' || plan === 'member_store' || plan === 'member_plus'
  }

  async function onProvince(value: string) {
    formTouched.current = true
    setProvince(value)
    setCityName('')
    setDistrict('')
    setCities([])
    setDistricts([])
    if (!value) return
    const data = await postLocate({ action: 'districts', keywords: value }).catch(() => null)
    setCities(data?.names || [])
  }

  async function onCity(value: string) {
    formTouched.current = true
    setCityName(value)
    setDistrict('')
    setDistricts([])
    if (!value) return
    const data = await postLocate({ action: 'districts', keywords: value }).catch(() => null)
    setDistricts(data?.names || [])
  }

  function rememberSnap(snap: { formName: string; province: string; cityName: string; district: string; detailAddress: string }) {
    formTouched.current = true
    setFormName(snap.formName)
    setProvince(snap.province)
    setCityName(snap.cityName)
    setDistrict(snap.district)
    setDetailAddress(snap.detailAddress)
    if (snap.province) {
      void postLocate({ action: 'districts', keywords: snap.province })
        .then((data) => setCities(data.names || []))
        .catch(() => setCities([]))
    }
    if (snap.cityName) {
      void postLocate({ action: 'districts', keywords: snap.cityName })
        .then((data) => setDistricts(data.names || []))
        .catch(() => setDistricts([]))
    }
  }

  function snapFromStore(store: ShopEvalBoundStore, name?: string) {
    const region = splitCnRegion(store.address || '', store.city)
    return {
      formName: name || store.name,
      province: region.province || province,
      cityName: region.city || cityName,
      district: region.district || district,
      detailAddress: region.detail || store.address || detailAddress,
    }
  }

  async function runEvaluate(draft: ShopEvalInput, snap?: { formName: string; province: string; cityName: string; district: string; detailAddress: string }) {
    const usingBound = platformBound && boundStores.length > 0
    const name = (
      draft.evalFocus === 'brand'
        ? draft.brandName || snap?.formName || formName
        : draft.evalFocus === 'store'
          ? draft.storeName || snap?.formName || formName
          : snap?.formName || formName
    ).trim()
    const prov = snap?.province ?? province
    const city = (usingBound ? draft.city || snap?.cityName || cityName : snap?.cityName ?? cityName).trim()
    const dist = snap?.district ?? district
    const detail = (snap?.detailAddress ?? detailAddress).trim()
    const typedAddress = [prov, city, dist, detail].filter(Boolean).join('')
    const address = usingBound ? draft.address || typedAddress || name : typedAddress
    if (usingBound) {
      if (!name) {
        setErr('请先选择总品牌或一家门店')
        return
      }
    } else if (!name || !prov || !city || !dist || !detail || !categoryLabel) {
      setErr('请补全名称、省市区、详细地址和分类')
      return
    }
    setEvaluating(true)
    setAdvice(null)
    setErr('')
    try {
      const gate = await postLocate({ action: 'eval-quota' })
      const remaining = Number(gate.remaining) || 0
      setQuota({ paid: Boolean(gate.paid), remaining, limit: Number(gate.limit) || 0 })
      if (remaining <= 0) {
        setErr(gate.message || '评估次数已用完')
        if (!gate.paid) navigate(MEMBERSHIP_UPGRADE_HREF)
        return
      }
      const located = await postLocate({
        action: 'locate',
        address,
        city,
        category: categoryLabel,
        storeName: name,
      })
      const brandCount = Number(located.brandCount) || 0
      const brandNames = Array.isArray(located.brandNames) ? located.brandNames : []
      const titles = Array.isArray(located.publicTitles) ? located.publicTitles : []
      const note = [located.mapNote, located.brandNote].filter(Boolean).join('\n')
      const focus = draft.evalFocus
      const nextInput: ShopEvalInput =
        focus === 'store'
          ? {
              ...draft,
              platformId,
              evalFocus: 'store',
              scope: 'single',
              storeCount: 1,
              storeName: name,
              storeNames: '',
              city,
              address,
              category: categoryLabel,
              mapNote: note,
              publicNote: titles.join('\n'),
            }
          : focus === 'brand'
            ? {
                ...draft,
                platformId,
                evalFocus: 'brand',
                scope: 'chain',
                storeCount: Math.max(Number(draft.storeCount) || 0, brandCount, boundStores.length, 2),
                storeName: draft.brandName || name,
                brandName: draft.brandName || name,
                storeNames: draft.storeNames || brandNames.slice(0, 8).join('、'),
                city,
                address,
                category: categoryLabel,
                mapNote: note,
                publicNote: titles.join('\n'),
              }
            : {
                ...draft,
                platformId,
                storeName: name,
                brandName: name,
                storeNames: brandNames.slice(0, 8).join('、'),
                storeCount: brandCount,
                scope: brandCount >= 2 ? 'chain' : 'single',
                city,
                address,
                category: categoryLabel,
                mapNote: note,
                publicNote: titles.join('\n'),
              }
      setInput(nextInput)
      const next = await evaluateShop(nextInput, { force: true, storage, askText })
      setAnimateScore(true)
      setAnimateGains(true)
      setDisplayScore(0)
      setScore(next)
      const used = await postLocate({ action: 'eval-quota', consume: true })
      setQuota({
        paid: Boolean(used.paid),
        remaining: Number(used.remaining) || 0,
        limit: Number(used.limit) || 0,
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setEvaluating(false)
    }
  }

  function onEvaluate() {
    if (!canEval || evaluating || advising) return
    void runEvaluate(input)
  }

  function onChooseBrand() {
    const target = boundEvalBrandTarget(boundStores)
    const snap = target.anchor
      ? snapFromStore(target.anchor, target.brandName)
      : { formName: target.brandName, province, cityName, district, detailAddress }
    rememberSnap(snap)
    setChooser(null)
    setScore(null)
    setAdvice(null)
    setDisplayScore(0)
    setInput({
      ...input,
      evalFocus: 'brand',
      scope: 'chain',
      storeCount: Math.max(target.storeCount, boundStores.length, 2),
      brandName: target.brandName,
      storeName: target.brandName,
      storeNames: target.storeNames,
      storeId: '',
      phone: target.anchor?.phone || '',
      businessHours: target.anchor?.businessHours || '',
      city: snap.cityName,
      address: [snap.province, snap.cityName, snap.district, snap.detailAddress].filter(Boolean).join(''),
    })
  }

  function onPickBoundStore(store: ShopEvalBoundStore) {
    const target = boundEvalBrandTarget(boundStores)
    const snap = snapFromStore(store)
    rememberSnap(snap)
    setChooser(null)
    setScore(null)
    setAdvice(null)
    setDisplayScore(0)
    setInput({
      ...input,
      evalFocus: 'store',
      scope: 'single',
      storeCount: 1,
      storeId: store.id,
      storeName: store.name,
      brandName: target.brandName,
      storeNames: '',
      phone: store.phone || '',
      businessHours: store.businessHours || '',
      city: snap.cityName,
      address: [snap.province, snap.cityName, snap.district, snap.detailAddress].filter(Boolean).join(''),
    })
  }

  async function onAdvise() {
    if (!diagnosisAllowed()) {
      navigate(MEMBERSHIP_UPGRADE_HREF)
      return
    }
    if (!platformBound) {
      setErr('请先绑定门店账号，再做分析评估')
      return
    }
    if (!score || evaluating || advising) return
    setAdvising(true)
    setErr('')
    try {
      await checkErpPointsAffordable({ kind: adviceKind })
      const advice = await adviseShop({ ...input, platformId }, score, { force: true, storage, askText })
      await spendErpPointsForUsage({
        kind: adviceKind,
        idempotencyKey: `shop-eval-advice-${Date.now()}`,
        note: '门店分析提升',
      })
      setAdvice(advice)
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
          <p className="mt-1 text-sm text-slate-500">首次评估免费。升级会员后每月可评估 30 次。生成分析提升每次 5 积分，并需先绑定门店账号</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {SHOP_EVAL_PLATFORMS.map((p) => {
            const bound = boundIds.includes(p.id)
            return (
              <button
                key={p.id}
                type="button"
                title={bound ? p.name : `${p.name}尚未绑定，仍可做免费评估`}
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
                  className={`!h-5 !w-5 rounded-md bg-white p-0.5 shadow-none ${bound ? '' : 'grayscale opacity-40'}`}
                />
                {p.name}
              </button>
            )
          })}
        </div>
      </div>

      {boundAccount ? null : (
      <div className="grid gap-3 border-b border-slate-100 px-5 py-4 md:grid-cols-2">
        <label className="block text-left text-sm text-slate-600">
          门店名称
          <input
            value={formName}
            onChange={(e) => {
              formTouched.current = true
              setFormName(e.target.value)
            }}
            placeholder="输入门店或品牌名称"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
          />
        </label>
        <label className="block text-left text-sm text-slate-600">
          分类
          <span className="mt-1 flex gap-2">
            <select
              value={cat1}
              onChange={(e) => {
                formTouched.current = true
                setCat1(e.target.value)
                setCat2('')
              }}
              className="w-1/2 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">一级分类</option>
              {CATEGORY_TREE.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              value={cat2}
              onChange={(e) => {
                formTouched.current = true
                setCat2(e.target.value)
              }}
              className="w-1/2 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">二级分类</option>
              {cat2Options.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </span>
        </label>
        <div className="text-left text-sm text-slate-600 md:col-span-2">
          地址
          {provinces.length ? (
            <div className="mt-1 grid gap-2 sm:grid-cols-3">
              <select value={province} onChange={(e) => void onProvince(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="">省</option>
                {provinces.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <select value={cityName} onChange={(e) => void onCity(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="">市</option>
                {cities.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={district}
                onChange={(e) => {
                  formTouched.current = true
                  setDistrict(e.target.value)
                }}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">区</option>
                {districts.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="mt-1 grid gap-2 sm:grid-cols-3">
              <input value={province} onChange={(e) => { formTouched.current = true; setProvince(e.target.value) }} placeholder="省" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input value={cityName} onChange={(e) => { formTouched.current = true; setCityName(e.target.value) }} placeholder="市" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input value={district} onChange={(e) => { formTouched.current = true; setDistrict(e.target.value) }} placeholder="区" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
          )}
          <input
            value={detailAddress}
            onChange={(e) => {
              formTouched.current = true
              setDetailAddress(e.target.value)
            }}
            placeholder="详细地址，如道路、门牌、商场楼层"
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
          />
        </div>
      </div>
      )}

      {platformBound && boundStores.length >= 2 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onChooseBrand}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
              input.evalFocus !== 'store' ? 'bg-[#1E3A5F] text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            总品牌 · {input.storeCount || boundStores.length}家
          </button>
          <button
            type="button"
            onClick={() => {
              setStoreQuery('')
              setChooser('store')
            }}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
              input.evalFocus === 'store' ? 'bg-[#1E3A5F] text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            筛选门店
          </button>
          <span className="text-sm text-slate-500">
            {input.evalFocus === 'store' ? `当前单店：${input.storeName || formName}` : `当前按总品牌：${input.brandName || formName}`}
            。分析提升跟着这个选择走。
          </span>
        </div>
      ) : null}

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
                {scopeText}
              </span>
              {meta.name}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {[categoryLabel, boundAccount ? input.address || fullAddress : fullAddress].filter(Boolean).join(' · ') ||
                (boundAccount ? '已使用绑定门店的资料' : '填写名称、地址和分类后即可免费评估')}
            </p>
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
            {evaluating
              ? '评估中…'
              : quota && quota.remaining <= 0
                ? quota.paid
                  ? '本月次数已用完'
                  : '升级后每月 30 次'
                : score
                  ? '重新评估'
                  : quota?.paid
                    ? `评估 · 剩 ${quota.remaining} 次`
                    : '免费评估'}
          </button>
        </div>
      </div>

      <div className="px-5 pb-5">
        {score?.positioning ? (
          <div className="rounded-2xl bg-[#f6f8fb] px-4 py-4 text-left">
            <p className="text-xs font-bold tracking-wide text-[#1E3A5F]">定位</p>
            <p className="mt-2 text-sm leading-7 text-slate-700">{score.positioning}</p>
            {score.summary ? <p className="mt-3 text-sm font-semibold leading-7 text-slate-900">{score.summary}</p> : null}
          </div>
        ) : (
          <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">完成评估后，这里显示公开渠道上的定位和综合判断</div>
        )}

        {score?.indicators?.length ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
            <div className="grid grid-cols-[148px_72px_1fr] bg-[#1E3A5F] px-4 py-2 text-xs font-semibold text-white">
              <span>指标</span>
              <span>得分</span>
              <span>点评</span>
            </div>
            {score.indicators.map((row) => (
              <div key={row.name} className="grid grid-cols-[148px_72px_1fr] items-start gap-2 border-t border-slate-100 px-4 py-3 text-left">
                <p className="text-sm font-semibold text-slate-900">{row.name}</p>
                <div>
                  <p className="text-lg font-extrabold text-[#1E3A5F]">{row.score}</p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-[#1E3A5F]" style={{ width: `${Math.max(0, Math.min(100, row.score))}%` }} />
                  </div>
                </div>
                <p className="text-sm leading-6 text-slate-600">{row.comment}</p>
              </div>
            ))}
          </div>
        ) : null}

        {highlightLines.length || gapLines.length ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl bg-[#f3f7ff] p-4 text-left">
              <p className="text-sm font-extrabold text-[#1d4ed8]">优势亮点</p>
              <div className="mt-3 space-y-3">
                {highlightLines.map((line, index) => (
                  <p key={line} className="text-sm leading-6 text-slate-700">
                    <span className="mr-2 font-bold text-[#1d4ed8]">{index + 1}.</span>
                    {line}
                  </p>
                ))}
              </div>
            </div>
            <div className="rounded-2xl bg-[#fff7ed] p-4 text-left">
              <p className="text-sm font-extrabold text-[#c2410c]">核心短板</p>
              <div className="mt-3 space-y-3">
                {gapLines.map((line, index) => (
                  <p key={line} className="text-sm leading-6 text-slate-700">
                    <span className="mr-2 font-bold text-[#c2410c]">{index + 1}.</span>
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {score?.sources?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {score.sources.map((title) => (
              <span key={title} className="max-w-full truncate rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                {title}
              </span>
            ))}
          </div>
        ) : null}

        {gains ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[#eef4ff] px-4 py-4 text-left">
              <p className="text-xs tracking-wide text-slate-500">预计提升曝光</p>
              <p className="shop-eval-gain mt-1 text-3xl font-extrabold text-[#1d4ed8]">▲ +{shownExposure}%</p>
            </div>
            <div className="rounded-2xl bg-[#fff4e8] px-4 py-4 text-left">
              <p className="text-xs tracking-wide text-slate-500">预计提升核销额</p>
              <p className="shop-eval-gain mt-1 text-3xl font-extrabold text-[#c2410c]">▲ +{formatVerifyYuan(shownVerify)}</p>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">完成评估后，这里显示预计提升的曝光和核销额</div>
        )}

        <button
          type="button"
          disabled={!score || evaluating || advising}
          onClick={() => void onAdvise()}
          className="mt-3 w-full rounded-xl bg-[#c2410c] px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
        >
          {advising ? '分析提升中…' : '分析提升 · 5积分'}
        </button>
        {!paid ? (
          <p className="mt-2 text-center text-xs text-slate-500">
            分析提升需开通会员，每次 5 积分。
            <button type="button" className="ml-1 text-[#1E3A5F] hover:underline" onClick={() => navigate(MEMBERSHIP_UPGRADE_HREF)}>
              去升级
            </button>
          </p>
        ) : null}
        {err ? <p className="mt-2 text-center text-sm text-red-600">{err}</p> : null}
        {!canEval && !boundAccount ? <p className="mt-2 text-center text-sm text-slate-500">请填写门店名称、省市区、详细地址和分类</p> : null}
        {!platformBound ? (
          <p className="mt-2 text-center text-sm text-slate-500">
            分析评估前请先绑定门店账号。
            <button type="button" className="ml-1 text-[#1E3A5F] hover:underline" onClick={() => navigate('/store/info')}>
              去绑定
            </button>
          </p>
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
                    {row.module ? <span className="ml-2 rounded-full bg-[#fff7ed] px-2 py-0.5 text-xs font-semibold text-[#c2410c]">{row.module}</span> : null}
                  </p>
                  {row.finding ? (
                    <div className="mt-3 rounded-lg bg-[#e8f1ff] p-3">
                      <p className="text-xs font-bold text-[#1d4ed8]">短板</p>
                      <p className="mt-1 text-sm leading-6 text-slate-700">{row.finding}</p>
                    </div>
                  ) : null}
                  {row.adjust ? (
                    <div className="mt-2 rounded-lg bg-[#f3e8ff] p-3">
                      <p className="text-xs font-bold text-[#6d28d9]">系统里怎么做</p>
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

      {chooser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setChooser(null)}>
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            {chooser === 'mode' ? (
              <>
                <p className="text-lg font-bold text-slate-900">这个账号绑定了 {boundStores.length} 家门店</p>
                <p className="mt-1 text-sm text-slate-500">选择这次评估的范围。分析提升会按同样的范围来写。</p>
                <button
                  type="button"
                  className="mt-4 w-full rounded-xl bg-[#1E3A5F] px-4 py-3 text-sm font-semibold text-white"
                  onClick={onChooseBrand}
                >
                  按总品牌分析
                </button>
                <button
                  type="button"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800"
                  onClick={() => {
                    setStoreQuery('')
                    setChooser('store')
                  }}
                >
                  分析单门店
                </button>
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-slate-900">选择 1 家门店</p>
                <input
                  value={storeQuery}
                  onChange={(event) => setStoreQuery(event.target.value)}
                  placeholder="按店名或地址筛选"
                  className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
                <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                  {shownStores.map((store) => (
                    <button
                      key={store.id}
                      type="button"
                      className="block w-full rounded-xl bg-slate-50 px-3 py-2 text-left hover:bg-slate-100"
                      onClick={() => onPickBoundStore(store)}
                    >
                      <span className="block text-sm font-semibold text-slate-900">{store.name}</span>
                      {store.address ? <span className="mt-0.5 block text-xs text-slate-500">{store.address}</span> : null}
                    </button>
                  ))}
                  {!shownStores.length ? <p className="py-6 text-center text-sm text-slate-500">没有匹配的门店</p> : null}
                </div>
                <button type="button" className="mt-3 text-sm text-slate-500" onClick={() => setChooser(null)}>
                  关闭
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

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
