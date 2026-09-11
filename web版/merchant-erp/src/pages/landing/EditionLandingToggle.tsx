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
  const track = cn('flex gap-1 border border-[var(--lq-brass)]/40 bg-black/40 p-1', className)
  const off = 'text-white/55 hover:text-white/90'
  const merchantOn = 'bg-[var(--lq-steam)] text-[var(--lq-ink)]'
  const partnerOn = 'bg-[var(--lq-steam)] text-[var(--lq-ink)]'

  return (
    <div className={track}>
      {(['merchant', 'partner'] as const).map((e) => (
        <button
          key={e}
          type="button"
          className={cn(
            'flex-1 rounded-sm py-2 text-sm font-medium transition-colors',
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
