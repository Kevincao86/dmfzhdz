/** 商家绑定态（sessionStorage），供商品页连通性检测与创建流程复用 */
export function readMerchantSession(key: string): string | null {
  try {
    const v = sessionStorage.getItem(key)
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
  } catch {
    return null
  }
}
