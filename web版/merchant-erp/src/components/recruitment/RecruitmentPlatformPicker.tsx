import { cn } from '../../cn'
import {
  normalizeRecruitmentPlatform,
  RECRUITMENT_PLATFORM_ICON_SRC,
  XINGXUAN_RECRUITMENT_PLATFORMS,
  type RecruitmentPlatform,
} from '../../lib/recruitmentPlatformOptions'

type SingleProps = {
  mode?: 'single'
  value: RecruitmentPlatform
  onChange: (platform: RecruitmentPlatform) => void
}

type MultiProps = {
  mode: 'multi'
  value: RecruitmentPlatform[]
  onChange: (platforms: RecruitmentPlatform[]) => void
}

type CommonProps = {
  label?: string
  required?: boolean
  className?: string
}

type Props = CommonProps & (SingleProps | MultiProps)

/** 与星选招募平台一致的单选/多选芯片（含 Logo） */
export default function RecruitmentPlatformPicker(props: Props) {
  const { label = '投放平台', required, className } = props
  const isMulti = props.mode === 'multi'

  const toggleMulti = (p: RecruitmentPlatform) => {
    if (!isMulti) return
    const cur = props.value
    const next = cur.includes(p) ? (cur.length > 1 ? cur.filter((x) => x !== p) : cur) : [...cur, p]
    props.onChange(next)
  }

  return (
    <div className={className}>
      <span className="mb-2 block text-sm font-medium text-gray-700">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      <div className="flex flex-wrap gap-2">
        {XINGXUAN_RECRUITMENT_PLATFORMS.map((p) => {
          const on = isMulti ? props.value.includes(p) : props.value === p
          return (
            <button
              key={p}
              type="button"
              onClick={() => {
                if (isMulti) toggleMulti(p)
                else props.onChange(p)
              }}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                on
                  ? 'border-blue-600 bg-blue-50 text-blue-800'
                  : 'border-gray-200 text-gray-700 hover:border-gray-300',
              )}
            >
              <img
                src={RECRUITMENT_PLATFORM_ICON_SRC[p]}
                alt=""
                className="h-5 w-5 shrink-0 rounded object-contain"
              />
              {p}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export {
  normalizeRecruitmentPlatform,
  XINGXUAN_RECRUITMENT_PLATFORMS,
  type RecruitmentPlatform,
}
