import { ArrowLeft, Check, Eye, Loader2, Shield, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import {
  MP_LIBRARY_ROLE_LABEL,
  MP_MEMBERSHIP_TIER_OPTIONS,
  MP_PERMISSION_DEFS,
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
import { libraryRoleToPermissionKey, readOpsSession, sessionCanEditModule } from '../opsStaffAuth'
import { OpsEditableSection } from '../useOpsModuleEdit'

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
  mpFeatureAccess?: { addons?: boolean; recommendHall?: boolean; overrides?: Record<string, boolean | number | string> }
  prFeatureAccess?: { addons?: boolean; recommendHall?: boolean; overrides?: Record<string, boolean | number | string> }
}

function readStoredOverrides(record: LoadedEntry): Record<string, boolean | number | string> {
  const raw = record.prFeatureAccess ?? record.mpFeatureAccess
  return { ...(raw?.overrides ?? {}) }
}

function defForKey(kind: LibraryKind, key: string) {
  return (MP_PERMISSION_DEFS[kind] ?? []).find((d) => d.key === key)
}

function overrideCellValue(
  overrides: Record<string, boolean | number | string>,
  key: string,
): boolean | number | string | undefined {
  if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key]
  return undefined
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
  const [permissionOverrides, setPermissionOverrides] = useState<Record<string, boolean | number | string>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const permKey = kind ? libraryRoleToPermissionKey(kind) : null
  const canEdit = permKey ? sessionCanEditModule(readOpsSession(), permKey) : false

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
        setPermissionOverrides(readStoredOverrides(hit))
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
    const accessPatch = {
      addons: permissionOverrides.addons === true ? true : permissionOverrides.addons === false ? false : undefined,
      recommendHall:
        permissionOverrides.recommendHall === true
          ? true
          : permissionOverrides.recommendHall === false
            ? false
            : undefined,
      overrides: permissionOverrides,
    }
    return resolveMpPermissionRows(
      kind,
      {
        mpMembershipPlan: plan,
        mpFeatureAccess: accessPatch,
        prFeatureAccess: accessPatch,
      },
      versions,
    )
  }, [entry, kind, plan, permissionOverrides, planVersions])

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
    if (!canEdit || !kind || !entry) return
    setSaving(true)
    setErr(null)
    setSavedMsg(null)
    try {
      const r = await patchMpLibraryPermissions({
        kind,
        id: entry.id,
        membershipPlan: plan,
        permissionOverrides,
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
            {!canEdit ? <span className="ml-2 text-sm font-normal text-amber-300/90">· 仅查看</span> : null}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {entry.title}
            <span className="ml-2 font-mono text-xs text-slate-500">{entry.subtitle}</span>
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave()}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            保存权限
          </button>
        ) : null}
      </div>

      {err ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{err}</p>
      ) : null}
      {savedMsg ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {savedMsg}
        </p>
      ) : null}

      <OpsEditableSection permissionKey={permKey ?? undefined}>
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">会员档位</h2>
        <p className="mb-3 text-xs text-slate-500">
          选择权限版本后，可在下方逐项勾选/填写配额；保存后实时同步至星选履约 Web 与小程序。
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
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Eye className="h-4 w-4 text-violet-400" />
          全部权限（可逐项勾选 / 配额）
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          视频检核配额单位为「分钟/月」，其余次数类为「次/月」。超出套餐配额后按积分扣费（视频 2 积分/秒，文稿 2 积分/次，Brief 5 积分/篇）。
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
                      <th className="px-3 py-2 font-medium w-40">运营设置</th>
                      <th className="px-3 py-2 font-medium w-16">状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {rows.map((row) => {
                      const def = kind ? defForKey(kind, row.key) : undefined
                      const ov = overrideCellValue(permissionOverrides, row.key)
                      return (
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
                          {canEdit && def?.kind === 'boolean' ? (
                            <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                              <input
                                type="checkbox"
                                checked={ov === true || (ov === undefined && row.enabled)}
                                onChange={(e) =>
                                  setPermissionOverrides((prev) => ({
                                    ...prev,
                                    [row.key]: e.target.checked,
                                  }))
                                }
                                className="rounded border-slate-600"
                              />
                              开通
                            </label>
                          ) : null}
                          {canEdit && def?.kind === 'quota' ? (
                            <input
                              type="number"
                              min={0}
                              max={99999}
                              placeholder="—"
                              value={
                                typeof ov === 'number'
                                  ? ov
                                  : ov === '—' || ov === '-'
                                    ? ''
                                    : typeof ov === 'string' && /^\d+$/.test(ov)
                                      ? Number(ov)
                                      : ''
                              }
                              onChange={(e) => {
                                const raw = e.target.value.trim()
                                setPermissionOverrides((prev) => {
                                  const next = { ...prev }
                                  if (!raw) {
                                    next[row.key] = '—'
                                  } else {
                                    next[row.key] = Math.min(99999, Math.max(0, Math.floor(Number(raw) || 0)))
                                  }
                                  return next
                                })
                              }}
                              className="w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                            />
                          ) : null}
                          {canEdit && def?.kind === 'text' ? (
                            <input
                              type="text"
                              value={typeof ov === 'string' ? ov : ''}
                              onChange={(e) =>
                                setPermissionOverrides((prev) => ({
                                  ...prev,
                                  [row.key]: e.target.value,
                                }))
                              }
                              className="w-full max-w-[10rem] rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                            />
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          {row.enabled ? (
                            <Check className="h-4 w-4 text-emerald-400" aria-label="已开通" />
                          ) : (
                            <X className="h-4 w-4 text-slate-600" aria-label="未开通" />
                          )}
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>
      </OpsEditableSection>
    </div>
  )
}
