/**
 * 生产环境 API 根地址（复制为 config.release.js 后提交，或仅在本地 config.local.js 填写同一 URL）。
 * 须为商家 ERP 的 Vercel HTTPS 域名（与仓库根 vercel.json 部署一致），末尾不要加 /。
 *
 * 示例：
 *   MERCHANT_API_BASE_URL: 'https://your-merchant-erp.vercel.app',
 */
module.exports = {
  MERCHANT_API_BASE_URL: 'https://your-merchant-erp.vercel.app',
  /** 可选：微信 URL Link 或 H5 报名落地页，支持 {mpId} 占位符 */
  MP_SHARE_APPLY_BASE_URL: '',
}
