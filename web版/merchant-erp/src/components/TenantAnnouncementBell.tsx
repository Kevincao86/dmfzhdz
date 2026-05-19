import { AnimatePresence, motion } from 'framer-motion'
import { Bell, CheckCheck, Megaphone } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '../cn'
import { fetchPrimaryTenantId } from '../lib/tenantBilling'
import {
  ANNOUNCEMENT_CATEGORY_ZH,
  fetchTenantAnnouncementInbox,
  markAllTenantAnnouncementsRead,
  markTenantAnnouncementRead,
  type TenantAnnouncementInboxItem,
} from '../lib/tenantAnnouncements'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

export default function TenantAnnouncementBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<TenantAnnouncementInboxItem[]>([])
  const [loading, setLoading] = useState(false)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!supabaseConfigured || !supabase) {
      setItems([])
      setTenantId(null)
      return
    }
    const tid = await fetchPrimaryTenantId(supabase)
    setTenantId(tid)
    if (!tid) {
      setItems([])
      return
    }
    setLoading(true)
    const r = await fetchTenantAnnouncementInbox(supabase, tid)
    setLoading(false)
    if (r.ok) setItems(r.items)
  }, [])

  useEffect(() => {
    void reload()
    const t = window.setInterval(() => void reload(), 45_000)
    return () => window.clearInterval(t)
  }, [reload])

  useEffect(() => {
    if (!supabaseConfigured || !supabase) return
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void reload()
    })
    return () => subscription.unsubscribe()
  }, [reload])

  const unreadCount = useMemo(() => items.filter((i) => !i.readAt).length, [items])

  const openItem = async (item: TenantAnnouncementInboxItem) => {
    setExpandedId((prev) => (prev === item.deliveryId ? null : item.deliveryId))
    if (item.readAt || !supabase) return
    const r = await markTenantAnnouncementRead(supabase, item.deliveryId)
    if (r.ok) {
      setItems((prev) =>
        prev.map((x) =>
          x.deliveryId === item.deliveryId ? { ...x, readAt: new Date().toISOString() } : x,
        ),
      )
    }
  }

  const markAllRead = async () => {
    if (!supabase || !tenantId || unreadCount === 0) return
    const r = await markAllTenantAnnouncementsRead(supabase, tenantId)
    if (r.ok) {
      const now = new Date().toISOString()
      setItems((prev) => prev.map((x) => ({ ...x, readAt: x.readAt ?? now })))
    }
  }

  if (!supabaseConfigured) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v)
          if (!open) void reload()
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
              onClick={() => setOpen(false)}
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
                      const expanded = expandedId === item.deliveryId
                      return (
                        <li key={item.deliveryId}>
                          <button
                            type="button"
                            onClick={() => void openItem(item)}
                            className={cn(
                              'w-full px-4 py-3 text-left transition-colors hover:bg-slate-50',
                              unread && 'bg-cyan-50/40',
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
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
                              <span className="shrink-0 text-[10px] text-slate-400">
                                {fmt(item.announcedAt)}
                              </span>
                            </div>
                            <p
                              className={cn(
                                'mt-1 text-sm',
                                unread ? 'font-semibold text-slate-900' : 'text-slate-700',
                              )}
                            >
                              {item.title}
                            </p>
                            {expanded ? (
                              <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                                {item.body}
                              </p>
                            ) : (
                              <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.body}</p>
                            )}
                          </button>
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
