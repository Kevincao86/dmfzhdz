import PlatformBindGuide from './bindGuide/PlatformBindGuide'
import { KUAISHOU_BIND_GUIDE } from './bindGuide/kuaishouBindGuideConfig'

type Props = {
  className?: string
  compact?: boolean
}

export default function KuaishouBindGuide({ className, compact }: Props) {
  return <PlatformBindGuide config={KUAISHOU_BIND_GUIDE} className={className} compact={compact} />
}
