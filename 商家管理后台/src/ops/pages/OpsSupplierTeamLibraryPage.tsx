import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '../../cn'
import {
  fetchRegistry,
  syncSupplierTeamLibrary,
  type RegistrySupplierTeamLibraryEntry,
} from '../opsRegistryApi'

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

type Props = { role: TeamRole }

export default function OpsSupplierTeamLibraryPage({ role }: Props) {
  const meta = META[role]
  const [entries, setEntries] = useState<RegistrySupplierTeamLibraryEntry[]>([])
  const [memberCount, setMemberCount] = useState(0)
  const [q, setQ] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [syncErr, setSyncErr] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetchRegistry()
      setMemberCount(r.mpTalentMembers?.length ?? 0)
      setEntries(
        role === 'shoot' ? (r.shootTeamLibraryEntries ?? []) : (r.editTeamLibraryEntries ?? []),
      )
    } catch {
      setEntries([])
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
      <div>
        <h1 className="text-xl font-semibold">{meta.title}</h1>
        <p className="ops-muted mt-1 text-sm">{meta.desc}</p>
      </div>

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
        <button type="button" onClick={() => void load()} className="text-xs text-indigo-500 hover:underline">
          刷新
        </button>
        <span className="ops-muted text-xs">
          会员池 {memberCount} · 库内 {rows.length} 条
        </span>
      </div>

      {syncMsg ? <p className="text-sm text-emerald-600">{syncMsg}</p> : null}
      {syncErr ? <p className="text-sm text-red-500">{syncErr}</p> : null}

      <div className="ops-panel overflow-hidden rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--ops-border)] bg-[var(--ops-hover)] text-xs">
            <tr>
              <th className="ops-muted px-4 py-3 font-medium">昵称 / {meta.idLabel} ID</th>
              <th className="ops-muted px-4 py-3 font-medium">平台账号</th>
              <th className="ops-muted px-4 py-3 font-medium">联系</th>
              <th className="ops-muted px-4 py-3 font-medium">地区</th>
              <th className="ops-muted px-4 py-3 font-medium">来源</th>
              <th className="ops-muted px-4 py-3 font-medium">更新</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ops-border)]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="ops-muted px-4 py-10 text-center">
                  暂无数据；前端注册拍摄/剪辑团队后将自动入库，或点击「扫描会员池」补全历史数据
                </td>
              </tr>
            ) : (
              rows.map((e) => (
                <tr key={e.id} className="hover:bg-[var(--ops-hover)]">
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
                  <td className="ops-muted px-4 py-3 text-xs">{e.updatedAt}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
