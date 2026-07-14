import { isPartnerEdition } from '../../lib/appEdition'
import PlatformBindGuide from './bindGuide/PlatformBindGuide'
import { DOUYIN_BIND_GUIDE } from './bindGuide/douyinBindGuideConfig'
import { DOUYIN_PARTNER_BIND_GUIDE } from './bindGuide/douyinPartnerBindGuideConfig'

type Props = {
  className?: string
  compact?: boolean
}

export default function DouyinBindGuide({ className, compact }: Props) {
  const config = isPartnerEdition() ? DOUYIN_PARTNER_BIND_GUIDE : DOUYIN_BIND_GUIDE
  return <PlatformBindGuide config={config} className={className} compact={compact} />
}
