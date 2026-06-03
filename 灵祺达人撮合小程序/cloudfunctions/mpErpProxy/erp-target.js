/**
 * 备案期默认连阿里云轻量（改 IP 后重新「上传并部署」云函数即可，无需控制台环境变量）
 */
/** 阿里云控制台 → 轻量应用服务器 → 复制「公网 IP」，改完重新部署云函数 */
module.exports = {
  ip: '139.196.42.5',
  host: 'mofangdianai.com',
  https: true,
  /** 备用口 18780（勿用 8000=Supabase）。防火墙放行后按 scripts/ecs-nginx-erp-api-18780.snippet 配置 */
  altPort: 18780,
  insecure: false,
}
