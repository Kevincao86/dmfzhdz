import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye } from 'lucide-react'
import { cn } from '../../cn'
import { normalizeMpMembershipTier, tierLabel } from '../../meooRegistryShared/mpMembershipCatalog'
import type { RegistryMpTalentMember } from '../../meooRegistryShared/opsRegistryTypes'
import {
  deleteMpLibraryEntries,
  fetchRegistry,
  syncSupplierTeamLibrary,
  type RegistrySupplierTeamLibraryEntry,
} from '../opsRegistryApi'
import { useOpsBatchSelection } from '../useOpsBatchSelection'
import OpsPageHero from '../OpsPageHero'
import { resolveLibraryAccountCreatedAt } from '../opsLibraryCreatedAt'
import type { OpsPageHeroKey } from '../opsPageHeroConfig'
import OpsMembershipPlanVersionsPanel from '../OpsMembershipPlanVersionsPanel'

type TeamRole = 'shoot' | 'edit'

const META: Record<TeamRole, { title: string; desc: string; idLabel: string }> = {
  shoot: {
    title: '拍摄团队库',
    desc: '小程序与履约 Web 注册为拍摄团队后自动入库（LQ-PS- 编号）；亦可手动扫描会员池补全。',
    idLabel: 'LQ-PS',
  },
  edit: {
    title: '剪辑团队库',
    desc: '小程序与履约 Web 注册为剪辑团队后自动入库（LQ-J- 编号）；亦可手动扫描会员池补全。',
    idLabel: 'LQ-J',
  },
}

const HERO_KEY: Record<TeamRole, OpsPageHeroKey> = {
  shoot: 'shoot-team-library',
  edit: 'edit-team-library',
}

type Props = { role: TeamRole }

