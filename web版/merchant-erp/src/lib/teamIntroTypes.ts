export type RegistryTeamIntro = {
  /** 标题下副标题，默认公司全称 */
  subtitle?: string
  /** 正文段落；可用 {{product}} 占位符，各版本前端按产品名替换 */
  paragraphs: string[]
  updatedAt: string
}

export type TeamIntroPublicPayload = {
  ok: true
  intro: RegistryTeamIntro
}
