/** 与小程序 config.MP_SHOW_DEMO_ORDERS 对齐：生产默认不展示演示商单 */
export function showDemoOrders(): boolean {
  return String(import.meta.env.VITE_MP_SHOW_DEMO_ORDERS || '').trim().toLowerCase() === 'true'
}