export default function OpsSupplierTeamLibraryPage({ role }: Props) {
  const meta = META[role]
  const [entries, setEntries] = useState<RegistrySupplierTeamLibraryEntry[]>([])
  const [membersById, setMembersById] = useState<Record<string, RegistryMpTalentMember>>({})
  const [memberCount, setMemberCount] = useState(0)
  const [q, setQ] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [syncErr, setSyncErr] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetchRegistry()
      setMemberCount(r.mpTalentMembers?.length ?? 0)
      const memberMap: Record<string, RegistryMpTalentMember> = {}
      for (const m of r.mpTalentMembers ?? []) memberMap[m.id] = m
      setMembersById(memberMap)
      setEntries(
        role === 'shoot' ? (r.shootTeamLibraryEntries ?? []) : (r.editTeamLibraryEntries ?? []),
      )
    } catch {
      setEntries([])
      setMembersById({})
      setMemberCount(0)
    }
  }, [role])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 8000)
    return () => window.clearInterval(t)
  }, [load])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let list = [...entries]
    if (needle) {
      list = list.filter((e) => {
        const blob = [
          e.lingqiTeamId,
          e.lingqiTalentId,
          e.wxNickName,
          e.contact,
          e.wechatId,
          e.platformAccount,
          e.platformNickname,
          e.province,
          e.city,
          ...(e.accountTags || []),
        ]
          .join(' ')
          .toLowerCase()
        return blob.includes(needle)
      })
    }
    return list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  }, [entries, q])

  const rowIds = useMemo(() => rows.map((e) => e.id), [rows])
  const batch = useOpsBatchSelection(rowIds)

  async function onBatchDelete() {
    if (!batch.checkedIds.length || batch.deleting) return
    const label = role === 'shoot' ? '拍摄' : '剪辑'
    if (
      !window.confirm(
        `确定删除选中的 ${batch.checkedIds.length} 条${label}团队记录？\n将同步清除注册表会员，履约 Web / 小程序刷新后可重新注册。`,
      )
    ) {
      return
    }
    batch.setDeleting(true)
    try {
      const r = await deleteMpLibraryEntries({ kind: role, ids: batch.checkedIds })
      if (!r.ok) {
        window.alert(r.error ?? '删除失败')
        return
      }
      batch.clearChecked(batch.checkedIds)
      await load()
    } finally {
      batch.setDeleting(false)
    }
  }

  async function onSync() {
    setSyncing(true)
    setSyncMsg('')
    setSyncErr('')
    try {
      const res = await syncSupplierTeamLibrary(role)
      const count = role === 'shoot' ? res.shootCount : res.editCount
      setSyncMsg(`扫描完成：${count} 条${role === 'shoot' ? '拍摄' : '剪辑'}团队（${meta.idLabel}- 编号）`)
      await load()
    } catch (e) {
      setSyncErr(e instanceof Error ? e.message : '扫描失败')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <OpsPageHero heroKey={HERO_KEY[role]} title={meta.title} description={meta.desc} />

      <OpsMembershipPlanVersionsPanel role={role} />

      <div className="ops-panel flex flex-wrap items-center gap-3 rounded-xl border p-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`搜索 ${meta.idLabel} ID / 昵称 / 联系 / 微信 / 标签`}
          className="min-w-[200px] flex-1 rounded-lg border border-[var(--ops-border)] bg-[var(--ops-input-bg)] px-3 py-2 text-sm text-[var(--ops-input-text)]"
        />
        <button
          type="button"
          disabled={syncing}
          onClick={() => void onSync()}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            syncing
              ? 'cursor-not-allowed bg-indigo-900/50 text-indigo-300'
              : 'bg-indigo-600 text-white hover:bg-indigo-500',
          )}
        >
          {syncing ? '扫描中…' : '扫描会员池'}
        </button>
        {batch.checkedIds.length > 0 ? (
          <button
            type="button"
            disabled={batch.deleting}
            onClick={() => void onBatchDelete()}
            className="rounded-lg border border-rose-700 bg-rose-950/40 px-3 py-2 text-sm text-rose-300 hover:bg-rose-950 disabled:opacity-50"
          >
            {batch.deleting ? '删除中…' : `批量删除（${batch.checkedIds.length}）`}
          </button>
        ) : null}
        <button type="button" onClick={() => void load()} className="text-xs text-indigo-500 hover:underline">
          刷新
        </button>
        <span className="ops-muted text-xs">
          会员池 {memberCount} · 库内 {rows.length} 条
        </span>
      </div>

      {syncMsg ? <p className="text-sm text-emerald-600">{syncMsg}</p> : null}
      {syncErr ? <p className="text-sm text-red-500">{syncErr}</p> : null}

      <div className="ops-library-panel overflow-hidden">
        <table className="ops-library-table w-full">
          <thead>
            <tr>
              <th className="w-10">
                <input
                  type="checkbox"
                  checked={batch.allVisibleChecked}
                  onChange={batch.toggleAllVisible}
                  aria-label="全选"
                />
              </th>
              <th>昵称 / {meta.idLabel} ID</th>
              <th>平台账号</th>
              <th>联系</th>
              <th>地区</th>
              <th>来源</th>
              <th>会员档位</th>
              <th className="text-right">操作</th>
              <th>账号创建时间</th>
              <th>更新时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="ops-muted px-4 py-10 text-center">
                  暂无数据；前端注册拍摄/剪辑团队后将自动入库，或点击「扫描会员池」补全历史数据
                </td>
              </tr>
            ) : (
              rows.map((e) => {
                const member = e.memberId ? membersById[e.memberId] : undefined
                const listBase = role === 'shoot' ? 'shoot-team-library' : 'edit-team-library'
                return (
                <tr key={e.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={batch.checkedIds.includes(e.id)}
                      onChange={() => batch.toggleRow(e.id)}
                      aria-label={`选择 ${e.lingqiTeamId || e.id}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{e.wxNickName || '—'}</div>
                    <div className="font-mono text-[11px] text-indigo-500">
                      {e.lingqiTeamId || e.lingqiTalentId || e.memberId || '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{e.platform || '—'}</div>
                    <div className="ops-muted text-xs">{e.platformNickname || e.platformAccount || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{e.contact || '—'}</div>
                    <div className="ops-muted text-xs">{e.wechatId || ''}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {[e.province, e.city].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {e.sourceChannel === 'mp' ? '小程序' : e.sourceChannel === 'web' ? '履约 Web' : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {tierLabel(normalizeMpMembershipTier(member?.mpMembershipPlan))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {e.memberId ? (
                      <Link
                        to={`/${listBase}/${encodeURIComponent(e.id)}/permissions`}
                        className="inline-flex items-center gap-1 rounded-md bg-indigo-600/90 px-2.5 py-1 text-xs text-white hover:bg-indigo-500"
                      >
                        <Eye className="h-3 w-3" />
                        权限详情
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-500">未关联会员</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-xs ops-muted">
                    {resolveLibraryAccountCreatedAt(e, member)}
                  </td>
                  <td className="whitespace-nowrap text-xs ops-muted">{e.updatedAt}</td>
                </tr>
              )})
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
