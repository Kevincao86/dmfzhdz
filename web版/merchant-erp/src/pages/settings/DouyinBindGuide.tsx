import PlatformBindGuide from './bindGuide/PlatformBindGuide'
import { DOUYIN_BIND_GUIDE } from './bindGuide/douyinBindGuideConfig'

type Props = {
  className?: string
  compact?: boolean
}

export default function DouyinBindGuide({ className, compact }: Props) {
  return <PlatformBindGuide config={DOUYIN_BIND_GUIDE} className={className} compact={compact} />
}
