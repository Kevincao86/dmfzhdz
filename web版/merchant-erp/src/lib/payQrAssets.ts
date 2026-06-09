/** 订阅 / 充值扫码收款图（public/subscription/） */

export type PayQrChannel = 'wechat' | 'alipay'

const TIER_AMOUNTS = ['100', '300', '500'] as const

export function resolvePayQrImageUrl(
  channel: PayQrChannel,
  opts: { useCustom: boolean; tierIndex: number },
): string {
  const base = `${import.meta.env.BASE_URL}subscription/`
  if (opts.useCustom) {
    return `${base}${channel === 'wechat' ? 'wechat-pay-custom' : 'alipay-custom'}.png`
  }
  const amt = TIER_AMOUNTS[opts.tierIndex] ?? TIER_AMOUNTS[0]
  return `${base}${channel === 'wechat' ? 'wechat-pay' : 'alipay'}-${amt}.png`
}
