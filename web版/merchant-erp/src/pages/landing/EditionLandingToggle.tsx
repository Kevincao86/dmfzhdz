import { cn } from '../../cn'
import type { LandingEditionKey } from './landingConfig'
import { EDITION_LABEL } from './landingConfig'

type Props = {
  siteEdition: LandingEditionKey
  viewEdition: LandingEditionKey
  onViewEditionChange: (e: LandingEditionKey) => void
  className?: string
}

/** 落地页右下：商家版 / 服务商版（预览文案；对端需跳转） */
export default function EditionLandingToggle({
  siteEdition,
  viewEdition,
  onViewEditionChange,
  className = '',
}: Props) {
  const track = cn('flex gap-1 rounded-xl border border-white/20 bg-black/35 p-1 backdrop-blur-md', className)
  const off = 'text-white/55 hover:text-white/90'
  const merchantOn = 'bg-white text-cyan-800 shadow-sm'
  const partnerOn = 'bg-white text-violet-800 shadow-sm'

  return (
    <div className={track}>
      {(['merchant', 'partner'] as const).map((e) => (
        <button
          key={e}
          type="button"
          className={cn(
            'flex-1 rounded-lg py-2 text-sm font-medium transition-colors',
            viewEdition === e ? (e === 'merchant' ? merchantOn : partnerOn) : off,
          )}
          onClick={() => onViewEditionChange(e)}
        >
          {EDITION_LABEL[e]}
          {siteEdition === e ? (
            <span className="ml-1 text-[10px] font-normal opacity-70">当前站</span>
          ) : null}
        </button>
      ))}
    </div>
  )
}
