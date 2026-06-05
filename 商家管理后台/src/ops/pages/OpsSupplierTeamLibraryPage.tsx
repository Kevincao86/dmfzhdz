import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '../../cn'
import {
  fetchRegistry,
  syncSupplierTeamLibrary,
  type RegistrySupplierTeamLibraryEntry,
} from '../opsRegistryApi'

type TeamRole = 'shoot' | 'edit'

const META: Record<
  TeamRole,
  { title: string; desc: string; syncLabel: string }
> = {
  shoot: {
    title: '拍摄团队库',
    desc: '从灵祺达人会员（小程序 + 履约 Web）扫描拍摄/跟拍标签，同步账号信息入库。',
    syncLabel: '同步拍摄团队库',
  },
  edit: {
    title: '剪辑团队库',
    desc: '从灵祺达人会员（小程序 + 履约 Web）扫描剪辑/后期标签，同步账号信息入库。',
    syncLabel: '同步剪辑团队库',
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
      setSyncMsg(`同步完成：${count} 条${role === 'shoot' ? '拍摄' : '剪辑'}团队记录`)
      await load()
    } catch (e) {
      setSyncErr(e instanceof Error ? e.message : '同步失败')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">{meta.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{meta.desc}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索达人 ID / 昵称 / 联系 / 微信 / 标签"
          className="min-w-[200px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
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
          {syncing ? '同步中…' : meta.syncLabel}
        </button>
        <button type="button" onClick={() => void load()} className="text-xs text-indigo-400 hover:underline">
          刷新
        </button>
        <span className="text-xs text-slate-500">
          会员池 {memberCount} · 库内 {rows.length} 条
        </span>
      </div>

      {syncMsg ? <p className="text-sm text-emerald-400">{syncMsg}</p> : null}
      {syncErr ? <p className="text-sm text-red-400">{syncErr}</p> : null}

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-950/80 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">昵称 / ID</th>
              <th className="px-4 py-3 font-medium">平台账号</th>
              <th className="px-4 py-3 font-medium">联系</th>
              <th className="px-4 py-3 font-medium">地区</th>
              <th className="px-4 py-3 font-medium">来源</th>
              <th className="px-4 py-3 font-medium">更新</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  暂无数据，点击「{meta.syncLabel}」从会员池扫描入库
                </td>
              </tr>
            ) : (
              rows.map((e) => (
                <tr key={e.id} className="text-slate-300 hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{e.wxNickName || '—'}</div>
                    <div className="font-mono text-[11px] text-indigo-400/90">{e.lingqiTalentId || e.memberId || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{e.platform || '—'}</div>
                    <div className="text-xs text-slate-500">{e.platformNickname || e.platformAccount || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{e.contact || '—'}</div>
                    <div className="text-xs text-slate-500">{e.wechatId || ''}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {[e.province, e.city].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {e.sourceChannel === 'mp' ? '小程序' : e.sourceChannel === 'web' ? '履约 Web' : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{e.updatedAt}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
