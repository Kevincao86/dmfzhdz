import { ArrowLeft, Check, Eye, Loader2, Shield, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import {
  MP_LIBRARY_ROLE_LABEL,
  MP_MEMBERSHIP_TIER_OPTIONS,
  formatPlanVersionPrice,
  listMembershipPlanVersions,
  normalizeMpMembershipTier,
  resolveMpPermissionRows,
  resolvePlanVersionLabel,
  type MpLibraryRole,
  type MpMembershipPlanVersion,
} from '../../meooRegistryShared/mpMembershipCatalog'
import { findMemberForLibraryEntry } from '../../meooRegistryShared/talentLibraryFilters'
import { fetchRegistry, patchMpLibraryPermissions } from '../opsRegistryApi'

type LibraryKind = MpLibraryRole

const LIST_PATH: Record<LibraryKind, string> = {
  pr: '/pr-library',
  talent: '/talent-library',
  shoot: '/shoot-team-library',
  edit: '/edit-team-library',
}

type LoadedEntry = {
  id: string
  title: string
  subtitle: string
  mpMembershipPlan?: string
  mpFeatureAccess?: { addons?: boolean; recommendHall?: boolean }
  prFeatureAccess?: { addons?: boolean; recommendHall?: boolean }
}

function readAccess(record: LoadedEntry) {
  const raw = record.prFeatureAccess ?? record.mpFeatureAccess
  return {
    addons: raw?.addons === true,
    recommendHall: raw?.recommendHall === true,
  }
}

function findEntry(
  kind: LibraryKind,
  entryId: string,
  reg: Awaited<ReturnType<typeof fetchRegistry>>,
): LoadedEntry | null {
  if (kind === 'pr') {
    const u = (reg.mpPrUsers ?? []).find((x) => x.id === entryId || x.lingqiPrId === entryId)
    if (!u) return null
    return {
      id: u.id,
      title: u.accountType === 'personal' ? u.personalName || u.lingqiPrId : u.companyName || u.lingqiPrId,
      subtitle: u.lingqiPrId,
      mpMembershipPlan: u.mpMembershipPlan,
      prFeatureAccess: u.prFeatureAccess,
    }
  }
  if (kind === 'talent') {
    const e = (reg.talentLibraryEntries ?? []).find(
      (x) => x.id === entryId || x.lingqiTalentId === entryId,
    )
    if (!e) return null
    const member = findMemberForLibraryEntry(e, reg.mpTalentMembers ?? [])
    const access = member?.mpFeatureAccess ?? e.mpFeatureAccess
    const plan = member?.mpMembershipPlan ?? e.mpMembershipPlan
    return {
      id: e.id,
      title: e.platformNickname || e.platformAccount,
      subtitle: e.lingqiTalentId || e.platformAccount,
      mpMembershipPlan: plan,
      mpFeatureAccess: access,
    }
  }
  const listKey = kind === 'shoot' ? 'shootTeamLibraryEntries' : 'editTeamLibraryEntries'
  const team = (reg[listKey] ?? []).find((x) => x.id === entryId)
  if (!team) return null
  const member = team.memberId
    ? (reg.mpTalentMembers ?? []).find((m) => m.id === team.memberId)
    : undefined
  return {
    id: team.id,
    title: team.wxNickName || team.lingqiTeamId || team.id,
    subtitle: team.lingqiTeamId || team.memberId || team.id,
    mpMembershipPlan: member?.mpMembershipPlan,
    mpFeatureAccess: member?.mpFeatureAccess,
  }
}

function kindFromPath(pathname: string): LibraryKind | null {
  if (pathname.includes('/pr-library/')) return 'pr'
  if (pathname.includes('/talent-library/')) return 'talent'
  if (pathname.includes('/shoot-team-library/')) return 'shoot'
  if (pathname.includes('/edit-team-library/')) return 'edit'
  return null
}

export default function OpsMpLibraryPermissionPage() {
  const { entryId } = useParams()
  const location = useLocation()
  const kind = kindFromPath(location.pathname)

  const [entry, setEntry] = useState<LoadedEntry | null | undefined>(undefined)
  const [planVersions, setPlanVersions] = useState<MpMembershipPlanVersion[]>([])
  const [plan, setPlan] = useState<string>('basic')
  const [addons, setAddons] = useState(false)
  const [recommendHall, setRecommendHall] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!kind || !entryId) {
      setEntry(null)
      return
    }
    try {
      const reg = await fetchRegistry()
      const hit = findEntry(kind, entryId, reg)
      setEntry(hit)
      if (kind === 'pr' || kind === 'talent' || kind === 'shoot' || kind === 'edit') {
        setPlanVersions(listMembershipPlanVersions(reg, kind))
      } else {
        setPlanVersions([])
      }
      if (hit) {
        setPlan(String(hit.mpMembershipPlan || 'basic').trim() || 'basic')
        const access = readAccess(hit)
        setAddons(access.addons)
        setRecommendHall(access.recommendHall)
      }
    } catch {
      setEntry(null)
    }
  }, [kind, entryId])

  useEffect(() => {
    void reload()
  }, [reload])

  const permissionRows = useMemo(() => {
    if (!entry || !kind) return []
    const versions = kind === 'pr' || kind === 'talent' || kind === 'shoot' || kind === 'edit' ? planVersions : undefined
    return resolveMpPermissionRows(
      kind,
      {
        mpMembershipPlan: plan,
        mpFeatureAccess: { addons, recommendHall },
        prFeatureAccess: { addons, recommendHall },
      },
      versions,
    )
  }, [entry, kind, plan, addons, recommendHall, planVersions])

  const selectedPlanVersion = useMemo(
    () => planVersions.find((v) => v.id === plan),
    [planVersions, plan],
  )

  const grouped = useMemo(() => {
    const map = new Map<string, typeof permissionRows>()
    for (const row of permissionRows) {
      const list = map.get(row.group) ?? []
      list.push(row)
      map.set(row.group, list)
    }
    return [...map.entries()]
  }, [permissionRows])

  async function onSave() {
    if (!kind || !entry) return
    setSaving(true)
    setErr(null)
    setSavedMsg(null)
    try {
      const r = await patchMpLibraryPermissions({
        kind,
        id: entry.id,
        membershipPlan: plan,
        addons,
        recommendHall,
      })
      if (!r.ok) {
        setErr(r.error ?? '保存失败')
        return
      }
      setSavedMsg('权限已保存，同步至履约 Web / 小程序')
      await reload()
    } finally {
      setSaving(false)
    }
  }

  if (!kind) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center text-sm text-slate-500">
        无效的库类型
        <Link to="/" className="mt-4 block text-indigo-400 hover:underline">
          返回首页
        </Link>
      </div>
    )
  }

  if (entry === undefined) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center text-sm text-slate-500">
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
        加载中…
      </div>
    )
  }

  if (!entry) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-8 text-center">
        <p className="text-slate-400">未找到该用户，请返回列表刷新后重试。</p>
        <Link to={LIST_PATH[kind]} className="mt-4 inline-block text-sm text-indigo-400 hover:underline">
          返回{MP_LIBRARY_ROLE_LABEL[kind]}库
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to={LIST_PATH[kind]}
            className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-300"
          >
            <ArrowLeft className="h-4 w-4" />
            返回{MP_LIBRARY_ROLE_LABEL[kind]}库
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
            <Shield className="h-5 w-5 text-indigo-400" />
            权限详情
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {entry.title}
            <span className="ml-2 font-mono text-xs text-slate-500">{entry.subtitle}</span>
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void onSave()}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          保存权限
        </button>
      </div>

      {err ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{err}</p>
      ) : null}
      {savedMsg ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {savedMsg}
        </p>
      ) : null}

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">会员档位</h2>
        <p className="mb-3 text-xs text-slate-500">
          选择权限版本后下方矩阵按运营台「权限版本与定价」配置展示；运营可单独覆盖增值服务与推荐大厅。
        </p>
        {kind === 'pr' || kind === 'talent' || kind === 'shoot' || kind === 'edit' ? (
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
          >
            {planVersions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} · {formatPlanVersionPrice(o)}
              </option>
            ))}
          </select>
        ) : (
          <select
            value={normalizeMpMembershipTier(plan)}
            onChange={(e) => setPlan(e.target.value)}
            className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
          >
            {MP_MEMBERSHIP_TIER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        <p className="mt-2 text-xs text-indigo-300/90">
          当前档位：{resolvePlanVersionLabel(plan, planVersions)}
          {selectedPlanVersion ? ` · ${formatPlanVersionPrice(selectedPlanVersion)}` : ''}
        </p>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">运营手动覆盖</h2>
        <div className="flex flex-wrap gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={addons}
              onChange={(e) => setAddons(e.target.checked)}
              className="rounded border-slate-600"
            />
            增值服务（addons）
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={recommendHall}
              onChange={(e) => setRecommendHall(e.target.checked)}
              className="rounded border-slate-600"
            />
            推荐大厅（recommendHall）
          </label>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          勾选后立即生效于星选履约端；未勾选时按档位默认（基础版通常为未开通）。
        </p>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Eye className="h-4 w-4 text-violet-400" />
          全部权限开通情况
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          「版本默认」来自权限版本配置；「当前生效」含运营手动覆盖项。
        </p>
        <div className="space-y-5">
          {grouped.map(([group, rows]) => (
            <div key={group}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</h3>
              <div className="overflow-hidden rounded-lg border border-slate-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-950/80 text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">权限项</th>
                      <th className="px-3 py-2 font-medium">版本默认</th>
                      <th className="px-3 py-2 font-medium">当前生效</th>
                      <th className="px-3 py-2 font-medium w-16">状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {rows.map((row) => (
                      <tr key={row.key} className="hover:bg-slate-800/30">
                        <td className="px-3 py-2 text-slate-200">
                          {row.label}
                          {row.opsOverride ? (
                            <span className="ml-1 text-[10px] text-amber-500">可运营覆盖</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-slate-400">{row.tierDefault}</td>
                        <td className="px-3 py-2 text-slate-300">{row.effective}</td>
                        <td className="px-3 py-2">
                          {row.enabled ? (
                            <Check className="h-4 w-4 text-emerald-400" aria-label="已开通" />
                          ) : (
                            <X className="h-4 w-4 text-slate-600" aria-label="未开通" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
