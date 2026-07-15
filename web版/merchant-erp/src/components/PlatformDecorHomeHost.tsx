import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  dismissDecorPopup,
  fetchPlatformDecorItem,
  openDecorLink,
  shouldShowDecorPopup,
} from '../lib/platformDecorClient'
import { isDecorVideoMedia, type RegistryPlatformDecorItem } from '../lib/platformDecorTypes'
import { useTenantAnnouncements } from '../context/TenantAnnouncementContext'

function DecorMedia({
  item,
  className,
  alt,
}: {
  item: RegistryPlatformDecorItem
  className?: string
  alt?: string
}) {
  if (isDecorVideoMedia(item)) {
    return (
      <video
        src={item.imageUrl}
        className={className}
        autoPlay
        muted
        loop
        playsInline
        controls={false}
      />
    )
  }
  return <img src={item.imageUrl} alt={alt || item.title || '活动'} className={className} />
}

function isHomePath(pathname: string): boolean {
  return pathname === '/' || pathname === ''
}

/**
 * 商家 ERP：工作台 Banner + 活动海报弹窗（与紧急公告互斥，公告优先）
 */
export default function PlatformDecorHomeHost() {
  const location = useLocation()
  const { urgentUnreadItems } = useTenantAnnouncements()
  const [banner, setBanner] = useState<RegistryPlatformDecorItem | null>(null)
  const [popup, setPopup] = useState<RegistryPlatformDecorItem | null>(null)
  const [popupOpen, setPopupOpen] = useState(false)

  const onHome = isHomePath(location.pathname)
  const hasUrgent = urgentUnreadItems.length > 0

  useEffect(() => {
    if (!onHome) return
    let cancelled = false
    void (async () => {
      const [b, p] = await Promise.all([
        fetchPlatformDecorItem('cs.home.banner'),
        fetchPlatformDecorItem('cs.home.popup'),
      ])
      if (cancelled) return
      setBanner(b && b.imageUrl ? b : null)
      if (p && shouldShowDecorPopup(p) && !hasUrgent) {
        setPopup(p)
        setPopupOpen(true)
      } else {
        setPopup(null)
        setPopupOpen(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [onHome, hasUrgent, location.pathname])

  if (!onHome) return null

  const closePopup = () => {
    dismissDecorPopup(popup)
    setPopupOpen(false)
  }

  return (
    <>
      {banner?.imageUrl ? (
        <button
          type="button"
          className="mb-4 block w-full overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm"
          onClick={() => openDecorLink(banner)}
        >
          <DecorMedia item={banner} className="max-h-40 w-full object-cover" alt={banner.title || '活动'} />
          {banner.title ? (
            <p className="border-t border-slate-100 px-3 py-2 text-sm font-medium text-slate-800">
              {banner.title}
            </p>
          ) : null}
        </button>
      ) : null}

      {popupOpen && popup?.imageUrl ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-[2px]">
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <button
              type="button"
              className="absolute right-2 top-2 z-10 rounded-full bg-black/55 p-1.5 text-white ring-1 ring-white/40 hover:bg-black/70"
              aria-label="关闭"
              onClick={closePopup}
            >
              <X className="h-4 w-4" />
            </button>
            <button type="button" className="block w-full text-left" onClick={() => {
              openDecorLink(popup)
              closePopup()
            }}>
              <DecorMedia item={popup} className="w-full object-cover bg-slate-900" alt={popup.title || '活动海报'} />
            </button>
            {popup.title ? (
              <p className="px-4 py-3 text-center text-sm font-semibold text-slate-900">{popup.title}</p>
            ) : null}
            <div className="border-t border-slate-200 px-4 py-3">
              <button
                type="button"
                className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-medium text-white"
                onClick={closePopup}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
