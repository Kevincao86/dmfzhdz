import { Megaphone, RefreshCw, Send, Smartphone } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '../../cn'
import { RECRUITMENT_PLATFORMS } from '../../meooRegistryShared/recruitmentInfoFilter'
import {
  buildMpAnnouncementMemberContext,
  countValidTalentLibraryEntries,
  previewMpAnnouncementRecipients,
  TALENT_DOUYIN_LEVEL_OPTS,
  TALENT_FOLLOWER_TIER_OPTS,
  type MpOpsAnnouncementTargetFilter,
} from '../../meooRegistryShared/mpOpsAnnouncementFilters'
import { fetchRegistry, type RegistryMpTalentMember, type RegistryTalentLibraryEntry } from '../opsRegistryApi'
import { useOpsBatchSelection } from '../useOpsBatchSelection'
import {
  fetchOpsMpAnnouncements,
  sendOpsMpAnnouncement,
  type OpsMpAnnouncementRow,
} from '../opsMpAnnouncementsApi'
import { readOpsSession } from '../opsStaffAuth'

function toggleChip(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

export default function OpsMpAnnouncementsPage() {
  const [members, setMembers] = useState<RegistryMpTalentMember[]>([])
  const [libraryEntries, setLibraryEntries] = useState<RegistryTalentLibraryEntry[]>([])
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')

  const [provinces, setProvinces] = useState<string[]>([])
  const [cities, setCities] = useState<string[]>([])
  const [platforms, setPlatforms] = useState<string[]>([])
  const [douyinLevels, setDouyinLevels] = useState<string[]>([])
  const [followerTiers, setFollowerTiers] = useState<string[]>([])

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [showHomePopup, setShowHomePopup] = useState(true)
  const [sending, setSending] = useState(false)
  const [sendMsg, setSendMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const [history, setHistory] = useState<OpsMpAnnouncementRow[]>([])
  const [historyErr, setHistoryErr] = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  const loadMembers = useCallback(async () => {
    try {
      const r = await fetchRegistry()
      const list = (r.mpTalentMembers ?? []).filter((m) => {
        const w = String(m.workIdentity || 'talent').trim()
        return !w || w === 'talent'
      })
      setMembers(list)
      setLibraryEntries(r.talentLibraryEntries ?? [])
      setLoadErr(null)
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e))
      setMembers([])
      setLibraryEntries([])
    }
  }, [])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    const r = await fetchOpsMpAnnouncements()
    setHistoryLoading(false)
    if (!r.ok) {
      setHistoryErr(r.hint ?? r.detail ?? r.error)
      setHistory([])
      return
    }
    setHistoryErr(null)
    setHistory(r.rows)
  }, [])

  useEffect(() => {
    void loadMembers()
    void loadHistory()
  }, [loadMembers, loadHistory])

  const memberCtx = useMemo(
    () => buildMpAnnouncementMemberContext(members, libraryEntries),
    [members, libraryEntries],
  )
  const announceableMembers = memberCtx.announceableMembers

  const talentLibraryCount = useMemo(() => countValidTalentLibraryEntries(libraryEntries), [libraryEntries])

  const provinceOpts = useMemo(() => {
    const set = new Set<string>()
    for (const m of announceableMembers) {
      const linked = memberCtx.linkedEntriesByMemberId.get(m.id) ?? []
      const p = String(m.province || linked[0]?.province || '').trim()
      if (p) set.add(p)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [announceableMembers, memberCtx])

  const cityOpts = useMemo(() => {
    const set = new Set<string>()
    for (const m of announceableMembers) {
      const linked = memberCtx.linkedEntriesByMemberId.get(m.id) ?? []
      const province = String(m.province || linked[0]?.province || '').trim()
      if (provinces.length && !provinces.includes(province)) continue
      const c = String(m.city || linked[0]?.city || '').trim()
      if (c) set.add(c)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [announceableMembers, memberCtx, provinces])

  const filterState: MpOpsAnnouncementTargetFilter = useMemo(
    () => ({
      provinces,
      cities,
      platforms,
      douyinSalesLevels: douyinLevels,
      followerTiers,
    }),
    [provinces, cities, platforms, douyinLevels, followerTiers],
  )

  const filteredMembers = useMemo(() => {
    const list = previewMpAnnouncementRecipients(members, filterState, libraryEntries, memberCtx)
    const q = keyword.trim().toLowerCase()
    if (!q) return list
    return list.filter((m) =>
      (memberCtx.displayLabelByMemberId.get(m.id) ?? '').toLowerCase().includes(q),
    )
  }, [members, libraryEntries, filterState, keyword, memberCtx])

  const tableRows = useMemo(
    () =>
      filteredMembers.map((m) => {
        const linked = memberCtx.linkedEntriesByMemberId.get(m.id) ?? []
        const lib = linked[0]
        const profiles = memberCtx.profilesByMemberId.get(m.id) ?? []
        return {
          id: m.id,
          label: memberCtx.displayLabelByMemberId.get(m.id) ?? m.id,
          region: [m.province || lib?.province, m.city || lib?.city].filter(Boolean).join(' ') || '—',
          platformText:
            profiles
              .map((p) => `${p.platform}${p.profile.followers ? ` ${p.profile.followers}` : ''}`)
              .join(' · ') || '—',
        }
      }),
    [filteredMembers, memberCtx],
  )

  const rowIds = useMemo(() => filteredMembers.map((m) => m.id), [filteredMembers])
  const batch = useOpsBatchSelection(rowIds)
  const checkedSet = useMemo(() => new Set(batch.checkedIds), [batch.checkedIds])

  const targetFilter = useMemo((): MpOpsAnnouncementTargetFilter => {
    if (batch.checkedIds.length) {
      return { ...filterState, selectedMemberIds: batch.checkedIds }
    }
    return filterState
  }, [filterState, batch.checkedIds])

  const previewCount = useMemo(() => {
    if (!batch.checkedIds.length) return filteredMembers.length
    return filteredMembers.filter((m) => checkedSet.has(m.id)).length
  }, [filteredMembers, batch.checkedIds.length, checkedSet])

  async function onSend() {
    if (sending) return
    const t = title.trim()
    const b = body.trim()
    if (!t || !b) {
      setSendMsg({ tone: 'err', text: '请填写公告标题与正文' })
      return
    }
    if (previewCount <= 0) {
      setSendMsg({ tone: 'err', text: '没有命中任何达人，请调整筛选或勾选达人' })
      return
    }
    if (
      !window.confirm(
        `将向 ${previewCount} 位达人推送公告${showHomePopup ? '（首页弹窗 + 消息通知）' : '（仅消息通知）'}，确认发送？`,
      )
    ) {
      return
    }
    setSending(true)
    setSendMsg(null)
    const session = readOpsSession()
    const r = await sendOpsMpAnnouncement({
      title: t,
      body: b,
      showHomePopup,
      targetFilter,
      createdBy: session?.displayName || session?.phone || null,
    })
    setSending(false)
    if (!r.ok) {
      setSendMsg({ tone: 'err', text: r.hint ?? r.detail ?? r.error })
      return
    }
    setSendMsg({ tone: 'ok', text: `已推送 ${r.recipientCount} 人（ID: ${r.announcementId}）` })
    batch.clearChecked(batch.checkedIds)
    void loadHistory()
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
          <Smartphone className="h-5 w-5 text-violet-300" />
          达人小程序公告
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          按省/市、平台、带货等级、粉丝档位筛选达人；发送后命中用户在小程序首页弹窗并在「消息通知」中保留记录。
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">筛选命中达人</h2>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2 py-1 text-xs text-slate-300 hover:bg-white/10"
              onClick={() => void loadMembers()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              刷新注册表
            </button>
          </div>
          {loadErr ? <p className="text-sm text-rose-300">{loadErr}</p> : null}

          <div className="space-y-2">
            <p className="text-xs text-slate-400">省份（不选=全部）</p>
            <div className="flex flex-wrap gap-1.5">
              {provinceOpts.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs',
                    provinces.includes(p)
                      ? 'border-violet-400 bg-violet-500/20 text-violet-100'
                      : 'border-white/15 text-slate-300 hover:bg-white/10',
                  )}
                  onClick={() => setProvinces((prev) => toggleChip(prev, p))}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-slate-400">城市（不选=全部）</p>
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
              {cityOpts.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs',
                    cities.includes(c)
                      ? 'border-sky-400 bg-sky-500/20 text-sky-100'
                      : 'border-white/15 text-slate-300 hover:bg-white/10',
                  )}
                  onClick={() => setCities((prev) => toggleChip(prev, c))}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-slate-400">平台（不选=达人库内全部平台）</p>
            <div className="flex flex-wrap gap-1.5">
              {RECRUITMENT_PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs',
                    platforms.includes(p)
                      ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100'
                      : 'border-white/15 text-slate-300 hover:bg-white/10',
                  )}
                  onClick={() => setPlatforms((prev) => toggleChip(prev, p))}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-slate-400">抖音带货等级</p>
            <div className="flex flex-wrap gap-1.5">
              {TALENT_DOUYIN_LEVEL_OPTS.map((lv) => (
                <button
                  key={lv}
                  type="button"
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs',
                    douyinLevels.includes(lv)
                      ? 'border-amber-400 bg-amber-500/20 text-amber-100'
                      : 'border-white/15 text-slate-300 hover:bg-white/10',
                  )}
                  onClick={() => setDouyinLevels((prev) => toggleChip(prev, lv))}
                >
                  {lv}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-slate-400">粉丝档位（按已选平台账号）</p>
            <div className="flex flex-wrap gap-1.5">
              {TALENT_FOLLOWER_TIER_OPTS.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs',
                    followerTiers.includes(tier)
                      ? 'border-pink-400 bg-pink-500/20 text-pink-100'
                      : 'border-white/15 text-slate-300 hover:bg-white/10',
                  )}
                  onClick={() => setFollowerTiers((prev) => toggleChip(prev, tier))}
                >
                  {tier}
                </button>
              ))}
            </div>
          </div>

          <input
            className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-slate-500"
            placeholder="搜索昵称 / 灵祺ID / 地区"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />

          <p className="text-xs text-slate-400">
            达人库 {talentLibraryCount} · 可推送 {announceableMembers.length} · 命中 {filteredMembers.length} 人
            {batch.checkedIds.length ? ` · 已勾选 ${batch.checkedIds.length} 人（仅向勾选发送）` : ' · 未勾选时向全部命中发送'}
          </p>

          <div className="max-h-72 overflow-auto rounded-lg border border-white/10">
            <table className="w-full text-left text-xs text-slate-200">
              <thead className="sticky top-0 bg-slate-900/95 text-slate-400">
                <tr>
                  <th className="px-2 py-2">
                    <input type="checkbox" checked={batch.allVisibleChecked} onChange={() => batch.toggleAllVisible()} />
                  </th>
                  <th className="px-2 py-2">达人</th>
                  <th className="px-2 py-2">地区</th>
                  <th className="px-2 py-2">平台</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr key={row.id} className="border-t border-white/5">
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={checkedSet.has(row.id)}
                        onChange={() => batch.toggleRow(row.id)}
                      />
                    </td>
                    <td className="px-2 py-2">{row.label}</td>
                    <td className="px-2 py-2">{row.region}</td>
                    <td className="px-2 py-2">{row.platformText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Megaphone className="h-4 w-4 text-violet-300" />
            编辑公告
          </h2>
          <label className="block space-y-1">
            <span className="text-xs text-slate-400">标题</span>
            <input
              className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：春季探店招募升级通知"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-slate-400">正文</span>
            <textarea
              className="min-h-[140px] w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="公告详情…"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={showHomePopup} onChange={(e) => setShowHomePopup(e.target.checked)} />
            首页弹窗提醒（关闭则仅写入消息通知）
          </label>
          <button
            type="button"
            disabled={sending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
            onClick={() => void onSend()}
          >
            <Send className="h-4 w-4" />
            {sending ? '发送中…' : `发送给 ${previewCount} 位达人`}
          </button>
          {sendMsg ? (
            <p className={cn('text-sm', sendMsg.tone === 'ok' ? 'text-emerald-300' : 'text-rose-300')}>{sendMsg.text}</p>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">发送记录</h2>
          <button
            type="button"
            className="text-xs text-slate-400 hover:text-white"
            onClick={() => void loadHistory()}
          >
            刷新
          </button>
        </div>
        {historyLoading ? <p className="text-sm text-slate-400">加载中…</p> : null}
        {historyErr ? <p className="text-sm text-rose-300">{historyErr}</p> : null}
        <div className="space-y-2">
          {history.map((row) => (
            <div key={row.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-white">{row.title}</span>
                <span className="text-xs text-slate-400">{fmt(row.createdAt)} · {row.recipientCount} 人</span>
              </div>
              <p className="mt-1 line-clamp-2 text-slate-300">{row.body}</p>
            </div>
          ))}
          {!historyLoading && !history.length ? (
            <p className="text-sm text-slate-500">暂无发送记录</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
