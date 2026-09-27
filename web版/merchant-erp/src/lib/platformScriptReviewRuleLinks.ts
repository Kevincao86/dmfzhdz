export type PlatformScriptReviewRuleLink = {
  title: string
  url: string
}

export type PlatformScriptReviewRuleGroup = {
  platform: string
  links: PlatformScriptReviewRuleLink[]
}

/** 文稿审核官方规则入口（小红书 / 大众点评）；点击应打开原网页 */
export const PLATFORM_SCRIPT_REVIEW_RULE_GROUPS: PlatformScriptReviewRuleGroup[] = [
  {
    platform: '小红书',
    links: [
      {
        title: '社区公约 2.0',
        url: 'https://pgy.xiaohongshu.com/help/detail?id=1eda0a065dd894063c2e029a49e8f6a1&userType=4',
      },
      {
        title: '用户协议',
        url: 'https://agree.xiaohongshu.com/h5/terms/ZXXY20220331001/-1',
      },
      {
        title: '品牌号社区运营规范',
        url: 'https://dc.xhscdn.com/file/c947aa537be9e80d802226374b5c710f/%E5%93%81%E7%89%8C%E5%8F%B7%E7%A4%BE%E5%8C%BA%E8%BF%90%E8%90%A5%E8%A7%84%E8%8C%83.pdf',
      },
      {
        title: '创作者中心帮助',
        url: 'https://creator.xiaohongshu.com/help',
      },
    ],
  },
  {
    platform: '大众点评',
    links: [
      {
        title: '用户服务协议',
        url: 'https://www.dianping.com/aboutus/protocol',
      },
      {
        title: '美团点评规则中心',
        url: 'https://rules-center.meituan.com/',
      },
      {
        title: '点评网关于我们 / 规则入口',
        url: 'https://www.dianping.com/aboutus',
      },
    ],
  },
]
