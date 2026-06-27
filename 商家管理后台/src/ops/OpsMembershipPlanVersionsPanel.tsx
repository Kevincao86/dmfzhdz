import { ChevronDown, ChevronUp, Loader2, Plus, Save, Settings2, Trash2 } from 'lucide-react'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '../cn'
import {
  formatPlanVersionPrice,
  listMembershipPlanVersions,
  MP_LIBRARY_ROLE_LABEL,
  MP_PERMISSION_DEFS,
  newCustomPlanVersion,
  type MpMembershipPlanVersion,
} from '../meooRegistryShared/mpMembershipCatalog'
import { fetchRegistry, saveMembershipPlanVersions } from './opsRegistryApi'

type PlanVersionRole = 'talent' | 'pr'

type Props = {
  role: PlanVersionRole
}

function parsePriceInput(raw: string): number | null {
  const s = raw.trim()
  if (!s || s === '—' || s === '-') return null
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

function quotaInputValue(cell: boolean | number | string | undefined): string {
  if (cell === '—' || cell === '-' || cell === '' || cell == null) return ''
  const n = Number(cell)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n >= 9999) return '9999'
  return String(n)
}

export default function OpsMembershipPlanVersionsPanel({ role }: Props) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<MpMembershipPlanVersion[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  const permissionDefs = MP_PERMISSION_DEFS[role]
  const groupedDefs = useMemo(() => {
    const map = new Map<string, typeof permissionDefs>()
    for (const def of permissionDefs) {
      const list = map.get(def.group) ?? []
      list.push(def)
      map.set(def.group, list)
    }
    return [...map.entries()]
  }, [permissionDefs])

  const reload = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const reg = await fetchRegistry()
      setVersions(listMembershipPlanVersions(reg, role))
    } catch {
      setErr('加载权限版本失败')
    } finally {
      setLoading(false)
    }
  }, [role])

  useEffect(() => {
    if (open) void reload()
  }, [open, reload])

  function patchVersion(id: string, patch: Partial<MpMembershipPlanVersion>) {
    setVersions((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)))
  }

  function patchPermission(id: string, key: string, value: boolean | number | string) {
    setVersions((prev) =>
      prev.map((v) =>
        v.id === id ? { ...v, permissions: { ...v.permissions, [key]: value } } : v,
      ),
    )
  }

  function onAddVersion() {
    setVersions((prev) => {
      const next = [...prev, newCustomPlanVersion(role, prev.length)]
      setExpandedId(next[next.length - 1]!.id)
      return next
    })
  }

  function onDeleteVersion(id: string) {
    const v = versions.find((x) => x.id === id)
    if (!v || v.builtin) return
    if (!window.confirm(`确定删除权限版本「${v.name}」？`)) return
    setVersions((prev) => prev.filter((x) => x.id !== id).map((x, i) => ({ ...x, sortOrder: i })))
    if (expandedId === id) setExpandedId(null)
  }

  async function onSave() {
    setSaving(true)
    setErr(null)
    setSavedMsg(null)
    try {
      const payload = versions.map((v, i) => ({ ...v, sortOrder: i }))
      const r = await saveMembershipPlanVersions({ role, versions: payload })
      if (!r.ok) {
        setErr(r.error ?? '保存失败')
        return
      }
      setSavedMsg('权限版本与定价已保存')
      await reload()
    } finally {
      setSaving(false)
    }
  }

  const roleLabel = MP_LIBRARY_ROLE_LABEL[role]

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-indigo-400" />
          <span className="text-sm font-semibold text-slate-200">权限版本与定价</span>
          <span className="text-xs text-slate-500">（{roleLabel} · 全部权限项可编辑）</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
      </button>

      {open ? (
        <div className="space-y-4 border-t border-slate-800 px-4 pb-4 pt-3">
          <p className="text-xs text-slate-500">
            配置各会员版本的权限矩阵与月付/年付价格。保存后，列表「会员档位」与「权限详情」将使用此处定义；内置四档不可删除，可改权限与价格。
          </p>

          {err ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{err}</p>
          ) : null}
          {savedMsg ? (
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              {savedMsg}
            </p>
          ) : null}

          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中…
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-lg border border-slate-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-950/80 text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">版本名称</th>
                      <th className="px-3 py-2 font-medium">月付（元）</th>
                      <th className="px-3 py-2 font-medium">年付（元）</th>
                      <th className="px-3 py-2 font-medium">定价展示</th>
                      <th className="px-3 py-2 font-medium w-40">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {versions.map((v) => (
                      <Fragment key={v.id}>
                        <tr className="hover:bg-slate-800/30">
                          <td className="px-3 py-2">
                            <input
                              value={v.name}
                              onChange={(e) => patchVersion(v.id, { name: e.target.value })}
                              className="w-full min-w-[120px] rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200"
                            />
                            {v.builtin ? (
                              <span className="mt-1 block text-[10px] text-slate-500">内置 · {v.id}</span>
                            ) : (
                              <span className="mt-1 block font-mono text-[10px] text-slate-600">{v.id}</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              placeholder="0=免费"
                              value={v.priceMonthlyYuan ?? ''}
                              onChange={(e) =>
                                patchVersion(v.id, { priceMonthlyYuan: parsePriceInput(e.target.value) })
                              }
                              className="w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              placeholder="留空=无"
                              value={v.priceYearlyYuan ?? ''}
                              onChange={(e) =>
                                patchVersion(v.id, { priceYearlyYuan: parsePriceInput(e.target.value) })
                              }
                              className="w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200"
                            />
                          </td>
                          <td className="px-3 py-2 text-xs text-indigo-300/90">{formatPlanVersionPrice(v)}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setExpandedId((cur) => (cur === v.id ? null : v.id))}
                                className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                              >
                                {expandedId === v.id ? '收起权限' : '编辑权限'}
                              </button>
                              {!v.builtin ? (
                                <button
                                  type="button"
                                  onClick={() => onDeleteVersion(v.id)}
                                  className="inline-flex items-center gap-1 rounded border border-rose-800 px-2 py-1 text-xs text-rose-300 hover:bg-rose-950/40"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  删除
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                        {expandedId === v.id ? (
                          <tr>
                            <td colSpan={5} className="bg-slate-950/50 px-3 py-3">
                              <div className="space-y-4">
                                {groupedDefs.map(([group, defs]) => (
                                  <div key={group}>
                                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                      {group}
                                    </h4>
                                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                      {defs.map((def) => {
                                        const cell = v.permissions[def.key]
                                        if (def.kind === 'boolean') {
                                          return (
                                            <label
                                              key={def.key}
                                              className="flex cursor-pointer items-start gap-2 rounded border border-slate-800 bg-slate-900/80 px-2 py-2 text-xs text-slate-300"
                                            >
                                              <input
                                                type="checkbox"
                                                checked={cell === true}
                                                onChange={(e) => patchPermission(v.id, def.key, e.target.checked)}
                                                className="mt-0.5 rounded border-slate-600"
                                              />
                                              <span>{def.label}</span>
                                            </label>
                                          )
                                        }
                                        return (
                                          <label
                                            key={def.key}
                                            className="block rounded border border-slate-800 bg-slate-900/80 px-2 py-2 text-xs text-slate-300"
                                          >
                                            <span className="mb-1 block">{def.label}</span>
                                            <input
                                              type="number"
                                              min={0}
                                              max={99999}
                                              step={1}
                                              placeholder="0=未开通"
                                              value={quotaInputValue(cell)}
                                              onChange={(e) => {
                                                const raw = e.target.value.trim()
                                                if (!raw) {
                                                  patchPermission(v.id, def.key, '—')
                                                  return
                                                }
                                                const n = Number(raw)
                                                patchPermission(
                                                  v.id,
                                                  def.key,
                                                  Number.isFinite(n) && n > 0 ? n : '—',
                                                )
                                              }}
                                              className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200"
                                            />
                                          </label>
                                        )
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onAddVersion}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
                >
                  <Plus className="h-4 w-4" />
                  新增版本
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void onSave()}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50',
                  )}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  保存全部版本
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  )
}
