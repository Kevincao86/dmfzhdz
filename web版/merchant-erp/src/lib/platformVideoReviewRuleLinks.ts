export type PlatformVideoReviewRuleLink = {
  title: string
  url: string
}

export type PlatformVideoReviewRuleGroup = {
  platform: string
  links: PlatformVideoReviewRuleLink[]
}

/** 短视频审核官方规则入口，按平台分类；点击应打开原网页 */
export const PLATFORM_VIDEO_REVIEW_RULE_GROUPS: PlatformVideoReviewRuleGroup[] = [
  {
    platform: '抖音',
    links: [
      { title: '规则中心', url: 'https://www.douyin.com/rule' },
      { title: '社区自律公约', url: 'https://www.douyin.com/rule/policy' },
      {
        title: '开放平台内容安全规范',
        url: 'https://developer.open-douyin.com/docs/resource/zh-CN/dop/operation-standard/content-security',
      },
      {
        title: '生活服务内容审核参考',
        url: 'https://www.lifexue.com/knowledge/detail/122977',
      },
    ],
  },
  {
    platform: '快手',
    links: [
      { title: '社区规范', url: 'https://www.kuaishou.com/norm' },
      {
        title: '开放平台审核规范',
        url: 'https://open.kuaishou.com/docs/operate/reviewSpecification/base-operation/operateSpecification',
      },
    ],
  },
  {
    platform: '微信视频号',
    links: [
      {
        title: '视频营销信息规范',
        url: 'https://developers.weixin.qq.com/doc/channels/Operating_Specifications/Store_Operation_Rules/Video_Marketing_Information.html',
      },
      {
        title: '视频号运营规范说明',
        url: 'https://developers.weixin.qq.com/community/develop/article/doc/0002e69caec998c1051e129b451c13',
      },
    ],
  },
]
