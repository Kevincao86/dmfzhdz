type Props = {
  checked: boolean
  onChange: (checked: boolean) => void
  className?: string
}

export default function RememberPasswordRow({ checked, onChange, className }: Props) {
  return (
    <label className={className ?? 'flex items-center gap-2 text-sm text-slate-600'}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500/30"
      />
      记住密码
    </label>
  )
}
