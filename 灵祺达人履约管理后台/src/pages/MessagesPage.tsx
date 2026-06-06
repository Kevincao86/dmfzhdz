import { useCallback, useEffect, useMemo, useState } from 'react'
import { pullClientStateAfterLogin } from '../lib/mpAccountClientSync'
import { fetchMpRegistry } from '../lib/mpApi'
import { getActiveRole } from '../lib/mpSession'
import {
  markNotificationsRead,
  mergeNotificationsWithRegistry,
  readAllNotificationRows,
  unreadNotificationCount,
  type NotificationRow,
} from '../lib/mpSync/messagesStore'
import { inboxRowsForTalent, buildSelectionNoticeRows } from '../lib/mpSync/talentInboxMatch'
import { readMember } from '../lib/mpSync/talentMember'
import { getCurrentParticipant, unreadForMe } from '../lib/mpSync/participant'
import {
  canChat,
  formatChatError,
  listSessions,
  sessionPeerFromRow,
  sessionPreviewTime,
  syncProfile,
  type ChatSession,
} from '../lib/mpSync/talentChat'
import ChatPanel from '../components/chat/ChatPanel'

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

  const activeSession = useMemo(
    () => sessions.find((s) => String(s.id) === activeSessionId) || null,
    [sessions, activeSessionId],
  )
  const activePeer = useMemo(() => {
    if (!activeSession) return { name: '会话', avatar: '' }
    return sessionPeerFromRow(activeSession, me.participantKey)
  }, [activeSession, me.participantKey])

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
      const list = await listSessions()
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
        const reg = await fetchMpRegistry()
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
    markNotificationsRead()
    void refreshFromRegistry()
  }

  const systemRows = useMemo(() => {
    const list = rows
    if (systemFilter === 'all') return list
    return list.filter((r) => r.category === systemFilter)
  }, [rows, systemFilter])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-[var(--shell-text)]">消息</h2>
        {unread > 0 && msgTab === 'system' ? (
          <button type="button" className="text-sm text-teal-600 hover:text-teal-700" onClick={onMarkAllRead}>
            全部标为已读
          </button>
        ) : null}
      </div>

      <div className="flex gap-2 p-1 rounded-xl panel-input border max-w-sm">
        <button
          type="button"
          className={`flex-1 py-2 rounded-lg text-sm font-medium ${msgTab === 'realtime' ? 'bg-violet-600 text-white' : 'panel-tab'}`}
          onClick={() => setMsgTab('realtime')}
        >
          实时消息
        </button>
        <button
          type="button"
          className={`flex-1 py-2 rounded-lg text-sm font-medium ${msgTab === 'system' ? 'bg-violet-600 text-white' : 'panel-tab'}`}
          onClick={() => setMsgTab('system')}
        >
          系统消息
          {unread > 0 ? <span className="ml-1 text-xs">({unread})</span> : null}
        </button>
      </div>

      {msgTab === 'realtime' ? (
        <div className="chat-shell flex rounded-xl border border-[#d6d6d6] overflow-hidden h-[calc(100vh-12rem)] min-h-[420px] bg-white shadow-sm">
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
                  暂无会话。PR 可在推荐大厅向达人发起「沟通」。
                </p>
              ) : null}
              {sessions.map((s) => {
                const peer = sessionPeerFromRow(s, me.participantKey)
                const unreadN = unreadForMe(s, me.participantKey)
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
                  className={`rounded-xl border p-4 ${
                    row.read
                      ? 'border-slate-200 bg-white/60'
                      : 'border-teal-200 bg-teal-50/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">{row.title || '通知'}</p>
                      {row.body ? <p className="mt-1 text-sm text-slate-600">{row.body}</p> : null}
                      {row.imageUrl ? (
                        <img src={row.imageUrl} alt="" className="mt-2 max-h-32 rounded border" />
                      ) : null}
                      {row.fromRegistry ? (
                        <p className="mt-1 text-xs text-violet-500">已从小程序/履约后台同步</p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">{row.categoryLabel || row.category}</span>
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
