import { useEffect, useRef } from 'react'
import { cn } from '../../cn'
import { WORK_ID_LIST, type MpWorkIdentity } from '../../lib/mpWorkIdentity'
import { IDENTITY_MASCOT_SRC } from '../../lib/identityMascotAssets'
import { ROLE_LABEL, ROLE_PICKER_DESC } from './landingCopy'

type Props = {
  open: boolean
  onClose: () => void
  title?: string
  onPick: (role: MpWorkIdentity) => void
}

const CARD_TONE: Record<MpWorkIdentity, string> = {
  talent: 'role-picker-card--talent',
  shoot: 'role-picker-card--shoot',
  edit: 'role-picker-card--edit',
  pr: 'role-picker-card--pr',
}

export default function LandingRolePicker({ open, onClose, title = '选择登录版本', onPick }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-picker-title"
        className="role-picker-panel w-full max-w-sm rounded-2xl border border-white/20 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="role-picker-title" className="text-lg font-bold text-slate-900">
          {title}
        </h3>
        <p className="mt-1 text-sm text-slate-500">与达人招募小程序账号互通，登录后进入对应工作台</p>
        <div className="mt-5 grid gap-3">
          {WORK_ID_LIST.map((role) => (
            <button
              key={role}
              type="button"
              className={cn('role-picker-card', CARD_TONE[role])}
              onClick={() => onPick(role)}
            >
              <div className="role-picker-card__body">
                <span className="role-picker-card__title">{ROLE_LABEL[role]}</span>
                <p className="role-picker-card__desc">{ROLE_PICKER_DESC[role]}</p>
              </div>
              <img
                src={IDENTITY_MASCOT_SRC[role]}
                alt=""
                className="role-picker-card__mascot"
                aria-hidden
                draggable={false}
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          className="mt-4 w-full rounded-lg py-2 text-sm text-slate-500 hover:text-slate-800"
          onClick={onClose}
        >
          取消
        </button>
      </div>
    </div>
  )
}
