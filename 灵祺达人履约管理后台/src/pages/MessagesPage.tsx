import { useCallback, useEffect, useMemo, useState } from 'react'
import { pullClientStateAfterLogin } from '../lib/mpAccountClientSync'
import { fetchMpRegistry } from '../lib/mpApi'
import { getActiveRole } from '../lib/mpSession'
import {
  markAllNotificationsRead,
  markInboxSeen,
  markNotificationsRead,
  mergeNotificationsWithRegistry,
  readAllNotificationRows,
  isPinnedUnread,
  sortNotificationRows,
  unreadNotificationCount,
  type NotificationRow,
} from '../lib/mpSync/messagesStore'
import { inboxRowsForTalent, buildSelectionNoticeRows } from '../lib/mpSync/talentInboxMatch'
import { readMember } from '../lib/mpSync/talentMember'
import { getCurrentParticipant, unreadForMe } from '../lib/mpSync/participant'
import {
  canChat,
  formatChatError,
  listSessionsForMe,
  sessionAuthKeyForMe,
  sessionPeerFromRow,
  sessionPreviewTime,
  syncProfile,
  type ChatSession,
} from '../lib/mpSync/talentChat'
import ChatPanel from '../components/chat/ChatPanel'
import { StatusTabBar } from '../components/ui/MockupLayouts'

type MsgTab = 'realtime' | 'system'

const SYSTEM_TABS = [
  { id: 'all', label: '全部' },
  { id: 'order', label: '订单' },
  { id: 'business', label: '业务' },
  { id: 'system', label: '系统' },
] as const

