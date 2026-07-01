/**
 * 增值服务导航；页面组件须 React.lazy 按需加载，避免静态 import @merchant 把 vite-plugins 打进首屏。
 */
export const ADDON_NAV = [
  { to: '/addons/shortvideo', label: '短视频AI处理' },
  { to: '/addons/ai-content', label: '爆款 Brief 生成' },
  { to: '/addons/digital-human', label: '数字人口播' },
] as const
