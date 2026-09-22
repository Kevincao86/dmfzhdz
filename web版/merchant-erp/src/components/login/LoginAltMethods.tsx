import { cn } from '../../cn'

export type LoginAltMethodId = 'password' | 'sms' | 'wechat' | 'douyin'

export type LoginAltMethod = {
  id: LoginAltMethodId
  label: string
  disabled?: boolean
  hint?: string
}

type Props = {
  methods: LoginAltMethod[]
  activeId?: LoginAltMethodId
  onSelect: (id: LoginAltMethodId) => void
}

function SmsIcon() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-50 text-lg" aria-hidden>
      📱
    </span>
  )
}

function WechatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden>
      <circle cx="12" cy="12" r="12" fill="#07C160" />
      <path
        fill="#fff"
        d="M9.2 7.4c-2.9 0-5.2 1.9-5.2 4.3 0 1.4.8 2.6 2.1 3.4l-.5 1.6 1.9-1c.5.1 1 .2 1.6.2.2 0 .5 0 .7-.1-.2-.4-.2-.9-.2-1.3 0-2.2 2.1-4 4.7-4 .2 0 .4 0 .6.1C14.4 8.7 12 7.4 9.2 7.4zm-2 3.2a.8.8 0 1 1 0-1.5.8.8 0 0 1 0 1.5zm4 0a.8.8 0 1 1 0-1.5.8.8 0 0 1 0 1.5z"
      />
      <path
        fill="#fff"
        d="M19.9 16.1c0-1.9-2-3.5-4.4-3.5s-4.4 1.6-4.4 3.5 2 3.5 4.4 3.5c.4 0 .8 0 1.2-.1l1.6.8-.4-1.4c1.2-.7 2-1.8 2-3zm-5.7-.7a.6.6 0 1 1 0-1.3.6.6 0 0 1 0 1.3zm2.7 0a.6.6 0 1 1 0-1.3.6.6 0 0 1 0 1.3z"
      />
    </svg>
  )
}

function DouyinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden>
      <circle cx="12" cy="12" r="12" fill="#111" />
      <path
        fill="#25F4EE"
        d="M14.4 6.2v7.1c0 1.4-1.1 2.6-2.6 2.6-1.4 0-2.6-1.1-2.6-2.6s1.2-2.6 2.6-2.6c.2 0 .4 0 .6.1V9c-.2 0-.4-.1-.6-.1-2.5 0-4.5 2-4.5 4.5S9.3 18 11.8 18s4.5-2 4.5-4.5V9.3c.8.7 1.8 1.1 2.9 1.2V8.5c-1.6-.2-2.9-1.3-3.3-2.8h-1.5z"
      />
      <path
        fill="#FE2C55"
        d="M13.9 6.7v7.1c0 1.4-1.1 2.6-2.6 2.6-.4 0-.8-.1-1.1-.3 1.2-.4 2-1.5 2-2.8V7.4h1.7z"
      />
      <path
        fill="#fff"
        d="M13.4 7.2v7.1c0 1.4-1.1 2.6-2.6 2.6S8.2 15.7 8.2 14.3s1.2-2.6 2.6-2.6c.2 0 .4 0 .6.1V10c-.2 0-.4-.1-.6-.1-2.5 0-4.5 2-4.5 4.5S8.3 19 10.8 19s4.5-2 4.5-4.5V8.3h-1.9z"
      />
    </svg>
  )
}

function MethodIcon({ id }: { id: LoginAltMethodId }) {
  if (id === 'sms') return <SmsIcon />
  if (id === 'wechat') return <WechatIcon />
  if (id === 'douyin') return <DouyinIcon />
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-600">
      账
    </span>
  )
}

export default function LoginAltMethods({ methods, activeId, onSelect }: Props) {
  return (
    <div className="mt-6">
      <div className="relative mb-4">
        <div className="absolute inset-0 flex items-center" aria-hidden>
          <div className="w-full border-t border-slate-200/80" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white/80 px-3 text-xs text-slate-400">或使用</span>
        </div>
      </div>
      <div className={cn('grid gap-2', methods.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : methods.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
        {methods.map((m) => (
          <button
            key={m.id}
            type="button"
            title={m.hint ?? m.label}
            disabled={m.disabled}
            onClick={() => onSelect(m.id)}
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition',
              activeId === m.id
                ? 'border-cyan-400 ring-2 ring-cyan-500/20'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
              m.disabled && 'cursor-not-allowed opacity-55 hover:bg-white',
            )}
          >
            <MethodIcon id={m.id} />
            {m.label}
          </button>
        ))}
      </div>
    </div>
  )
}