export default function MessagesPage() {
  const role = getActiveRole()
  const me = getCurrentParticipant()
  const [msgTab, setMsgTab] = useState<MsgTab>('realtime')
  const [systemFilter, setSystemFilter] = useState('all')
  const [rows, setRows] = useState<NotificationRow[]>(() => readAllNotificationRows())
  const [unread, setUnread] = useState(() => unreadNotificationCount())
  const [loadingInbox, setLoadingInbox] = useState(false)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsErr, setSessionsErr] = useState('')
  const [activeSessionId, setActiveSessionId] = useState('')
  const [registryForChat, setRegistryForChat] = useState<Record<string, unknown> | null>(null)

  const activeSession = useMemo(
    () => sessions.find((s) => String(s.id) === activeSessionId) || null,
    [sessions, activeSessionId],
  )
  const activePeer = useMemo(() => {
    if (!activeSession) return { name: '会话', avatar: '', peerId: '' }
    const authKey = sessionAuthKeyForMe(activeSession, me)
    return sessionPeerFromRow(activeSession, authKey, registryForChat)
  }, [activeSession, me, registryForChat])

  const refreshSessions = useCallback(async () => {
    if (!canChat()) {
      setSessions([])
      setSessionsErr('未配置后台 API')
      return
    }
    setSessionsLoading(true)
    setSessionsErr('')
    try {
      await syncProfile()
      let reg: Record<string, unknown> | null = null
      try {
        reg = (await fetchMpRegistry({ scope: 'full' })) as Record<string, unknown>
        setRegistryForChat(reg)
      } catch {
        reg = registryForChat
      }
      const list = await listSessionsForMe()
      const sorted = [...list].sort((a, b) => Number(b.last_ts || 0) - Number(a.last_ts || 0))
      setSessions(sorted)
      if (!activeSessionId && sorted.length) {
        setActiveSessionId(String(sorted[0]!.id))
      }
    } catch (e) {
      setSessionsErr(formatChatError(e))
      setSessions([])
    } finally {
      setSessionsLoading(false)
    }
  }, [activeSessionId])

  async function refreshFromRegistry() {
    setLoadingInbox(true)
    try {
      await pullClientStateAfterLogin()
      let merged = readAllNotificationRows()
      if (role !== 'pr') {
        const reg = await fetchMpRegistry({ scope: 'full' })
        const member = readMember() as Record<string, unknown> | null
        const registryRows = [
          ...buildSelectionNoticeRows(reg, member),
          ...inboxRowsForTalent(reg, member),
        ] as NotificationRow[]
        merged = mergeNotificationsWithRegistry(registryRows, merged)
      }
      setRows(merged)
      setUnread(merged.filter((m) => !m.read).length)
    } catch {
      setRows(readAllNotificationRows())
      setUnread(unreadNotificationCount())
    } finally {
      setLoadingInbox(false)
    }
  }

  useEffect(() => {
    void refreshFromRegistry()
  }, [role])

  useEffect(() => {
    if (msgTab === 'realtime') void refreshSessions()
  }, [msgTab, refreshSessions])

  function onMarkAllRead() {
    markAllNotificationsRead(rows.filter((r) => r.fromRegistry))
    setRows((prev) => prev.map((r) => ({ ...r, read: true })))
    setUnread(0)
  }

  function onOpenSystemMessage(row: NotificationRow) {
    if (!row.read) {
      markNotificationsRead([row.id])
      markInboxSeen([row.id])
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, read: true } : r)))
      setUnread((n) => Math.max(0, n - 1))
    }
  }

  const systemRows = useMemo(() => {
    const list = sortNotificationRows(rows)
    if (systemFilter === 'all') return list
    return list.filter((r) => r.category === systemFilter)
  }, [rows, systemFilter])

  return (
    <div className="page-content-shell page-content-shell--wide space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[var(--shell-text)]">消息</h2>
          <p className="text-sm text-[var(--shell-muted)] mt-0.5">系统通知与私信会话</p>
        </div>
        {unread > 0 && msgTab === 'system' ? (
          <button type="button" className="btn-mockup btn-mockup--outline" onClick={onMarkAllRead}>
            全部已读
          </button>
        ) : null}
      </div>

      <StatusTabBar
        active={msgTab}
        onChange={(id) => setMsgTab(id as MsgTab)}
        tabs={[
          { id: 'realtime', label: '私信' },
          { id: 'system', label: '系统通知', count: unread },
        ]}
      />

      {msgTab === 'realtime' ? (
        <div className="chat-shell chat-shell-mockup flex h-[calc(100vh-12rem)] min-h-[420px]">
          <aside className="chat-session-list w-72 shrink-0 border-r border-[#e8e8e8] bg-[#f7f7f7] flex flex-col min-h-0">
            <div className="px-3 py-2 border-b border-[#e8e8e8] flex items-center justify-between">
              <span className="text-sm font-medium text-[#191919]">私信会话</span>
              <button
                type="button"
                className="text-xs text-violet-600"
                disabled={sessionsLoading}
                onClick={() => void refreshSessions()}
              >
                {sessionsLoading ? '刷新中…' : '刷新'}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {sessionsErr ? <p className="p-3 text-xs text-red-500">{sessionsErr}</p> : null}
              {!sessionsLoading && !sessions.length && !sessionsErr ? (
                <p className="p-4 text-xs text-[#888] text-center">
                  {role === 'pr'
                    ? '暂无会话。可在推荐大厅向达人发起「沟通」。'
                    : '暂无会话。PR 联系您后，或您在已通过审核的招募详情页点击「沟通」后，会话将显示在此。'}
                </p>
              ) : null}
              {sessions.map((s) => {
                const authKey = sessionAuthKeyForMe(s, me)
                const peer = sessionPeerFromRow(s, authKey, registryForChat)
                const unreadN = unreadForMe(s, authKey)
                const sid = String(s.id)
                const active = sid === activeSessionId
                return (
                  <button
                    key={sid}
                    type="button"
                    className={`w-full text-left px-3 py-3 flex gap-2 border-b border-[#efefef] hover:bg-[#ededed] transition-colors ${
                      active ? 'bg-[#c9c9c9]/40' : ''
                    }`}
                    onClick={() => setActiveSessionId(sid)}
                  >
                    {peer.avatar ? (
                      <img src={peer.avatar} alt="" className="w-10 h-10 rounded-md object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-md bg-violet-400/20 flex items-center justify-center text-sm shrink-0">
                        {peer.name.slice(0, 1)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-sm font-medium text-[#191919] truncate">{peer.name}</span>
                        <span className="text-[10px] text-[#b2b2b2] shrink-0">
                          {sessionPreviewTime(Number(s.last_ts || 0))}
                        </span>
                      </div>
                      {peer.peerId ? (
                        <p className="text-[10px] text-[#9ca3af] truncate">{peer.peerId}</p>
                      ) : null}
                      <p className="text-xs text-[#888] truncate mt-0.5">{String(s.last_text || '')}</p>
                    </div>
                    {unreadN > 0 ? (
                      <span className="shrink-0 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center px-1">
                        {unreadN > 99 ? '99+' : unreadN}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </aside>
          <main className="chat-main flex-1 min-w-0 min-h-0">
            {activeSessionId ? (
              <ChatPanel
                key={activeSessionId}
                sessionId={activeSessionId}
                peerName={activePeer.name}
                peerAvatar={activePeer.avatar}
                peerId={activePeer.peerId}
                sessionRow={
                  activeSession
                    ? {
                        talent_key: String(activeSession.talent_key || ''),
                        pr_key: String(activeSession.pr_key || ''),
                      }
                    : undefined
                }
              />
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-[#888] bg-[#ededed]">
                选择左侧会话开始聊天
              </div>
            )}
          </main>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {SYSTEM_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`px-3 py-1 rounded-full text-xs ${systemFilter === t.id ? 'bg-violet-600 text-white' : 'panel-tab'}`}
                onClick={() => setSystemFilter(t.id)}
              >
                {t.label}
              </button>
            ))}
            <button
              type="button"
              className="ml-auto text-xs text-violet-600"
              disabled={loadingInbox}
              onClick={() => void refreshFromRegistry()}
            >
              {loadingInbox ? '同步中…' : '刷新同步'}
            </button>
          </div>
          {systemRows.length === 0 ? (
            <p className="text-sm text-[var(--shell-muted)]">
              暂无系统消息。入选通知、业务提醒将从小程序与履约后台 registry 同步显示。
            </p>
          ) : (
            <ul className="space-y-3">
              {systemRows.map((row) => (
                <li
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenSystemMessage(row)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onOpenSystemMessage(row)
                  }}
                  className={`rounded-xl border p-4 cursor-pointer transition-colors hover:border-violet-200 ${
                    row.read
                      ? 'border-slate-200 bg-white/60'
                      : 'border-teal-200 bg-teal-50/40'
                  } ${isPinnedUnread(row) ? 'ring-1 ring-amber-200' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">
                        {isPinnedUnread(row) ? (
                          <span className="mr-1.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                            置顶
                          </span>
                        ) : null}
                        {row.title || '通知'}
                      </p>
                      {row.body ? <p className="mt-1 text-sm text-slate-600">{row.body}</p> : null}
                      {row.imageUrl ? (
                        <img src={row.imageUrl} alt="" className="mt-2 max-h-32 rounded border" />
                      ) : null}
                      {row.fromRegistry ? (
                        <p className="mt-1 text-xs text-violet-500">已从小程序/履约后台同步</p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-xs text-slate-400">{row.categoryLabel || row.category}</span>
                      <p className={`mt-1 text-xs ${row.read ? 'text-slate-400' : 'text-teal-600 font-medium'}`}>
                        {row.read ? '已读' : '未读'}
                      </p>
                    </div>
                  </div>
                  {row.createdAt ? <p className="mt-2 text-xs text-slate-400">{row.createdAt}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
