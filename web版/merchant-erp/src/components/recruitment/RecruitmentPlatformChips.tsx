import { cn } from '../../cn'
import { RECRUITMENT_PLATFORMS, type RecruitmentPlatform } from '../../lib/recruitmentInfoFilter'

type Props = {
  value: RecruitmentPlatform
  onChange: (platform: RecruitmentPlatform) => void
  label?: string
  required?: boolean
  className?: string
}

/** 与招募表单一致的投放平台芯片选择 */
export default function RecruitmentPlatformChips({
  value,
  onChange,
  label = '投放平台',
  required,
  className,
}: Props) {
  return (
    <div className={className}>
      <span className="mb-2 block text-sm font-medium embed-text-primary">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      <div className="flex flex-wrap gap-2">
        {RECRUITMENT_PLATFORMS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={cn(
              'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
              value === p
                ? 'border-blue-600 bg-blue-50 text-blue-800'
                : 'border-gray-200 text-gray-700 hover:border-gray-300',
            )}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}

export { RECRUITMENT_PLATFORMS, type RecruitmentPlatform }
