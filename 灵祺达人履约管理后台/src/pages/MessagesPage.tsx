import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CheckCheck, RefreshCw, Search, Settings, SlidersHorizontal } from 'lucide-react'
import { pullClientStateAfterLogin } from '../lib/mpAccountClientSync'
import { fetchMpRegistry } from '../lib/mpApi'
import { getActiveRole } from '../lib/mpSession'
import {
  enrichNoticeRow,
  filterNoticesByTab,
  NOTICE_TABS,
  noticeTabCounts,
  type NoticeTabId,
} from '../lib/mpSync/inboxNoticeCatalog'
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
import { chatMessagePreview } from '../lib/mpSync/chatMessageMedia'
import {
  canOrderGroupChat,
  listMine,
  mapGroupSessions,
  type OrderGroupSession,
} from '../lib/mpSync/orderGroupChat'
import ChatPanel from '../components/chat/ChatPanel'
import OrderGroupChatPanel from '../components/chat/OrderGroupChatPanel'

type MsgTab = 'system' | 'direct' | 'group'
type SidebarKind = 'chat' | 'system' | 'group'

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
  groupSession?: OrderGroupSession
}

const MSG_TABS: { id: MsgTab; label: string }[] = [
  { id: 'system', label: '系统通知' },
  { id: 'direct', label: '私信' },
  { id: 'group', label: '群聊' },
]

