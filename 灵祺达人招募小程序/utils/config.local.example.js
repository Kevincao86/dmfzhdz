/** 复制为 config.local.js（已 gitignore）后填写 */
module.exports = {
  MERCHANT_API_BASE_URL: 'http://192.168.1.100:5173',
  /** 可选：报名分享链接（微信 URL Link），如 https://wxaurl.cn/xxx?mpId={mpId} */
  MP_SHARE_APPLY_BASE_URL: '',
  /**
   * 可选：直连 Supabase（anon）。未配置时，私信与「联系客服」走 MERCHANT_API_BASE_URL 代理即可。
   */
  SUPABASE_URL: 'https://xxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJ...',
  /** 开发：消息页显示「打开测试对话」入口 */
  MP_CHAT_DEV_TEST: true,
  /** 开发专用：true=达人误看 PR「推荐达人」页；正常请保持 false */
  MP_TEST_TALENT_ON_RECOMMEND: false,
}
