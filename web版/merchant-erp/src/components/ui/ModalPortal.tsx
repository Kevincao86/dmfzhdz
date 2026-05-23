import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * 将弹窗挂载到 document.body，避免父级 transform/filter/overflow 导致 fixed 被裁剪或 z-index 失效。
 */
export default function ModalPortal({ open, children }: { open: boolean; children: ReactNode }) {
  useEffect(() => {
    if (!open || typeof document === 'undefined') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open || typeof document === 'undefined') return null
  return createPortal(children, document.body)
}
