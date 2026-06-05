import { useEffect, useState } from 'react'
import { pullClientStateAfterLogin } from '../lib/mpAccountClientSync'
import {
  markNotificationsRead,
  readAllNotificationRows,
  unreadNotificationCount,
  type NotificationRow,
} from '../lib/mpSync/messagesStore'

export default function MessagesPage() {
  const [rows, setRows] = useState<NotificationRow[]>(() => readAllNotificationRows())
  const [unread, setUnread] = useState(() => unreadNotificationCount())

  useEffect(() => {
    void pullClientStateAfterLogin().finally(() => {
      setRows(readAllNotificationRows())
      setUnread(unreadNotificationCount())
    })
  }, [])

  function refresh() {
    setRows(readAllNotificationRows())
    setUnread(unreadNotificationCount())
  }

  function onMarkAllRead() {
    markNotificationsRead()
    refresh()
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-[var(--shell-text)]">消息</h2>
        {unread > 0 ? (
          <button
            type="button"
            className="text-sm text-teal-600 hover:text-teal-700"
            onClick={onMarkAllRead}
          >
            全部标为已读
          </button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--shell-muted)]">暂无新消息，报名或沟通后将会显示在这里。</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
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
                </div>
                <span className="shrink-0 text-xs text-slate-400">{row.categoryLabel || row.category}</span>
              </div>
              {row.createdAt ? (
                <p className="mt-2 text-xs text-slate-400">{row.createdAt}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
