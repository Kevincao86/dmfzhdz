/**
 * 备案期默认连阿里云轻量（改 IP 后重新「上传并部署」云函数即可，无需控制台环境变量）
 */
/** 阿里云控制台 → 轻量应用服务器 → 复制「公网 IP」，改完重新部署云函数 */
module.exports = {
  ip: '139.196.42.5',
  host: 'mofangdianai.com',
  tlsSni: 'mofangdianai.com',
  useIpHost: true,
  /** 腾讯云 → 轻量：443 常 reset，优先 80 + Host=IP（须 Nginx 80-ip snippet） */
  http80IpOnly: true,
  https: true,
  httpsIpOnly: true,
  altPort: 0,
  insecure: false,
}
