import QRCode from 'qrcode'

/** 微信 Native codeUrl → 扫码支付二维码 */
export async function buildWechatPayQrDataUrl(codeUrl: string, size = 220): Promise<string> {
  return QRCode.toDataURL(codeUrl, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#111827', light: '#ffffff' },
  })
}