export default function MessagesPage() {
  const role = getActiveRole()
  const me = useMemo(() => getCurrentParticipant(), [role])
  const meKey = me.participantKey
  const [msgTab, setMsgTab] = useState<MsgTab>('direct')
  const [ntfTab, setNtfTab] = useState<NoticeTabId>('all')
  const [sidebarSearch, setSidebarSearch] = useState('')
  const [topSearch, setTopSearch] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)
  const [rows, setRows] = useState<NotificationRow[]>(() => readAllNotificationRows())
  const [unread, setUnread] = useState(() => unreadNotificationCount())
  const [pageLoading, setPageLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [groupSessions, setGroupSessions] = useState<OrderGroupSession[]>([])
  const [sessionsErr, setSessionsErr] = useState('')
  const [activeId, setActiveId] = useState('')
  const [activeKind, setActiveKind] = useState<SidebarKind>('chat')
  const [registryForChat, setRegistryForChat] = useState<Record<string, unknown> | null>(null)
  const activeIdRef = useRef(activeId)
  const registryForChatRef = useRef(registryForChat)
  const initialLoadDoneRef = useRef(false)
  activeIdRef.current = activeId
  registryForChatRef.current = registryForChat

  const enrichedRows = useMemo(() => rows.map((r) => enrichNoticeRow(r)), [rows])
  const ntfCounts = useMemo(() => noticeTabCounts(rows), [rows])

  const activeSession = useMemo(() => {
    if (activeKind !== 'chat') return null
    return sessions.find((s) => `chat:${s.id}` === activeId) || null
  }, [sessions, activeId, activeKind])

  const activeSystem = useMemo(() => {
    if (activeKind !== 'system') return null
    const sid = activeId.replace(/^sys:/, '')
    const hit = enrichedRows.find((r) => r.id === sid)
    return hit || null
  }, [enrichedRows, activeId, activeKind])

  const activePeer = useMemo(() => {
    if (!activeSession) return { name: '会话', avatar: '', peerId: '' }
    const authKey = sessionAuthKeyForMe(activeSession, me)
    return sessionPeerFromRow(activeSession, authKey, registryForChat)
  }, [activeSession, me, registryForChat])

  const activeGroupSession = useMemo(() => {
    if (activeKind !== 'group' || !activeId.startsWith('group:')) return null
    const key = activeId.slice('group:'.length)
    return (
      groupSessions.find((s) => s.mpOrderId === key || s.id === key) ||
      null
    )
  }, [groupSessions, activeId, activeKind])

  const refreshGroupSessions = useCallback(async () => {
    if (!canOrderGroupChat()) {
      setGroupSessions([])
      return
    }
    try {
      const body = await listMine()
      setGroupSessions(mapGroupSessions((body.groups as Parameters<typeof mapGroupSessions>[0]) || []))
    } catch {
      setGroupSessions([])
    }
  }, [])

  const refreshSessions = useCallback(async (reg?: Record<string, unknown> | null) => {
    if (!canChat()) {
      setSessions([])
      setSessionsErr('未配置后台 API')
      return
    }
    setSessionsErr('')
    try {
      await syncProfile()
      const list = await listSessionsForMe()
      const sorted = [...list].sort((a, b) => Number(b.last_ts || 0) - Number(a.last_ts || 0))
      setSessions(sorted)
      if (reg) setRegistryForChat(reg)
    } catch (e) {
      setSessionsErr(formatChatError(e))
      setSessions([])
    }
  }, [])

  const refreshFromRegistry = useCallback(
    async (opts?: { manual?: boolean }) => {
      const isInitial = !initialLoadDoneRef.current
      const showBlockingLoad = isInitial
      if (showBlockingLoad) setPageLoading(true)
      else if (opts?.manual) setRefreshing(true)
      try {
        await pullClientStateAfterLogin()
        let merged = readAllNotificationRows()
        let reg: Record<string, unknown> | null = null
        try {
          reg = (await fetchMpRegistry({ scope: 'full' })) as Record<string, unknown>
        } catch {
          reg = registryForChatRef.current
        }
        if (role !== 'pr' && reg) {
          const member = readMember() as Record<string, unknown> | null
          const registryRows = [
            ...buildSelectionNoticeRows(reg, member),
            ...inboxRowsForTalent(reg, member),
          ] as NotificationRow[]
          merged = mergeNotificationsWithRegistry(registryRows, merged)
        }
        setRows(merged)
        setUnread(merged.filter((m) => !m.read).length)
        await Promise.all([refreshSessions(reg), refreshGroupSessions()])
      } catch {
        setRows(readAllNotificationRows())
        setUnread(unreadNotificationCount())
        try {
          await Promise.all([refreshSessions(registryForChatRef.current), refreshGroupSessions()])
        } catch {
          /* 会话列表失败时仍展示本地通知 */
        }
      } finally {
        if (showBlockingLoad) setPageLoading(false)
        if (opts?.manual) setRefreshing(false)
        initialLoadDoneRef.current = true
      }
    },
    [role, refreshSessions, refreshGroupSessions],
  )

  useEffect(() => {
    void refreshFromRegistry()
  }, [role, refreshFromRegistry])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!settingsRef.current?.contains(e.target as Node)) setShowSettings(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  useEffect(() => {
    setActiveId('')
    setActiveKind(msgTab === 'group' ? 'group' : msgTab === 'system' ? 'system' : 'chat')
  }, [msgTab, ntfTab, unreadOnly])

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
        preview: chatMessagePreview(String(s.last_text || '')),
        time: sessionPreviewTime(Number(s.last_ts || 0)),
        avatar: peer.avatar,
        unread: unreadN,
        session: s,
      }
    })
    const groupItems: SidebarItem[] = groupSessions.map((g) => ({
      id: `group:${g.mpOrderId}`,
      kind: 'group' as const,
      title: g.title,
      preview: g.lastText,
      time: g.timeText,
      unread: 0,
      groupSession: g,
    }))
    const systemSource = filterNoticesByTab(sortNotificationRows(rows), msgTab === 'system' ? ntfTab : 'all')
    const systemItems: SidebarItem[] = systemSource.map((r) => ({
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
    else if (msgTab === 'group') list = groupItems
    if (unreadOnly) list = list.filter((item) => item.unread > 0)
    if (kw) {
      list = list.filter((item) => {
        const blob = [item.title, item.preview, item.time].join(' ').toLowerCase()
        return blob.includes(kw)
      })
    }
    return list
  }, [sessions, groupSessions, rows, msgTab, ntfTab, sidebarSearch, unreadOnly, meKey, registryForChat, me])

  useEffect(() => {
    if (!sidebarItems.length) {
      if (!pageLoading) setActiveId('')
      return
    }
    const cur = activeIdRef.current
    if (cur && sidebarItems.some((x) => x.id === cur)) return
    if (cur) return
    const first = sidebarItems[0]!
    setActiveId(first.id)
    setActiveKind(first.kind)
  }, [sidebarItems, pageLoading])

  function onMarkAllRead() {
    markAllNotificationsRead(rows.filter((r) => r.fromRegistry))
    setRows((prev) => prev.map((r) => ({ ...r, read: true })))
    setUnread(0)
    setShowSettings(false)
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
    setActiveKind(item.kind === 'system' ? 'system' : item.kind === 'group' ? 'group' : 'chat')
    if (item.kind === 'system' && item.systemRow) onOpenSystemMessage(item.systemRow)
  }

  function onTopBellClick() {
    setMsgTab('system')
    if (unread > 0) {
      const firstUnread = sortNotificationRows(rows).find((r) => !r.read)
      if (firstUnread) {
        setActiveId(`sys:${firstUnread.id}`)
        setActiveKind('system')
        onOpenSystemMessage(firstUnread)
      }
    }
  }

  function onToggleUnreadOnly() {
    setUnreadOnly((v) => !v)
    setShowSettings(false)
  }

  const listEmpty = !pageLoading && !sidebarItems.length

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
              onClick={() => {
                setMsgTab(t.id)
                if (t.id === 'group') void refreshGroupSessions()
              }}
            >
              {t.label}
              {t.id === 'system' && unread > 0 ? (
                <span className="messages-page__tab-badge">{unread > 99 ? '99+' : unread}</span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="messages-page__tools">
          <button
            type="button"
            className="messages-page__tool-btn"
            aria-label="系统通知"
            title="查看系统通知"
            onClick={onTopBellClick}
          >
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
          <div className="messages-page__settings-wrap" ref={settingsRef}>
            <button
              type="button"
              className="messages-page__tool-btn"
              aria-label="设置"
              aria-expanded={showSettings}
              title="消息设置"
              onClick={(e) => {
                e.stopPropagation()
                setShowSettings((v) => !v)
              }}
            >
              <Settings size={18} strokeWidth={2} />
            </button>
            {showSettings ? (
              <div className="messages-page__settings-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  disabled={refreshing}
                  onClick={() => void refreshFromRegistry({ manual: true })}
                >
                  <RefreshCw size={15} aria-hidden />
                  {refreshing ? '刷新中…' : '刷新消息'}
                </button>
                <button type="button" role="menuitem" onClick={onMarkAllRead} disabled={unread === 0}>
                  <CheckCheck size={15} aria-hidden />
                  全部标为已读
                </button>
                <button type="button" role="menuitem" onClick={onToggleUnreadOnly}>
                  <SlidersHorizontal size={15} aria-hidden />
                  {unreadOnly ? '显示全部消息' : '仅显示未读'}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {msgTab === 'system' ? (
        <div className="messages-page__ntf-tabs" role="tablist" aria-label="系统通知分类">
          {NOTICE_TABS.map((t) => {
            const count = ntfCounts[t.id]
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={ntfTab === t.id}
                className={`messages-page__ntf-tab ${ntfTab === t.id ? 'messages-page__ntf-tab--on' : ''}`}
                onClick={() => setNtfTab(t.id)}
              >
                <span>{t.label}</span>
                {count > 0 ? <span className="messages-page__ntf-badge">{count}</span> : null}
              </button>
            )
          })}
        </div>
      ) : null}

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
            <button
              type="button"
              className={`messages-hub__filter-btn ${unreadOnly ? 'messages-hub__filter-btn--on' : ''}`}
              aria-label="仅显示未读"
              title={unreadOnly ? '显示全部' : '仅显示未读'}
              onClick={onToggleUnreadOnly}
            >
              <SlidersHorizontal size={15} strokeWidth={2} />
            </button>
          </div>
          <div className="messages-hub__list">
            {pageLoading && !sidebarItems.length ? (
              <p className="messages-hub__empty">加载中…</p>
            ) : null}
            {sessionsErr ? <p className="messages-hub__err">{sessionsErr}</p> : null}
            {listEmpty ? (
              <p className="messages-hub__empty">
                {msgTab === 'system'
                  ? '暂无系统通知'
                  : msgTab === 'direct'
                    ? '暂无私信会话'
                    : msgTab === 'group'
                      ? role === 'pr'
                        ? '暂无商单群，在定向邀约中「一键拉群」后会显示在这里'
                        : '暂无商单群，被邀请加入后会显示在这里'
                      : unreadOnly
                        ? '暂无未读消息'
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
                      item.kind === 'system' ? 'messages-hub__avatar--system' : item.kind === 'group' ? 'messages-hub__avatar--group' : ''
                    }`}
                  >
                    {item.kind === 'system' ? (
                      <Bell size={15} strokeWidth={2.25} className="messages-hub__bell-icon" aria-hidden />
                    ) : item.kind === 'group' ? (
                      '群'
                    ) : (
                      item.title.slice(0, 1)
                    )}
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
                <div className="messages-hub__avatar messages-hub__avatar--ph messages-hub__avatar--system messages-hub__avatar--lg">
                  <Bell size={18} strokeWidth={2.25} className="messages-hub__bell-icon" aria-hidden />
                </div>
                <div>
                  <h2>{activeSystem.title || '系统通知'}</h2>
                  <p>{activeSystem.noticeKindLabel || activeSystem.categoryLabel || activeSystem.category || '系统'}</p>
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
                {activeSystem.detailHref ? (
                  <Link to={activeSystem.detailHref} className="messages-system-detail__link">
                    {activeSystem.detailLabel || '查看关联商单'}
                  </Link>
                ) : null}
              </div>
            </div>
          ) : activeKind === 'group' && (activeGroupSession || activeId.startsWith('group:')) ? (
            <OrderGroupChatPanel
              key={activeGroupSession?.mpOrderId || activeId.slice('group:'.length)}
              mpOrderId={activeGroupSession?.mpOrderId || activeId.slice('group:'.length)}
              orderDetailHref={`/recruitment/${encodeURIComponent(activeGroupSession?.mpOrderId || activeId.slice('group:'.length))}`}
            />
          ) : msgTab === 'group' ? (
            <div className="messages-hub__placeholder">
              <p>点击左侧商单群进入协作群聊</p>
            </div>
          ) : (
            <div className="messages-hub__placeholder">选择左侧会话查看消息</div>
          )}
        </main>
      </div>
    </div>
  )
}
