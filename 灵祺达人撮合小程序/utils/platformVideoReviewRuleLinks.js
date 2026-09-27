/** 短视频审核官方规则入口，与网页版 PLATFORM_VIDEO_REVIEW_RULE_GROUPS 对齐 */
const PLATFORM_VIDEO_REVIEW_RULE_GROUPS = [
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

module.exports = {
  PLATFORM_VIDEO_REVIEW_RULE_GROUPS,
}
