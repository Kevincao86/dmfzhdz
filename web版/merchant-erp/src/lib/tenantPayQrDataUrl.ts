import QRCode from 'qrcode'
import { merchantStaticUrl } from './webStaticOssAssets'
import type { TenantPayChannel } from '../services/tenantBillingClient'

const QR_SIZE = 240

async function loadPayChannelLogo(channel: TenantPayChannel): Promise<HTMLImageElement | null> {
  const src = merchantStaticUrl(`/payment/${channel}.png`)
  if (!src) return null
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('logo_load_failed'))
      img.src = src
    })
    return img
  } catch {
    return null
  }
}

/** 微信 / 支付宝 / 抖音支付码 → 本地 canvas 二维码（不依赖外网 QR 服务） */
export async function buildTenantPayQrDataUrl(
  codeUrl: string,
  channel: TenantPayChannel,
  size = QR_SIZE,
): Promise<string> {
  const text = String(codeUrl || '').trim()
  if (!text) return ''
  if (/^data:image\//i.test(text)) return text

  const canvas = document.createElement('canvas')
  await QRCode.toCanvas(canvas, text, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: '#111827', light: '#ffffff' },
  })

  const logo = await loadPayChannelLogo(channel)
  const ctx = canvas.getContext('2d')
  if (ctx && logo) {
    const logoSize = Math.round(size * 0.22)
    const pad = Math.round(size * 0.02)
    const x = (size - logoSize) / 2
    const y = (size - logoSize) / 2
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(x - pad, y - pad, logoSize + pad * 2, logoSize + pad * 2)
    ctx.drawImage(logo, x, y, logoSize, logoSize)
  }

  return canvas.toDataURL('image/png')
}
