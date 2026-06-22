import { AnimatePresence, motion } from 'framer-motion'
import { Bell, CheckCheck, Megaphone, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../cn'
import RichContentView from './RichContentView'
import { useTenantAnnouncements } from '../context/TenantAnnouncementContext'
import {
  ANNOUNCEMENT_CATEGORY_ZH,
  ANNOUNCEMENT_PRIORITY_ZH,
} from '../lib/tenantAnnouncements'
import { supabaseConfigured } from '../lib/supabaseClient'

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

export default function TenantAnnouncementBell() {
  const [open, setOpen] = useState(false)
  const [userDismissed, setUserDismissed] = useState(false)
  const prevNormalUnreadRef = useRef(0)

  const {
    items,
    loading,
    unreadCount,
    normalUnreadCount,
    reload,
    markItemRead,
    markAllRead,
  } = useTenantAnnouncements()

  useEffect(() => {
    if (normalUnreadCount === 0) {
      prevNormalUnreadRef.current = 0
      return
    }
    const hasNewUnread = normalUnreadCount > prevNormalUnreadRef.current
    prevNormalUnreadRef.current = normalUnreadCount
    if (!userDismissed || hasNewUnread) {
      if (hasNewUnread) setUserDismissed(false)
      setOpen(true)
    }
  }, [normalUnreadCount, userDismissed])

  const closePanel = () => {
    setOpen(false)
    setUserDismissed(true)
    const unread = items.filter((i) => !i.readAt && i.priority !== 'urgent')
    if (unread.length > 0) void Promise.all(unread.map((i) => markItemRead(i)))
  }

  if (!supabaseConfigured) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => {
            const next = !v
            if (next) {
              setUserDismissed(false)
              void reload()
            }
            return next
          })
        }}
        className="relative rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
        aria-label="系统公告"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 cursor-default"
              aria-label="关闭公告"
              onClick={closePanel}
            />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xl shadow-slate-900/10"
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-cyan-600" />
                  <span className="text-sm font-semibold text-slate-900">系统公告</span>
                </div>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => void markAllRead()}
                      className="inline-flex items-center gap-1 text-xs text-cyan-700 hover:underline"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      全部已读
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={closePanel}
                    className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    aria-label="关闭"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {loading ? (
                  <p className="px-4 py-8 text-center text-sm text-slate-500">加载中…</p>
                ) : items.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-slate-500">暂无公告</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {items.map((item) => {
                      const unread = !item.readAt
                      return (
                        <li
                          key={item.deliveryId}
                          className={cn('px-4 py-3', unread && 'bg-cyan-50/40')}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex flex-wrap gap-1">
                              <span
                                className={cn(
                                  'rounded px-1.5 py-0.5 text-[10px] font-medium',
                                  item.category === 'subscription_expiring'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-sky-100 text-sky-800',
                                )}
                              >
                                {ANNOUNCEMENT_CATEGORY_ZH[item.category]}
                              </span>
                              {item.category === 'platform_change' ? (
                                <span
                                  className={cn(
                                    'rounded px-1.5 py-0.5 text-[10px] font-medium',
                                    item.priority === 'urgent'
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-slate-100 text-slate-600',
                                  )}
                                >
                                  {ANNOUNCEMENT_PRIORITY_ZH[item.priority]}
                                </span>
                              ) : null}
                            </div>
                            <span className="shrink-0 text-[10px] text-slate-400">
                              {fmt(item.announcedAt)}
                            </span>
                          </div>
                          {item.title ? (
                            <p
                              className={cn(
                                'mt-1.5 text-sm',
                                unread ? 'font-semibold text-slate-900' : 'text-slate-700',
                              )}
                            >
                              {item.title}
                            </p>
                          ) : null}
                          <RichContentView
                            body={item.body}
                            className="mt-1.5 text-sm leading-relaxed text-slate-600"
                          />
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
