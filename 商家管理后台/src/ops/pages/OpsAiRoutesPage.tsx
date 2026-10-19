import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import SecretInput from '../../components/SecretInput'
import {
  AI_ROUTE_VENDORS,
  displayAiVendorRoutes,
  effectiveVendorKey,
  maskApiKey,
  type AiVendorRoute,
  type RegistryAiVendorRoutes,
} from '../../meooRegistryShared/aiVendorRouteShared'
import { fetchRegistry, postVendorKeys, type RegistryVendorKeys } from '../opsRegistryApi'
import { OpsEditableSection } from '../useOpsModuleEdit'

const LINE_INDEX = [0, 1, 2] as const

function activeSummary(route: AiVendorRoute): string {
  if (route.mode === 'auto') {
    const filled = route.lines.filter((line) => line.apiKey.trim()).length
    return filled > 1 ? `自动 · 已填 ${filled} 条，每次请求从主线路开始` : '自动 · 目前只有一条可用 Key'
  }
  const line = route.lines[route.active]
  return `手动 · 固定 ${line?.label || '主线路'}（${maskApiKey(line?.apiKey ?? '')}）`
}

export default function OpsAiRoutesPage() {
  const [routes, setRoutes] = useState<RegistryAiVendorRoutes | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const dirtyRef = useRef(false)

  const load = useCallback(async (opts?: { force?: boolean }) => {
    if (opts?.force) dirtyRef.current = false
    setLoading(true)
    if (!dirtyRef.current) setHint(null)
    try {
      const reg = await fetchRegistry({ slice: 'ai' })
      if (dirtyRef.current) return
      const legacy: Record<string, string | undefined> = {}
      const keys = (reg.vendorKeys ?? {}) as RegistryVendorKeys
      for (const vendor of AI_ROUTE_VENDORS) legacy[vendor.id] = keys[vendor.id]
      setRoutes(displayAiVendorRoutes(reg.aiVendorRoutes, legacy))
    } catch (e) {
      setHint(e instanceof Error ? e.message : '读取注册表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function updateVendor(id: string, next: AiVendorRoute) {
    dirtyRef.current = true
    setRoutes((prev) => {
      if (!prev) return prev
      return { ...prev, vendors: { ...prev.vendors, [id]: next } }
    })
  }

  async function save() {
    if (!routes) return
    setSaving(true)
    setHint(null)
    try {
      const keys: RegistryVendorKeys = {}
      for (const vendor of AI_ROUTE_VENDORS) {
        const route = routes.vendors[vendor.id]
        keys[vendor.id] = route ? effectiveVendorKey(route) : ''
      }
      await postVendorKeys({
        keys,
        aiVendorRoutes: { ...routes, updatedAt: new Date().toISOString() },
        lastWriter: 'ops',
      })
      dirtyRef.current = false
      const reg = await fetchRegistry({ slice: 'ai' })
      const legacy: Record<string, string | undefined> = {}
      const savedKeys = (reg.vendorKeys ?? {}) as RegistryVendorKeys
      for (const vendor of AI_ROUTE_VENDORS) legacy[vendor.id] = savedKeys[vendor.id]
      const next = displayAiVendorRoutes(reg.aiVendorRoutes, legacy)
      const lost = AI_ROUTE_VENDORS.some((vendor) => {
        const before = routes.vendors[vendor.id]
        const after = next.vendors[vendor.id]
        if (!before || !after) return false
        return before.lines.some((line, index) => line.apiKey.trim() && !after.lines[index]?.apiKey.trim())
      })
      if (lost) {
        dirtyRef.current = true
        setHint('备选 Key 没有写进注册表，页面上刚填的内容先留着。请再点一次「保存线路」。')
        return
      }
      setRoutes(next)
      setHint('已保存。手动模式只走标成「当前线路」的那一把 Key。要让豆包改走备选 1，先点「改用这条」，再点「保存线路」。')
    } catch (e) {
      setHint(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-sm font-semibold text-slate-200">API 线路</h2>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          每个厂商一条主线路、两条备选。空着的备选不参与。对话、生图、视频共用这里的 Key。还没保存过线路时，现有 Key
          会显示在主线路，模式为手动，行为与现在一致。
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          填进备选框之后必须点「保存线路」，刷新前不会入库。手动模式下还要点该行的「改用这条」，豆包才会改用备选 1；只填写、仍显示主线路为「当前线路」时，请求还是打主线路。
        </p>
        <p className="mt-2 text-xs text-slate-500">
          厂商 Key 仍在{' '}
          <Link to="/ai-models" className="text-violet-300 underline">
            语言模型 / Key
          </Link>
          。
        </p>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            disabled={loading || saving || !routes}
            onClick={() => void save()}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存线路'}
          </button>
          <button
            type="button"
            disabled={loading || saving}
            onClick={() => void load({ force: true })}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            {loading ? '读取中…' : '重新读取'}
          </button>
        </div>
        {hint ? <p className="mt-3 text-xs text-slate-300">{hint}</p> : null}
      </section>

      <OpsEditableSection permissionKey="ai_models" className="space-y-4">
        {(routes ? AI_ROUTE_VENDORS : []).map((vendor) => {
          const route = routes?.vendors[vendor.id]
          if (!route) return null
          return (
            <section key={vendor.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-100">{vendor.label}</h3>
                <p className="text-xs text-slate-400">{activeSummary(route)}</p>
              </div>
              <div className="mb-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => updateVendor(vendor.id, { ...route, mode: 'manual' })}
                  className={
                    route.mode === 'manual'
                      ? 'rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white'
                      : 'rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-200'
                  }
                >
                  手动
                </button>
                <button
                  type="button"
                  onClick={() => updateVendor(vendor.id, { ...route, mode: 'auto' })}
                  className={
                    route.mode === 'auto'
                      ? 'rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white'
                      : 'rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-200'
                  }
                >
                  自动
                </button>
              </div>
              <div className="space-y-3">
                {LINE_INDEX.map((index) => {
                  const line = route.lines[index]
                  const selected = route.mode === 'manual' && route.active === index
                  return (
                    <div key={index} className="grid gap-2 md:grid-cols-[7rem_1fr_auto] md:items-center">
                      <input
                        value={line.label}
                        onChange={(e) => {
                          const lines = [...route.lines] as AiVendorRoute['lines']
                          lines[index] = { ...line, label: e.target.value }
                          updateVendor(vendor.id, { ...route, lines })
                        }}
                        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      />
                      <SecretInput
                        value={line.apiKey}
                        autoComplete="off"
                        placeholder={index === 0 ? '主线路 API Key' : '备选 API Key，可留空'}
                        onChange={(e) => {
                          const lines = [...route.lines] as AiVendorRoute['lines']
                          lines[index] = { ...line, apiKey: e.target.value }
                          updateVendor(vendor.id, { ...route, lines })
                        }}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
                      />
                      {route.mode === 'manual' ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-500">{line.apiKey.trim() ? '已填写' : '未填写'}</span>
                          <button
                            type="button"
                            onClick={() => updateVendor(vendor.id, { ...route, active: index })}
                            className={
                              selected
                                ? 'rounded-lg bg-slate-200 px-3 py-2 text-xs font-medium text-slate-900'
                                : 'rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-300'
                            }
                          >
                            {selected ? '当前线路' : '改用这条'}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">
                          {line.apiKey.trim() ? '已填写 · ' : '未填写 · '}
                          {index === 0 ? '先试' : `失败再试 ${index}`}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </OpsEditableSection>
    </div>
  )
}
