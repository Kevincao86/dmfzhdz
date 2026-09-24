import { cn } from '../../cn'
import wechatLogo from './LoginAltMethods.wechat.png'

export type LoginAltMethodId = 'password' | 'sms' | 'email' | 'wechat' | 'douyin'

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

function DouyinIcon() {
  return (
    <svg viewBox="0 0 34 34" className="h-8 w-8 shrink-0 rounded-lg" aria-hidden>
      <rect width="34" height="34" rx="8" fill="#161823" />
      <g transform="translate(1.6 0.4) scale(0.96)">
        <path
          fill="#00FAF0"
          d="M11.6394 13.4341V12.1233C11.184 12.0686 10.7286 12.0322 10.255 12.0322C4.60798 12.0322 -0.000732422 16.6203 -0.000732422 22.2825C-0.000732422 25.7417 1.72981 28.8186 4.37116 30.6756C2.65884 28.8368 1.62052 26.3971 1.62052 23.7026C1.63873 18.1132 6.10171 13.5616 11.6394 13.4341Z"
        />
        <path
          fill="#00FAF0"
          d="M11.8766 28.345C14.3905 28.345 16.4489 26.3423 16.54 23.848V1.5451H20.6205C20.5294 1.08994 20.4929 0.616574 20.4929 0.125H14.9188V22.4279C14.8277 24.9222 12.7692 26.9249 10.2554 26.9249C9.47209 26.9249 8.72522 26.7246 8.08765 26.3787C8.94381 27.5803 10.3282 28.345 11.8766 28.345Z"
        />
        <path
          fill="#00FAF0"
          d="M28.2514 9.11927V7.88124C26.7031 7.88124 25.2458 7.42608 24.0253 6.625C25.1182 7.86304 26.5938 8.75514 28.2514 9.11927Z"
        />
        <path
          fill="#FF0050"
          d="M24.0449 6.6255C22.8609 5.26002 22.1323 3.49399 22.1323 1.5459H20.6385C21.0393 3.65785 22.2962 5.4785 24.0449 6.6255Z"
        />
        <path
          fill="#FF0050"
          d="M10.2551 17.5847C7.66836 17.5847 5.57349 19.6784 5.57349 22.2637C5.57349 24.0662 6.5936 25.6137 8.08733 26.3966C7.54084 25.6319 7.19473 24.6852 7.19473 23.6656C7.19473 21.0803 9.28961 18.9866 11.8763 18.9866C12.3499 18.9866 12.8236 19.0594 13.2608 19.205V13.5246C12.8054 13.47 12.3499 13.4336 11.8763 13.4336C11.8035 13.4336 11.7124 13.4336 11.6395 13.4336V17.8031C11.2023 17.6575 10.7469 17.5847 10.2551 17.5847Z"
        />
        <path
          fill="#FF0050"
          d="M28.2523 9.11914V13.4523C25.356 13.4523 22.6964 12.5238 20.5104 10.958V22.2642C20.5104 27.9082 15.9199 32.5144 10.2547 32.5144C8.06873 32.5144 6.04672 31.8226 4.38904 30.6574C6.26531 32.6601 8.92489 33.9345 11.8941 33.9345C17.5412 33.9345 22.1499 29.3465 22.1499 23.6843V12.3781C24.3358 13.9439 27.0136 14.8724 29.8918 14.8724V9.30121C29.3271 9.283 28.7806 9.22838 28.2523 9.11914Z"
        />
        <path
          fill="#FFFFFF"
          d="M20.5094 22.2648V10.9586C22.6953 12.5244 25.3731 13.4529 28.2513 13.4529V9.11977C26.5754 8.75565 25.1181 7.86354 24.0251 6.6255C22.2763 5.4967 21.0194 3.67605 20.6369 1.5459H16.5564V23.8488C16.4653 26.3431 14.4069 28.3458 11.8931 28.3458C10.3265 28.3458 8.94202 27.5811 8.10407 26.3977C6.61034 25.6148 5.59023 24.0491 5.59023 22.2648C5.59023 19.6795 7.6851 17.5858 10.2718 17.5858C10.7454 17.5858 11.2191 17.6586 11.6562 17.8042V13.4347C6.1185 13.5621 1.65552 18.1138 1.65552 23.6667C1.65552 26.3613 2.69384 28.8191 4.40617 30.6398C6.06385 31.805 8.10408 32.4969 10.2718 32.4969C15.9006 32.5151 20.5094 27.9088 20.5094 22.2648Z"
        />
      </g>
    </svg>
  )
}

function BrandLogo({ src }: { src: string }) {
  return <img src={src} alt="" draggable={false} className="h-8 w-8 shrink-0 rounded-lg object-contain" />
}

function EmailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 shrink-0" aria-hidden>
      <rect width="24" height="24" rx="6" fill="#0d9488" />
      <path
        fill="#fff"
        d="M6.4 7.2h11.2c.7 0 1.2.5 1.2 1.2v7.2c0 .7-.5 1.2-1.2 1.2H6.4c-.7 0-1.2-.5-1.2-1.2V8.4c0-.7.5-1.2 1.2-1.2zm5.6 5.1 5.4-3.3H6.6L12 12.3zm0 1.3-5.6-3.4v6.2h11.2V10.2L12 13.6z"
      />
    </svg>
  )
}

function MethodIcon({ id }: { id: LoginAltMethodId }) {
  if (id === 'sms') return <SmsIcon />
  if (id === 'email') return <EmailIcon />
  if (id === 'wechat') return <BrandLogo src={wechatLogo} />
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
      <div
        className={cn(
          'grid gap-2',
          methods.length >= 4
            ? 'grid-cols-2'
            : methods.length === 3
              ? 'grid-cols-1 sm:grid-cols-3'
              : methods.length === 1
                ? 'grid-cols-1'
                : 'grid-cols-2',
        )}
      >
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
