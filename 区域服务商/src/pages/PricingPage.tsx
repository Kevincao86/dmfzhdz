import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  fetchPricing,
  readSession,
  savePricing,
  SUBSCRIPTION_TIER_META,
  type RegionalCity,
  type SubscriptionTierKey,
} from '../lib/api'

type CityYuanForm = Record<SubscriptionTierKey, string>

function emptyYuanForm(): CityYuanForm {
  return {
    member_monthly: '168',
    member_plus_monthly: '598',
    member_quarterly: '468',
    member_plus_quarterly: '1688',
  }
}

function formFromPricing(
  city: string,
  pricing: Record<string, Partial<Record<SubscriptionTierKey, number>>>,
): CityYuanForm {
  const base = emptyYuanForm()
  const entry = pricing[city] ?? {}
  for (const m of SUBSCRIPTION_TIER_META) {
    const cents = entry[m.key]
    base[m.key] = cents != null ? String(cents / 100) : String(m.floorYuan)
  }
  return base
}

export default function PricingPage() {
  const session = readSession()
  const [cities, setCities] = useState<RegionalCity[]>(session?.cities ?? [])
  const [activeCity, setActiveCity] = useState('')
  const [forms, setForms] = useState<Record<string, CityYuanForm>>({})
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = async () => {
    const r = await fetchPricing()
    if (!r.ok) {
      setErr(r.error)
      return
    }
    setErr(null)
    const list = r.data.cities?.length ? r.data.cities : session?.cities ?? []
    setCities(list)
    const nextForms: Record<string, CityYuanForm> = {}
    for (const c of list) {
      nextForms[c.city] = formFromPricing(c.city, r.data.pricing ?? {})
    }
    setForms(nextForms)
    setActiveCity((prev) => prev || list[0]?.city || '')
  }

  useEffect(() => {
    void reload()
  }, [])

  const activeForm = useMemo(() => {
    if (!activeCity) return emptyYuanForm()
    return forms[activeCity] ?? emptyYuanForm()
  }, [activeCity, forms])

  if (!session?.permissions.includes('pricing') && !session?.permissions.includes('merchants')) {
    return <Navigate to="/" replace />
  }

  const setField = (key: SubscriptionTierKey, value: string) => {
    if (!activeCity) return
    setForms((prev) => ({
      ...prev,
      [activeCity]: { ...(prev[activeCity] ?? emptyYuanForm()), [key]: value },
    }))
  }

  const validateLocal = (): string | null => {
    for (const c of cities) {
      const f = forms[c.city] ?? emptyYuanForm()
      for (const m of SUBSCRIPTION_TIER_META) {
        const n = Number(f[m.key])
        if (!Number.isFinite(n) || n < m.floorYuan) {
          return `${c.city}「${m.label}」不得低于底价 ¥${m.floorYuan}`
        }
      }
    }
    return null
  }

  const onSave = async () => {
    setMsg(null)
    const localErr = validateLocal()
    if (localErr) {
      setErr(localErr)
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const pricing: Record<string, Partial<Record<SubscriptionTierKey, number>>> = {}
      for (const c of cities) {
        const f = forms[c.city] ?? emptyYuanForm()
        const entry: Partial<Record<SubscriptionTierKey, number>> = {}
        for (const m of SUBSCRIPTION_TIER_META) {
          const yuan = Number(f[m.key])
          const cents = Math.round(yuan * 100)
          // 仅当高于底价时写入；等于底价可省略（等同平台默认）
          if (cents > m.floorYuan * 100) entry[m.key] = cents
          else if (cents === m.floorYuan * 100) {
            /* 显式等于底价也写入，便于门户回显一致 */
            entry[m.key] = cents
          }
        }
        pricing[c.city] = entry
      }
      const r = await savePricing(pricing)
      if (!r.ok) {
        setErr(r.error)
        return
      }
      setMsg('已保存。名下城市商户订阅页将按此价展示（不得低于平台底价）。')
      await reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">区域定价</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          仅可对代理城市内的 ERP 订阅四档加价；平台默认价为底价，不允许降价。
        </p>
      </div>

      {err ? <p className="text-sm text-rose-400">{err}</p> : null}
      {msg ? <p className="text-sm text-emerald-400">{msg}</p> : null}

      {!cities.length ? (
        <p className="text-sm text-[var(--muted)]">尚未配置代理城市，请联系运营台。</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {cities.map((c) => (
              <button
                key={`${c.province}|${c.city}`}
                type="button"
                onClick={() => setActiveCity(c.city)}
                className={
                  activeCity === c.city
                    ? 'rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs text-white'
                    : 'rounded-full border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted)]'
                }
              >
                {c.city}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
            <h2 className="text-sm font-semibold text-white">城市：{activeCity || '—'}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {SUBSCRIPTION_TIER_META.map((m) => (
                <label key={m.key} className="text-xs text-[var(--muted)]">
                  {m.label}
                  <span className="ml-2 text-[10px] text-amber-200/80">底价 ¥{m.floorYuan}</span>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-sm text-white">¥</span>
                    <input
                      type="number"
                      min={m.floorYuan}
                      step={1}
                      value={activeForm[m.key]}
                      onChange={(e) => setField(m.key, e.target.value)}
                      className="w-full rounded-xl border border-[var(--line)] bg-[#0b1220] px-3 py-2 text-sm text-white"
                    />
                  </div>
                </label>
              ))}
            </div>
            <button
              type="button"
              disabled={busy || !activeCity}
              onClick={() => void onSave()}
              className="mt-5 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {busy ? '保存中…' : '保存全部城市价目'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
