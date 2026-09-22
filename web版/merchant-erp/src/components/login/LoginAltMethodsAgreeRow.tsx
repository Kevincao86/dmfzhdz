import { Link } from 'react-router-dom'
import { cn } from '../../cn'

export const LOGIN_AGREE_REQUIRED = '请先勾选并同意软件服务及许可协议和隐私政策'

type Props = {
  checked: boolean
  onChange: (v: boolean) => void
  className?: string
}

export default function LoginAltMethodsAgreeRow({ checked, onChange, className }: Props) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2 text-xs leading-relaxed text-slate-600', className)}>
      <input
        type="checkbox"
        className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500/30"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        我已阅读并同意{' '}
        <Link to="/legal/aup" className="text-cyan-700 hover:underline" onClick={(e) => e.stopPropagation()}>
          软件服务及许可协议
        </Link>
        {' '}和{' '}
        <Link to="/legal/privacy" className="text-cyan-700 hover:underline" onClick={(e) => e.stopPropagation()}>
          隐私政策
        </Link>
      </span>
    </label>
  )
}
