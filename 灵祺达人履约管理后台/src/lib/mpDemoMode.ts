/** 与小程序 config.MP_SHOW_DEMO_ORDERS 对齐；本地 dev 默认展示演示商单便于预览布局 */
export function showDemoOrders(): boolean {
  if (import.meta.env.DEV) return true
  return String(import.meta.env.VITE_MP_SHOW_DEMO_ORDERS || '').trim().toLowerCase() === 'true'
}
