/** 灵祺达人撮合小程序 — 微信订阅消息模板（公众平台「我的模板」） */
export const MP_SUBSCRIBE_TEMPLATES = {
  /** 报名审核通知（PR 入选） */
  auditPass: 'HR_2V9NYdv7epS8peQqB6rijOXhPgTYAZmwaon3Gsrg',
  /** 审核驳回通知（视频/链接驳回） */
  videoReject: 'RBI40YXz-Q4M8fAruxuT3oZ7o09le-_zstFx4VyJEuA',
  /** 审核通过通知（视频/链接通过） */
  videoPass: '50rPxvWW1aBLLLK0cyqV9YJbhlENqbyR4EZc68LDmUI',
} as const

export type MpSubscribeTemplateKey = keyof typeof MP_SUBSCRIBE_TEMPLATES
