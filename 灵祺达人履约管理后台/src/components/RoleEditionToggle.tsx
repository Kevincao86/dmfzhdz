import type { MpAccountRole } from '../lib/mpSession'

type Props = {
  role: MpAccountRole
  onChange: (role: MpAccountRole) => void
  className?: string
}

/** 登录页 / 侧栏共用的达人版 · PR 版切换 */
export default function RoleEditionToggle({ role, onChange, className = '' }: Props) {
  return (
    <div className={`flex gap-1 rounded-lg bg-black/30 p-1 ${className}`}>
      <button
        type="button"
        className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
          role === 'talent' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
        }`}
        onClick={() => onChange('talent')}
      >
        达人版
      </button>
      <button
        type="button"
        className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
          role === 'pr' ? 'bg-orange-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
        }`}
        onClick={() => onChange('pr')}
      >
        PR 版
      </button>
    </div>
  )
}
