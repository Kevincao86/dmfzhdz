import QRCode from 'qrcode'
import { webStaticCandidates } from '@merchant/lib/webStaticOssAssets'
import type { MpMembershipPayChannel } from './mpMembershipApi'

const QR_SIZE = 220

type PayQrChannel = Extract<MpMembershipPayChannel, 'wechat' | 'douyin' | 'alipay'>

async function loadPayChannelLogo(channel: PayQrChannel): Promise<HTMLImageElement | null> {
  const urls = webStaticCandidates('dr', `/payment/${channel}.png`)
  for (const src of urls) {
    if (!src) continue
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
      /* 尝试下一个候选 URL */
    }
  }
  return null
}

/** 微信 / 抖音 / 支付宝 → 统一 220px 带渠道 logo 的扫码二维码 */
export async function buildMembershipPayQrDataUrl(
  codeUrl: string,
  channel: PayQrChannel,
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

/** @deprecated 使用 buildMembershipPayQrDataUrl */
export async function buildWechatPayQrDataUrl(codeUrl: string, size = QR_SIZE): Promise<string> {
  return buildMembershipPayQrDataUrl(codeUrl, 'wechat', size)
}
