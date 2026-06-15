/**
 * 招募详情页微信官方小程序码（圆形太阳码，可长按识别进入小程序）
 */
import { buildRecruitmentDetailPageUrl } from './mpRecruitmentApplyShortLink.js'
import { getMpMiniProgramAccessToken } from './mpWechatMiniProgramAccess.js'

const cache = new Map<string, { dataUrl: string; expiresAt: number }>()
const CACHE_MS = 7 * 24 * 3600 * 1000

function isJsonErrorBuffer(buf: Buffer): { errcode?: number; errmsg?: string } | null {
  if (buf.length < 2 || buf[0] !== 0x7b) return null
  try {
    return JSON.parse(buf.toString('utf8')) as { errcode?: number; errmsg?: string }
  } catch {
    return null
  }
}

async function requestWxacode(
  accessToken: string,
  body: Record<string, unknown>,
): Promise<Buffer> {
  const res = await fetch(
    `https://api.weixin.qq.com/wxa/getwxacode?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  const buf = Buffer.from(await res.arrayBuffer())
  const err = isJsonErrorBuffer(buf)
  if (err) throw new Error(String(err.errmsg || `wxacode_${err.errcode ?? res.status}`))
  return buf
}

async function requestWxacodeUnlimited(
  accessToken: string,
  page: string,
  scene: string,
  width: number,
): Promise<Buffer> {
  const res = await fetch(
    `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scene: scene.slice(0, 32),
        page,
        width,
        check_path: false,
      }),
    },
  )
  const buf = Buffer.from(await res.arrayBuffer())
  const err = isJsonErrorBuffer(buf)
  if (err) throw new Error(String(err.errmsg || `wxacode_unlimit_${err.errcode ?? res.status}`))
  return buf
}

/** 生成招募详情页小程序码 PNG（data URL） */
export async function generateRecruitmentApplyWxacodeDataUrl(
  orderId: string,
  width = 430,
): Promise<string> {
  const id = String(orderId || '').trim()
  if (!id) throw new Error('missing_order_id')

  const hit = cache.get(id)
  if (hit && hit.expiresAt > Date.now()) return hit.dataUrl

  const pageUrl = buildRecruitmentDetailPageUrl(id)
  if (!pageUrl) throw new Error('missing_page_url')

  const accessToken = await getMpMiniProgramAccessToken()
  let buf: Buffer
  try {
    buf = await requestWxacode(accessToken, { path: pageUrl, width })
  } catch {
    buf = await requestWxacodeUnlimited(accessToken, 'pages/detail/detail', id.slice(0, 32), width)
  }

  const mime = buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8 ? 'image/jpeg' : 'image/png'
  const dataUrl = `data:${mime};base64,${buf.toString('base64')}`
  cache.set(id, { dataUrl, expiresAt: Date.now() + CACHE_MS })
  return dataUrl
}
