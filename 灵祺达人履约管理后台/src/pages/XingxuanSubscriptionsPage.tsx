import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { xingxuanEnhanceApi } from '../lib/mpSync/xingxuanEnhanceApi'

type SubPrefs = {
  enabled?: boolean
  platforms?: string[]
  cities?: string[]
  categories?: string[]
  urgentOnly?: boolean
}

export default function XingxuanSubscriptionsPage() {
  const [enabled, setEnabled] = useState(false)
  const [platformsText, setPlatformsText] = useState('')
  const [citiesText, setCitiesText] = useState('')
  const [categoriesText, setCategoriesText] = useState('')
  const [urgentOnly, setUrgentOnly] = useState(false)
  const [matched, setMatched] = useState<Array<{ id: string; title?: string; platform?: string; region?: string }>>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const res = (await xingxuanEnhanceApi.getSubscriptions()) as { subscription?: SubPrefs }
        const sub = res.subscription || {}
        setEnabled(!!sub.enabled)
        setPlatformsText((sub.platforms || []).join(','))
        setCitiesText((sub.cities || []).join(','))
        setCategoriesText((sub.categories || []).join(','))
        setUrgentOnly(!!sub.urgentOnly)
        if (sub.enabled) await refreshMatched()
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [])

  async function refreshMatched() {
    const res = (await xingxuanEnhanceApi.matchSubscriptionOrders()) as {
      matched?: Array<{ id: string; title?: string; platform?: string; region?: string }>
    }
    setMatched(res.matched || [])
  }

  async function save() {
    setSaving(true)
    setErr('')
    try {
      const subscription = {
        enabled,
        platforms: platformsText.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
        cities: citiesText.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
        categories: categoriesText.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
        urgentOnly,
      }
      await xingxuanEnhanceApi.saveSubscriptions(subscription, enabled)
      if (enabled) await refreshMatched()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-content-shell page-content-shell--narrow space-y-4">
      <header>
        <h1 className="text-xl font-bold">商单订阅</h1>
        <p className="text-sm text-[var(--shell-muted)] mt-1">匹配城市、平台、品类的新招募提醒</p>
      </header>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      <div className="surface-card rounded-xl border p-4 space-y-3">
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>开启商单订阅</span>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        </label>
        {enabled ? (
          <>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="关注平台，逗号分隔" value={platformsText} onChange={(e) => setPlatformsText(e.target.value)} />
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="关注城市" value={citiesText} onChange={(e) => setCitiesText(e.target.value)} />
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="关注品类" value={categoriesText} onChange={(e) => setCategoriesText(e.target.value)} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={urgentOnly} onChange={(e) => setUrgentOnly(e.target.checked)} />
              仅急单
            </label>
            <button type="button" className="rounded-full bg-sky-600 text-white px-4 py-2 text-sm" disabled={saving} onClick={() => void save()}>
              {saving ? '保存中…' : '保存订阅'}
            </button>
          </>
        ) : null}
      </div>
      {matched.length ? (
        <div className="surface-card rounded-xl border p-4 space-y-2">
          <p className="font-medium text-sm">当前匹配 {matched.length} 条在招</p>
          {matched.map((m) => (
            <Link key={m.id} to={`/recruitment/${encodeURIComponent(m.id)}`} className="block text-sm text-sky-700 py-2 border-b last:border-0">
              {m.title || m.id} · {m.platform} · {m.region}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}
