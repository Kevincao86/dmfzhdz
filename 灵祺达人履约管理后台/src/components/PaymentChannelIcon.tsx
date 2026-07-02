import WebStaticOssImage from '@merchant/components/WebStaticOssImage'
import type { MpMembershipPayChannel } from '../lib/mpMembershipApi'

const LABEL: Record<MpMembershipPayChannel, string> = {
  wechat: '微信支付',
  alipay: '支付宝',
  douyin: '抖音支付',
}

export function PaymentChannelIcon({
  channel,
  className = 'xx-membership-pay-sheet__channel-icon',
}: {
  channel: MpMembershipPayChannel
  className?: string
}) {
  return (
    <WebStaticOssImage
      app="dr"
      localPath={`/payment/${channel}.png`}
      alt={LABEL[channel]}
      className={className}
    />
  )
}
