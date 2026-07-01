import QRCode from 'qrcode'

/**
 * 抖音 OAuth 授权链接 → 二维码 data URL。
 * 不用中心 logo：长 URL（~320 字符）+ 遮挡易导致抖音扫码读错 redirect_uri。
 */
export async function buildDyOAuthQrDataUrl(authorizeUrl: string, size = 280): Promise<string> {
  const canvas = document.createElement('canvas')
  await QRCode.toCanvas(canvas, authorizeUrl, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#111827', light: '#ffffff' },
  })
  return canvas.toDataURL('image/png')
}
