/**
 * 备案通过后：真机直连 https://mofangdianai.com/erp-api（不走云函数）
 * 备案期配置见 git 历史；本地调试仍可用 config.local.js
 */
module.exports = {
  MP_USE_CLOUD_PROXY: false,
  MP_CLOUD_ENV: '',
  MERCHANT_API_BASE_URL: 'https://mofangdianai.com/erp-api',
  /** 仅开发者工具内可选 IP 直连（真机须合法域名） */
  MP_ERP_IP: '139.196.42.5',
  MP_ERP_HOST: 'mofangdianai.com',
  MP_BUILD_ID: 'mp-20260626-oss-hardlock',
  /** 模拟定位已移除：资料页仅手动选择省/市 */
  MP_USE_FUZZY_LOCATION: false,
  MP_IP_LOCATE_ENABLED: false,
  /** 分享封面远程 CDN（可选）；默认走 RECRUIT_COVER_CDN_BASE/share/… */
  MP_SHARE_COVER_URL: '',
  /** 星选 Web / ECS 静态封面（真机 downloadFile 合法域名，优先于 OSS） */
  RECRUIT_COVER_CDN_BASE: 'https://mofangdianai.com/recruit-covers',
  /** 分享/身份图仅 CDN（images/share、identity 不打包，主包 <2MB 真机调试） */
  MP_COVER_PREFER_CDN: true,
  /** 欢迎页身份 3D 图优先 OSS（CDN /recruit-covers/identity 需 ecs-sync 同步；OSS 见 upload-mp-recruit-covers-oss） */
  MP_IDENTITY_ICON_PREFER_OSS: true,
  /** 商家审核通知分享海报优先 OSS（upload-mp-recruit-covers-oss.js 上传 share/merchant-notify-*.png） */
  MP_MERCHANT_NOTIFY_POSTER_PREFER_OSS: true,
  /** 远程图缓存版本（改图后 bump，避免微信缓存旧 JPEG） */
  MP_ASSET_CACHE_VER: '20260704b',
  /** 小程序封面图库：OSS 公网 URL（upload-mp-recruit-covers-oss.js 写入 recruitCoverOssBase.js） */
  MP_COVER_USE_BUNDLE: false,
  /** 群聊复制文案 #小程序:// 名称，须与微信公众平台小程序昵称一致 */
  MP_SHARE_APP_NAME: '灵祺星选',
  /** 正式体验版仅展示数据库商单；开发者工具可在 config.local.js 设为 true 看演示 */
  MP_SHOW_DEMO_ORDERS: false,
}
