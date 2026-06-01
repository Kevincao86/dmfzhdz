import { Eye, EyeOff } from 'lucide-react'
import { useState, type InputHTMLAttributes } from 'react'
import { cn } from '../cn'

export type SecretInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  wrapperClassName?: string
  toggleClassName?: string
}

/** 密码 / API Key 输入框，右侧小眼睛切换明文显示 */
export default function SecretInput({
  className,
  wrapperClassName,
  toggleClassName,
  disabled,
  ...props
}: SecretInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className={cn('relative', wrapperClassName)}>
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        className={cn('pr-10', className)}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? '隐藏' : '显示'}
        className={cn(
          'absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-40',
          toggleClassName,
        )}
      >
        {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  )
}
