import QRCode from 'qrcode'
import dyLogoUrl from '../../public/platforms/douyin.png?url'

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('dy_logo_load_failed'))
    img.src = src
  })
}

/** 抖音 OAuth 授权链接 → 带中心 logo 的二维码 data URL */
export async function buildDyOAuthQrDataUrl(authorizeUrl: string, size = 208): Promise<string> {
  const canvas = document.createElement('canvas')
  await QRCode.toCanvas(canvas, authorizeUrl, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'H',
    color: { dark: '#111827', light: '#ffffff' },
  })
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas.toDataURL('image/png')

  try {
    const logo = await loadImage(dyLogoUrl)
    const logoSize = Math.round(size * 0.22)
    const x = (canvas.width - logoSize) / 2
    const y = (canvas.height - logoSize) / 2
    const pad = Math.max(4, Math.round(logoSize * 0.14))
    const box = logoSize + pad * 2
    const bx = x - pad
    const by = y - pad
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    const r = Math.round(box * 0.18)
    ctx.roundRect(bx, by, box, box, r)
    ctx.fill()
    ctx.drawImage(logo, x, y, logoSize, logoSize)
  } catch {
    /* logo 加载失败仍返回纯二维码 */
  }
  return canvas.toDataURL('image/png')
}
