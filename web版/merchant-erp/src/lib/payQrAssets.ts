/** 订阅 / 充值扫码收款图（public/subscription/） */

import { merchantStaticUrl } from './webStaticOssAssets'

export type PayQrChannel = 'wechat' | 'alipay'

const TIER_AMOUNTS = ['100', '300', '500'] as const

export function resolvePayQrImageUrl(
  channel: PayQrChannel,
  opts: { useCustom: boolean; tierIndex: number },
): string {
  if (opts.useCustom) {
    const name = channel === 'wechat' ? 'wechat-pay-custom' : 'alipay-custom'
    return merchantStaticUrl(`/subscription/${name}.png`)
  }
  const amt = TIER_AMOUNTS[opts.tierIndex] ?? TIER_AMOUNTS[0]
  const name = channel === 'wechat' ? `wechat-pay-${amt}` : `alipay-${amt}`
  return merchantStaticUrl(`/subscription/${name}.png`)
}

/** 固定收款码（运营配置页展示） */
export function resolvePayQrPresetUrl(channel: PayQrChannel): string {
  const name = channel === 'wechat' ? 'wechat-pay-qr' : 'alipay-qr'
  return merchantStaticUrl(`/subscription/${name}.png`)
}
