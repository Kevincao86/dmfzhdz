import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  dismissDecorPopup,
  fetchPlatformDecorItem,
  openDecorLink,
  shouldShowDecorPopup,
} from '@merchant/lib/platformDecorClient'
import { isDecorVideoMedia, type RegistryPlatformDecorItem } from '@merchant/lib/platformDecorTypes'
import { getWorkIdentity } from '../lib/mpWorkIdentity'

function isHallPath(pathname: string): boolean {
  return pathname === '/hall' || pathname === '/' || pathname.startsWith('/hall/')
}

/** 星选 DR：大厅首页活动海报弹窗（面板色随亮/暗主题，避免字色融底） */
export default function PlatformDecorDrHost() {
  const location = useLocation()
  const [popup, setPopup] = useState<RegistryPlatformDecorItem | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!isHallPath(location.pathname)) {
      setOpen(false)
      return
    }
    let cancelled = false
    const identity = getWorkIdentity()
    void fetchPlatformDecorItem('dr.home.popup', identity).then((item) => {
      if (cancelled) return
      if (item && shouldShowDecorPopup(item)) {
        setPopup(item)
        setOpen(true)
      } else {
        setPopup(null)
        setOpen(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [location.pathname])

  if (!open || !popup?.imageUrl) return null

  const close = () => {
    dismissDecorPopup(popup)
    setOpen(false)
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 backdrop-blur-[1px]"
      style={{ background: 'var(--panel-overlay, rgba(0,0,0,0.5))' }}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[var(--shell-border)] bg-[var(--panel-card)] text-[var(--shell-text)] shadow-2xl">
        <button
          type="button"
          className="absolute right-2 top-2 z-10 rounded-full bg-black/55 p-1.5 text-white ring-1 ring-white/30"
          aria-label="关闭"
          onClick={close}
        >
          <X className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="block w-full text-left"
          onClick={() => {
            openDecorLink(popup)
            close()
          }}
        >
          {isDecorVideoMedia(popup) ? (
            <video
              src={popup.imageUrl}
              className="w-full object-cover"
              autoPlay
              muted
              loop
              playsInline
            />
          ) : (
            <img src={popup.imageUrl} alt={popup.title || '活动海报'} className="w-full object-cover" />
          )}
        </button>
        {popup.title ? (
          <p className="px-4 py-3 text-center text-sm font-semibold text-[var(--shell-text)]">
            {popup.title}
          </p>
        ) : null}
        <div className="border-t border-[var(--shell-border)] px-4 py-3">
          <button
            type="button"
            className="w-full rounded-xl bg-[var(--identity-primary,#7c3aed)] py-2.5 text-sm font-medium text-white"
            onClick={close}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
