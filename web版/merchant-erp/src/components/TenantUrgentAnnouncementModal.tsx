import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Megaphone, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { cn } from '../cn'
import { useTenantAnnouncements } from '../context/TenantAnnouncementContext'
import {
  ANNOUNCEMENT_CATEGORY_ZH,
  ANNOUNCEMENT_PRIORITY_ZH,
  type TenantAnnouncementInboxItem,
} from '../lib/tenantAnnouncements'

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

function isHomePath(pathname: string): boolean {
  return pathname === '/' || pathname === ''
}

export default function TenantUrgentAnnouncementModal() {
  const location = useLocation()
  const { urgentUnreadItems, markItemRead } = useTenantAnnouncements()
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  const visibleUrgent = useMemo(
    () => urgentUnreadItems.filter((i) => !dismissedIds.has(i.deliveryId)),
    [urgentUnreadItems, dismissedIds],
  )

  const current: TenantAnnouncementInboxItem | null = visibleUrgent[0] ?? null
  const show = isHomePath(location.pathname) && current != null

  useEffect(() => {
    setDismissedIds((prev) => {
      const urgentIds = new Set(urgentUnreadItems.map((i) => i.deliveryId))
      const next = new Set<string>()
      for (const id of prev) {
        if (urgentIds.has(id)) next.add(id)
      }
      return next
    })
  }, [urgentUnreadItems])

  const close = () => {
    if (!current) return
    setDismissedIds((prev) => new Set(prev).add(current.deliveryId))
    void markItemRead(current)
  }

  return (
    <AnimatePresence>
      {show && current ? (
        <>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] cursor-default bg-slate-900/50 backdrop-blur-[2px]"
            aria-label="关闭紧急公告"
            onClick={close}
          />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="urgent-announcement-title"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2 }}
            className="fixed left-1/2 top-1/2 z-[101] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-red-200 bg-white shadow-2xl shadow-red-900/15"
          >
            <div className="flex items-center justify-between border-b border-red-100 bg-gradient-to-r from-red-50 to-orange-50 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-medium text-red-600">紧急公告</p>
                  <p
                    id="urgent-announcement-title"
                    className="flex items-center gap-1.5 text-sm font-semibold text-slate-900"
                  >
                    <Megaphone className="h-4 w-4 text-red-500" />
                    系统公告
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/80 hover:text-slate-700"
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
                  {ANNOUNCEMENT_CATEGORY_ZH[current.category]}
                </span>
                <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                  {ANNOUNCEMENT_PRIORITY_ZH.urgent}
                </span>
                <span className="ml-auto text-[10px] text-slate-400">{fmt(current.announcedAt)}</span>
              </div>
              {current.title ? (
                <p className="mt-3 text-base font-semibold text-slate-900">{current.title}</p>
              ) : null}
              <p
                className={cn(
                  'whitespace-pre-wrap text-sm leading-relaxed text-slate-600',
                  current.title ? 'mt-2' : 'mt-3',
                )}
              >
                {current.body}
              </p>
              {visibleUrgent.length > 1 ? (
                <p className="mt-3 text-xs text-slate-400">
                  还有 {visibleUrgent.length - 1} 条紧急公告，关闭后将继续显示
                </p>
              ) : null}
            </div>

            <div className="border-t border-slate-100 bg-slate-50/80 px-5 py-3">
              <button
                type="button"
                onClick={close}
                className="w-full rounded-xl bg-red-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-500"
              >
                我知道了
              </button>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
