/** 复制为 config.local.js（已 gitignore）后填写 */
module.exports = {
  MERCHANT_API_BASE_URL: 'http://192.168.1.100:5173',
  /** 可选：报名分享链接（微信 URL Link），如 https://wxaurl.cn/xxx?mpId={mpId} */
  MP_SHARE_APPLY_BASE_URL: '',
  /** 可选：配置后与 ERP 共用 Supabase，消息走 RPC + Realtime（轮询同步） */
  SUPABASE_URL: 'https://xxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJ...',
  /** 开发：消息页显示「打开测试对话」入口 */
  MP_CHAT_DEV_TEST: true,
  /** 开发：达人身份在「推荐」Tab 展示推荐达人列表，并置顶本地「我的信息」 */
  MP_TEST_TALENT_ON_RECOMMEND: true,
}
