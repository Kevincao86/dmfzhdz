import { WORK_EDITION_LABEL, WORK_ID_LIST, type MpWorkIdentity } from '../lib/mpWorkIdentity'

type Props = {
  identity: MpWorkIdentity
  onChange: (id: MpWorkIdentity) => void
  className?: string
  variant?: 'dark' | 'light'
}

const STYLE: Record<
  MpWorkIdentity,
  { onLight: string; onDark: string }
> = {
  talent: {
    onLight: 'bg-white text-violet-700 shadow-sm ring-1 ring-violet-100',
    onDark: 'bg-violet-600 text-white shadow-sm',
  },
  shoot: {
    onLight: 'bg-white text-sky-700 shadow-sm ring-1 ring-sky-100',
    onDark: 'bg-sky-600 text-white shadow-sm',
  },
  edit: {
    onLight: 'bg-white text-teal-700 shadow-sm ring-1 ring-teal-100',
    onDark: 'bg-teal-600 text-white shadow-sm',
  },
  pr: {
    onLight: 'bg-white text-orange-600 shadow-sm ring-1 ring-orange-100',
    onDark: 'bg-orange-600 text-white shadow-sm',
  },
}

export default function WorkIdentityToggle({
  identity,
  onChange,
  className = '',
  variant = 'dark',
}: Props) {
  const track =
    variant === 'light'
      ? 'rounded-xl border border-slate-200/90 bg-slate-100/80 p-1'
      : 'rounded-lg bg-black/30 p-1'
  const off =
    variant === 'light' ? 'text-slate-500 hover:text-slate-800' : 'text-slate-400 hover:text-white'

  return (
    <div className={`grid grid-cols-2 gap-1 ${track} ${className}`}>
      {WORK_ID_LIST.map((id) => (
        <button
          key={id}
          type="button"
          className={`rounded-lg px-2 py-2 text-xs font-medium transition-colors sm:text-sm ${
            identity === id
              ? variant === 'light'
                ? STYLE[id].onLight
                : STYLE[id].onDark
              : off
          }`}
          onClick={() => onChange(id)}
        >
          {WORK_EDITION_LABEL[id]}
        </button>
      ))}
    </div>
  )
}
