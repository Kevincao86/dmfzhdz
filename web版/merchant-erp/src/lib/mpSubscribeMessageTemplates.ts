/** 灵祺达人撮合小程序 — 微信订阅消息模板（公众平台「我的模板」） */
export const MP_SUBSCRIBE_TEMPLATES = {
  /** 报名审核通知（PR 入选） */
  auditPass: 'HR_2V9NYdv7epS8peQqB6rijOXhPgTYAZmwaon3Gsrg',
  /** 审核驳回通知（视频/链接驳回） */
  videoReject: 'RBI40YXz-Q4M8fAruxuT3oZ7o09le-_zstFx4VyJEuA',
  /** 审核通过通知（视频/链接通过） */
  videoPass: '50rPxvWW1aBLLLK0cyqV9YJbhlENqbyR4EZc68LDmUI',
  /** 新订单提醒 — 商单订阅匹配（订单标题/商家/地点/内容/温馨提示） */
  orderMatch: 'oTL0yWf_l6lxYkeUaFJk_AyZ4dYlh_x48fmpMu6vF9E',
  /** 预约成功通知 — 商单日历探店/交片提醒（time10/thing13/thing18） */
  calendarReminder: 'Sx7mUGpC6VsS5mtBmjaJ3z-O-JjwdNmJjsSSQ1G9keQ',
} as const

export type MpSubscribeTemplateKey = keyof typeof MP_SUBSCRIBE_TEMPLATES
