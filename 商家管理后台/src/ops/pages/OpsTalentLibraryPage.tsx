import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '../../cn'
import { fetchRegistry, type RegistryTalentLibraryEntry } from '../opsRegistryApi'

type PlatformTab = '抖音' | '小红书'

export default function OpsTalentLibraryPage() {
  const [tab, setTab] = useState<PlatformTab>('抖音')
  const [entries, setEntries] = useState<RegistryTalentLibraryEntry[]>([])
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetchRegistry()
      setEntries(r.talentLibraryEntries ?? [])
    } catch {
      setEntries([])
    }
  }, [])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 8000)
    return () => window.clearInterval(t)
  }, [load])

  const rows = useMemo(() => {
    const plat = tab
    let list = entries.filter((e) => e.platform === plat)
    const needle = q.trim().toLowerCase()
    if (needle) {
      list = list.filter(
        (e) =>
          e.platformAccount.toLowerCase().includes(needle) ||
          e.platformNickname.toLowerCase().includes(needle) ||
          e.contact.toLowerCase().includes(needle) ||
          e.wechatId.toLowerCase().includes(needle) ||
          (e.province || '').toLowerCase().includes(needle) ||
          (e.city || '').toLowerCase().includes(needle),
      )
    }
    return [...list].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  }, [entries, tab, q])

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">墨典达人库</h1>
        <p className="mt-1 text-sm text-slate-500">
          达人通过小程序报名后按平台与达人 ID 去重入库；报价、联系方式等以最新一次报名为准。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex rounded-lg border border-slate-700 p-0.5">
          {(['抖音', '小红书'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setTab(p)}
              className={cn(
                'rounded-md px-4 py-2 text-sm font-medium transition-colors',
                tab === p ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white',
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索达人 ID / 昵称 / 省市 / 联系 / 微信"
          className="min-w-[200px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
        />
        <button type="button" onClick={() => void load()} className="text-xs text-indigo-400 hover:underline">
          刷新
        </button>
        <span className="text-xs text-slate-500">{tab} · {rows.length} 人</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead className="border-b border-slate-800 text-[11px] font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3">达人 ID</th>
                <th className="px-3 py-3">昵称</th>
                <th className="px-3 py-3">省份</th>
                <th className="px-3 py-3">城市</th>
                <th className="px-3 py-3">粉丝</th>
                {tab === '抖音' ? <th className="px-3 py-3">带货等级</th> : null}
                <th className="px-3 py-3">报价</th>
                <th className="px-3 py-3">主页链接</th>
                <th className="px-3 py-3">联系 / 微信</th>
                <th className="px-3 py-3">收款方式</th>
                <th className="px-3 py-3">更新时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={tab === '抖音' ? 11 : 10} className="px-3 py-10 text-center text-sm text-slate-500">
                    暂无{tab}达人记录。小程序报名成功后将自动写入。
                  </td>
                </tr>
              ) : (
                rows.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-800/30">
                    <td className="px-3 py-2 font-mono text-xs text-slate-300">{e.platformAccount}</td>
                    <td className="px-3 py-2 text-slate-200">{e.platformNickname}</td>
                    <td className="px-3 py-2 text-slate-400">{e.province || '—'}</td>
                    <td className="px-3 py-2 text-slate-400">{e.city || '—'}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-400">{e.followers.toLocaleString('zh-CN')}</td>
                    {tab === '抖音' ? (
                      <td className="px-3 py-2 text-slate-400">{e.douyinSalesLevel || '—'}</td>
                    ) : null}
                    <td className="px-3 py-2 text-emerald-300">{e.quotePrice || '—'}</td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-xs text-sky-300" title={e.profileLink}>
                      {e.profileLink ? (
                        <a href={e.profileLink} target="_blank" rel="noreferrer" className="hover:underline">
                          {e.profileLink}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      {e.contact || '—'}
                      <br />
                      {e.wechatId || '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">{e.paymentMethod || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500">{e.updatedAt}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
