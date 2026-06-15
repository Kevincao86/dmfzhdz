/**
 * 备案期：仅走微信云开发，手机不访问已暂停的域名
 * 备案通过后见 config.release.after-beian.example.js
 */
module.exports = {
  MP_USE_CLOUD_PROXY: true,
  /** 必填：微信开发者工具 → 云开发 → 环境 ID */
  MP_CLOUD_ENV: 'cloud1-d4g6yyypee3d656cb',
  /** 备案恢复直连后的 API 根地址（当前可不解析） */
  MERCHANT_API_BASE_URL: 'https://mofangdianai.com/erp-api',
  /** 云函数用 IP 访问轻量（与云开发环境变量一致，仅文档用） */
  MP_ERP_IP: '139.196.42.5',
  MP_ERP_HOST: 'mofangdianai.com',
  MP_BUILD_ID: 'mp-20260616-region-cloud-first',
  /**
   * 微信公众平台 → 设置 → 用户隐私保护指引 勾选「模糊位置」且审核通过后改为 true，
   * 并恢复 app.json 中 scope.userFuzzyLocation + requiredPrivateInfos.getFuzzyLocation
   */
  MP_USE_FUZZY_LOCATION: false,
  /** 分享封面远程 CDN（可选）；小程序默认用包内 images/share/share-cover-ai-match.jpg */
  MP_SHARE_COVER_URL: '',
  /** 星选 Web / ECS 静态封面（真机 downloadFile 合法域名，优先于 OSS） */
  RECRUIT_COVER_CDN_BASE: 'https://mofangdianai.com/recruit-covers',
  /** 真机优先包内图；CDN HTTPS 异常时仍可用分享封面 */
  MP_COVER_PREFER_CDN: false,
  /** 远程图缓存版本（改图后 bump，避免微信缓存旧 JPEG） */
  MP_ASSET_CACHE_VER: '20260615e',
  /** 小程序封面图库：OSS 公网 URL（upload-mp-recruit-covers-oss.js 写入 recruitCoverOssBase.js） */
  MP_COVER_USE_BUNDLE: false,
  /** 群聊复制文案 #小程序:// 名称，须与微信公众平台小程序昵称一致 */
  MP_SHARE_APP_NAME: '灵祺星选',
  /** 正式体验版仅展示数据库商单；开发者工具可在 config.local.js 设为 true 看演示 */
  MP_SHOW_DEMO_ORDERS: false,
}
