import type { MpAccountRole } from '../lib/mpSession'

type Props = {
  role: MpAccountRole
  onChange: (role: MpAccountRole) => void
  className?: string
  /** 登录页浅色玻璃风格 */
  variant?: 'dark' | 'light'
}

/** 登录页 / 侧栏共用的达人版 · PR 版切换 */
export default function RoleEditionToggle({
  role,
  onChange,
  className = '',
  variant = 'dark',
}: Props) {
  const track =
    variant === 'light'
      ? 'rounded-xl border border-slate-200/90 bg-slate-100/80 p-1'
      : 'rounded-lg bg-black/30 p-1'
  const off =
    variant === 'light'
      ? 'text-slate-500 hover:text-slate-800'
      : 'text-slate-400 hover:text-white'
  const talentOn =
    variant === 'light' ? 'bg-white text-violet-700 shadow-sm ring-1 ring-violet-100' : 'bg-violet-600 text-white shadow-sm'
  const prOn =
    variant === 'light' ? 'bg-white text-orange-600 shadow-sm ring-1 ring-orange-100' : 'bg-orange-600 text-white shadow-sm'

  return (
    <div className={`flex gap-1 ${track} ${className}`}>
      <button
        type="button"
        className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
          role === 'talent' ? talentOn : off
        }`}
        onClick={() => onChange('talent')}
      >
        达人版
      </button>
      <button
        type="button"
        className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${role === 'pr' ? prOn : off}`}
        onClick={() => onChange('pr')}
      >
        PR 版
      </button>
    </div>
  )
}
