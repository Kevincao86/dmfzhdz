/** 私信图片：压缩后以文本存入消息表，双方 Web/小程序均可展示 */
export const CHAT_IMG_PREFIX = '⟦MEOO_IMG⟧'

const MAX_B64_LEN = 120_000

export function isChatImageMessage(text: string): boolean {
  return String(text || '').startsWith(CHAT_IMG_PREFIX)
}

export function chatImageDataUrl(text: string): string | null {
  const raw = String(text || '')
  if (!raw.startsWith(CHAT_IMG_PREFIX)) return null
  const payload = raw.slice(CHAT_IMG_PREFIX.length).trim()
  if (!payload.startsWith('data:image/')) return null
  return payload
}

export function chatMessagePreview(text: string): string {
  if (isChatImageMessage(text)) return '[图片]'
  const t = String(text || '').trim()
  return t.length > 80 ? `${t.slice(0, 80)}…` : t
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片读取失败'))
    }
    img.src = url
  })
}

/** 压缩聊天图片，返回可发送的完整消息文本 */
export async function buildChatImageMessage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件')
  if (file.size > 8 * 1024 * 1024) throw new Error('图片不能超过 8MB')
  const img = await loadImage(file)
  const maxSide = 720
  let w = img.naturalWidth || img.width
  let h = img.naturalHeight || img.height
  if (!w || !h) throw new Error('图片尺寸无效')
  const scale = Math.min(1, maxSide / Math.max(w, h))
  w = Math.max(1, Math.round(w * scale))
  h = Math.max(1, Math.round(h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法处理图片')
  ctx.drawImage(img, 0, 0, w, h)
  let quality = 0.82
  let dataUrl = canvas.toDataURL('image/jpeg', quality)
  while (dataUrl.length > MAX_B64_LEN && quality > 0.45) {
    quality -= 0.08
    dataUrl = canvas.toDataURL('image/jpeg', quality)
  }
  if (dataUrl.length > MAX_B64_LEN) {
    throw new Error('图片过大，请换一张更小的图或截图后重试')
  }
  return `${CHAT_IMG_PREFIX}${dataUrl}`
}

export const CHAT_EMOJIS = [
  '😀', '😊', '🙂', '😂', '🥲', '👍', '👏', '🙏', '❤️', '✨',
  '🎉', '🔥', '💪', '🤝', '✅', '❓', '💬', '📷', '📎', '⭐',
]
