import type { MpAccount } from './mpSession'

export type MpPlatformBindTag = {
  key: 'wechat' | 'douyin'
  label: string
  bound: boolean
}

/** 我的页：微信 openid / 抖音 dy_openid 绑定态文案 */
export function mpPlatformBindTags(account: MpAccount | null | undefined): MpPlatformBindTag[] {
  const wxBound = Boolean(String(account?.openid || '').trim())
  const dyBound = Boolean(
    String(account?.dyOpenid || (account as { dy_openid?: string | null } | null)?.dy_openid || '').trim(),
  )
  return [
    { key: 'wechat', label: wxBound ? '已绑定微信' : '未绑定微信', bound: wxBound },
    { key: 'douyin', label: dyBound ? '已绑定抖音' : '未绑定抖音', bound: dyBound },
  ]
}
