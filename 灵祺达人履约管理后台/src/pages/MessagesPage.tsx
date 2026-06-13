import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, Search, Settings, SlidersHorizontal } from 'lucide-react'
import { pullClientStateAfterLogin } from '../lib/mpAccountClientSync'
import { fetchMpRegistry } from '../lib/mpApi'
import { getActiveRole } from '../lib/mpSession'
import {
  markAllNotificationsRead,
  markInboxSeen,
  markNotificationsRead,
  mergeNotificationsWithRegistry,
  readAllNotificationRows,
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

type MsgTab = 'all' | 'system' | 'direct'
type SidebarKind = 'chat' | 'system'

type SidebarItem = {
  id: string
  kind: SidebarKind
  title: string
  preview: string
  time: string
  avatar?: string
  unread: number
  session?: ChatSession
  systemRow?: NotificationRow
}

const MSG_TABS: { id: MsgTab; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'system', label: '系统通知' },
  { id: 'direct', label: '私信' },
]

export default function MessagesPage() {
  const role = getActiveRole()
  const me = getCurrentParticipant()
  const [msgTab, setMsgTab] = useState<MsgTab>('all')
  const [sidebarSearch, setSidebarSearch] = useState('')
  const [topSearch, setTopSearch] = useState('')
  const [rows, setRows] = useState<NotificationRow[]>(() => readAllNotificationRows())
  const [unread, setUnread] = useState(() => unreadNotificationCount())
  const [loadingInbox, setLoadingInbox] = useState(false)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsErr, setSessionsErr] = useState('')
  const [activeId, setActiveId] = useState('')
  const [activeKind, setActiveKind] = useState<SidebarKind>('chat')
  const [registryForChat, setRegistryForChat] = useState<Record<string, unknown> | null>(null)

  const activeSession = useMemo(() => {
    if (activeKind !== 'chat') return null
    return sessions.find((s) => `chat:${s.id}` === activeId) || null
  }, [sessions, activeId, activeKind])

  const activeSystem = useMemo(() => {
    if (activeKind !== 'system') return null
    const sid = activeId.replace(/^sys:/, '')
    return rows.find((r) => r.id === sid) || null
  }, [rows, activeId, activeKind])

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
    } catch (e) {
      setSessionsErr(formatChatError(e))
      setSessions([])
    } finally {
      setSessionsLoading(false)
    }
  }, [registryForChat])

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
    void refreshSessions()
  }, [role])

  const sidebarItems = useMemo(() => {
    const kw = sidebarSearch.trim().toLowerCase()
    const chatItems: SidebarItem[] = sessions.map((s) => {
      const authKey = sessionAuthKeyForMe(s, me)
      const peer = sessionPeerFromRow(s, authKey, registryForChat)
      const unreadN = unreadForMe(s, authKey)
      return {
        id: `chat:${s.id}`,
        kind: 'chat' as const,
        title: peer.name,
        preview: String(s.last_text || ''),
        time: sessionPreviewTime(Number(s.last_ts || 0)),
        avatar: peer.avatar,
        unread: unreadN,
        session: s,
      }
    })
    const systemItems: SidebarItem[] = sortNotificationRows(rows).map((r) => ({
      id: `sys:${r.id}`,
      kind: 'system' as const,
      title: r.title || '系统通知',
      preview: r.body || r.categoryLabel || '系统消息',
      time: r.createdAt || '',
      unread: r.read ? 0 : 1,
      systemRow: r,
    }))
    let list: SidebarItem[] = []
    if (msgTab === 'direct') list = chatItems
    else if (msgTab === 'system') list = systemItems
    else list = [...chatItems, ...systemItems]
    if (kw) {
      list = list.filter((item) => {
        const blob = [item.title, item.preview, item.time].join(' ').toLowerCase()
        return blob.includes(kw)
      })
    }
    return list
  }, [sessions, rows, msgTab, sidebarSearch, me, registryForChat])

  useEffect(() => {
    if (!sidebarItems.length) {
      setActiveId('')
      return
    }
    if (!activeId || !sidebarItems.some((x) => x.id === activeId)) {
      const first = sidebarItems[0]!
      setActiveId(first.id)
      setActiveKind(first.kind)
    }
  }, [sidebarItems, activeId])

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

  function selectItem(item: SidebarItem) {
    setActiveId(item.id)
    setActiveKind(item.kind)
    if (item.kind === 'system' && item.systemRow) onOpenSystemMessage(item.systemRow)
  }

  return (
    <div className="page-content-shell page-content-shell--wide messages-page">
      <header className="messages-page__head">
        <h1 className="messages-page__title">消息</h1>
        <div className="messages-page__tabs" role="tablist">
          {MSG_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={msgTab === t.id}
              className={`messages-page__tab ${msgTab === t.id ? 'messages-page__tab--active' : ''}`}
              onClick={() => setMsgTab(t.id)}
            >
              {t.label}
              {t.id === 'system' && unread > 0 ? (
                <span className="messages-page__tab-badge">{unread > 99 ? '99+' : unread}</span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="messages-page__tools">
          <button type="button" className="messages-page__tool-btn" aria-label="通知">
            <Bell size={18} strokeWidth={2} />
            {unread > 0 ? <span className="messages-page__bell-dot" /> : null}
          </button>
          <label className="messages-page__search">
            <Search size={16} strokeWidth={2} aria-hidden />
            <input
              type="search"
              placeholder="搜索消息"
              value={topSearch}
              onChange={(e) => {
                setTopSearch(e.target.value)
                setSidebarSearch(e.target.value)
              }}
            />
          </label>
          <button type="button" className="messages-page__tool-btn" aria-label="设置">
            <Settings size={18} strokeWidth={2} />
          </button>
        </div>
      </header>

      <div className="messages-hub">
        <aside className="messages-hub__sidebar">
          <div className="messages-hub__sidebar-search">
            <Search size={15} strokeWidth={2} aria-hidden />
            <input
              type="search"
              placeholder="搜索会话或消息"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
            />
            <button type="button" className="messages-hub__filter-btn" aria-label="筛选">
              <SlidersHorizontal size={15} strokeWidth={2} />
            </button>
          </div>
          <div className="messages-hub__list">
            {sessionsLoading || loadingInbox ? (
              <p className="messages-hub__empty">加载中…</p>
            ) : null}
            {sessionsErr ? <p className="messages-hub__err">{sessionsErr}</p> : null}
            {!sessionsLoading && !sidebarItems.length ? (
              <p className="messages-hub__empty">
                {msgTab === 'system'
                  ? '暂无系统通知'
                  : msgTab === 'direct'
                    ? '暂无私信会话'
                    : '暂无消息'}
              </p>
            ) : null}
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`messages-hub__item ${activeId === item.id ? 'messages-hub__item--active' : ''}`}
                onClick={() => selectItem(item)}
              >
                {item.avatar ? (
                  <img src={item.avatar} alt="" className="messages-hub__avatar" />
                ) : (
                  <div
                    className={`messages-hub__avatar messages-hub__avatar--ph ${
                      item.kind === 'system' ? 'messages-hub__avatar--system' : ''
                    }`}
                  >
                    {item.kind === 'system' ? '🔔' : item.title.slice(0, 1)}
                  </div>
                )}
                <div className="messages-hub__item-body">
                  <div className="messages-hub__item-top">
                    <span className="messages-hub__item-title">{item.title}</span>
                    <span className="messages-hub__item-time">{item.time}</span>
                  </div>
                  <p className="messages-hub__item-preview">{item.preview}</p>
                </div>
                {item.unread > 0 ? (
                  <span className="messages-hub__badge">{item.unread > 99 ? '99+' : item.unread}</span>
                ) : null}
              </button>
            ))}
          </div>
          {msgTab !== 'direct' && unread > 0 ? (
            <button type="button" className="messages-hub__mark-read" onClick={onMarkAllRead}>
              全部标为已读
            </button>
          ) : null}
        </aside>

        <main className="messages-hub__main">
          {activeKind === 'chat' && activeSession ? (
            <ChatPanel
              key={String(activeSession.id)}
              sessionId={String(activeSession.id)}
              peerName={activePeer.name}
              peerAvatar={activePeer.avatar}
              peerId={activePeer.peerId}
              sessionRow={{
                talent_key: String(activeSession.talent_key || ''),
                pr_key: String(activeSession.pr_key || ''),
              }}
              groupMeta={activePeer.name.includes('组') ? '群组' : undefined}
            />
          ) : activeKind === 'system' && activeSystem ? (
            <div className="messages-system-detail">
              <header className="messages-system-detail__head">
                <div className="messages-hub__avatar messages-hub__avatar--system messages-hub__avatar--lg">🔔</div>
                <div>
                  <h2>{activeSystem.title || '系统通知'}</h2>
                  <p>{activeSystem.categoryLabel || activeSystem.category || '系统'}</p>
                </div>
              </header>
              <div className="messages-system-detail__body">
                {activeSystem.body ? <p>{activeSystem.body}</p> : null}
                {activeSystem.imageUrl ? (
                  <img src={activeSystem.imageUrl} alt="" className="messages-system-detail__img" />
                ) : null}
                {activeSystem.createdAt ? (
                  <p className="messages-system-detail__time">{activeSystem.createdAt}</p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="messages-hub__placeholder">选择左侧会话查看消息</div>
          )}
        </main>
      </div>
    </div>
  )
}
