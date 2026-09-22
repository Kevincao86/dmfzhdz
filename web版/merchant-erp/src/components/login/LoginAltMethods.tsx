import { cn } from '../../cn'
import wechatLogo from './LoginAltMethods.wechat.png'
import douyinLogo from './LoginAltMethods.douyin.svg'

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
    <svg viewBox="0 0 24 24" className="h-8 w-8 shrink-0" aria-hidden>
      <rect width="24" height="24" rx="6" fill="#06b6d4" />
      <path
        fill="#fff"
        d="M17.2 6.2H6.8c-.9 0-1.6.7-1.6 1.6v7.1c0 .9.7 1.6 1.6 1.6h2.1v2.3l3.4-2.3h4.9c.9 0 1.6-.7 1.6-1.6V7.8c0-.9-.7-1.6-1.6-1.6zM8.4 11.4c-.5 0-.9-.4-.9-.9s.4-.9.9-.9.9.4.9.9-.4.9-.9.9zm3.6 0c-.5 0-.9-.4-.9-.9s.4-.9.9-.9.9.4.9.9-.4.9-.9.9zm3.6 0c-.5 0-.9-.4-.9-.9s.4-.9.9-.9.9.4.9.9-.4.9-.9.9z"
      />
    </svg>
  )
}

function BrandLogo({ src, alt }: { src: string; alt: string }) {
  return <img src={src} alt={alt} draggable={false} className="h-8 w-8 shrink-0 rounded-lg object-contain" />
}

function MethodIcon({ id }: { id: LoginAltMethodId }) {
  if (id === 'sms') return <SmsIcon />
  if (id === 'wechat') return <BrandLogo src={wechatLogo} alt="" />
  if (id === 'douyin') return <BrandLogo src={douyinLogo} alt="" />
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
