/**
 * 增值服务三页：与商家 Web「AI 运营」同源（@merchant），由履约后台嵌入展示。
 */
export { default as ShortVideoAddonPage } from '@merchant/pages/ShortVideoOptimizationPage'
export { default as AiContentAddonPage } from '@merchant/pages/AiOperationContentPage'
export { default as DigitalHumanAddonPage } from '@merchant/pages/DigitalHumanBroadcastPage'

export const ADDON_NAV = [
  { to: '/addons/shortvideo', label: '短视频AI处理' },
  { to: '/addons/ai-content', label: '爆款 Brief 生成' },
  { to: '/addons/digital-human', label: '数字人口播' },
] as const
