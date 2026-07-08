/** 云剪轮询 / 下载时的可恢复网络错误（浏览器 fetch 与 ICE SDK 共用） */
export function isIceTransientNetworkError(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('connecttimeout') ||
    m.includes('connection timeout') ||
    m.includes('etimedout') ||
    m.includes('econnreset') ||
    m.includes('socket hang up') ||
    m.includes('network error') ||
    m.includes('fetch failed') ||
    m.includes('failed to fetch') ||
    m.includes('load failed')
  )
}
