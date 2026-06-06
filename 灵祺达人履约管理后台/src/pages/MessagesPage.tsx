import { useEffect, useMemo, useState } from 'react'
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

type MsgTab = 'realtime' | 'system'

const SYSTEM_TABS = [
  { id: 'all', label: '全部' },
  { id: 'order', label: '订单' },
  { id: 'business', label: '业务' },
  { id: 'system', label: '系统' },
] as const

export default function MessagesPage() {
  const role = getActiveRole()
  const [msgTab, setMsgTab] = useState<MsgTab>('realtime')
  const [systemFilter, setSystemFilter] = useState('all')
  const [rows, setRows] = useState<NotificationRow[]>(() => readAllNotificationRows())
  const [unread, setUnread] = useState(() => unreadNotificationCount())
  const [loadingInbox, setLoadingInbox] = useState(false)

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
    <div className="max-w-2xl space-y-4">
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
        <div className="surface-card rounded-xl border p-6 text-center">
          <p className="font-medium text-[var(--shell-text)]">私信会话</p>
          <p className="text-sm text-[var(--shell-muted)] mt-2">
            Web 端实时私信功能与小程序同步建设中。请在小程序「消息」页与达人/招募方私信沟通。
          </p>
          <p className="text-xs text-[var(--shell-muted)] mt-4">
            PR：在推荐大厅向达人发起沟通 · 达人：报名通过后可在商单详情联系招募方
          </p>
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
