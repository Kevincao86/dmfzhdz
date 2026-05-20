import { cn } from '../../cn'
import { PRODUCT_CREATE_PLATFORMS } from '../../constants/productCreatePlatforms'
import type { StorePlatformTab } from '../../services/merchantStoresApi'

const IDS = PRODUCT_CREATE_PLATFORMS.map((p) => p.id) as StorePlatformTab[]

export function isStorePlatformTab(s: string): s is StorePlatformTab {
  return (IDS as string[]).includes(s)
}

export default function StorePlatformSwitcher({
  value,
  onChange,
}: {
  value: StorePlatformTab
  onChange: (v: StorePlatformTab) => void
}) {
  return (
    <div className="mb-6 flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2">
      {PRODUCT_CREATE_PLATFORMS.map((p) => {
        const on = p.id === value
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              on
                ? 'bg-white text-blue-700 shadow-sm ring-1 ring-gray-200'
                : 'text-gray-600 hover:bg-white/80',
            )}
          >
            {p.name}
            {'comingSoon' in p && p.comingSoon ? (
              <span className="ml-1.5 text-xs font-normal text-amber-600">即将</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
