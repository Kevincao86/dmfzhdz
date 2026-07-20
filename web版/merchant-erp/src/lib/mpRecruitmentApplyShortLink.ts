import { getMpMiniProgramAccessToken, mpWechatAppId } from './mpWechatMiniProgramAccess.js'

const MP_APP_ID = () => mpWechatAppId() || 'wxd3da81937eb72241'
const MP_SHARE_APP_NAME = () =>
  String(process.env.MP_SHARE_APP_NAME || '灵祺星选').trim() || '灵祺星选'

/** 详情页 page_url（genwxashortlink / 明文 scheme 共用，不带前导 /） */
export function buildRecruitmentDetailPageUrl(orderId: string): string {
  const id = String(orderId || '').trim()
  if (!id) return ''
  /** 须与撮合小程序 app.json subPackages root=pages/subpack-core 一致；勿用已下线的 pages/detail/detail */
  return `pages/subpack-core/detail/detail?id=${encodeURIComponent(id)}`
}

/** 明文 URL Scheme（微信外或部分场景；path 与 query 分离） */
export function buildRecruitmentPlainSchemeLink(orderId: string): string {
  const id = String(orderId || '').trim()
  if (!id) return ''
  const path = 'pages/subpack-core/detail/detail'
  const query = `id=${encodeURIComponent(id)}`
  return `weixin://dl/business/?appid=${MP_APP_ID()}&path=${encodeURIComponent(path)}&query=${encodeURIComponent(query)}`
}

/** 手工 #小程序:// 兜底（须与公众平台昵称一致；多数场景需微信 API 生成才有效） */
export function buildRecruitmentHashLinkFallback(orderId: string): string {
  const pageUrl = buildRecruitmentDetailPageUrl(orderId)
  if (!pageUrl) return ''
  return `#小程序://${MP_SHARE_APP_NAME()}/${pageUrl}`
}

type ShortLinkResult = { link: string; source: 'wechat_api' | 'hash_fallback' | 'scheme_fallback' }

/**
 * 调用微信 genwxashortlink 生成群聊可点击短链（#小程序://…）。
 * 失败时回退 hash / scheme，便于排查与弱网兜底。
 */
export async function generateRecruitmentApplyShortLink(
  orderId: string,
  pageTitle?: string,
): Promise<ShortLinkResult> {
  const pageUrl = buildRecruitmentDetailPageUrl(orderId)
  if (!pageUrl) return { link: '', source: 'hash_fallback' }

  try {
    const accessToken = await getMpMiniProgramAccessToken()
    const res = await fetch(
      `https://api.weixin.qq.com/wxa/genwxashortlink?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_url: pageUrl,
          page_title: String(pageTitle || '招募详情').slice(0, 20),
          is_permanent: false,
        }),
      },
    )
    const data = (await res.json()) as { errcode?: number; errmsg?: string; link?: string }
    const link = String(data.link || '').trim()
    if (data.errcode === 0 && link) {
      return { link, source: 'wechat_api' }
    }
    console.warn('[mp] genwxashortlink', data.errcode, data.errmsg)
  } catch (e) {
    console.warn('[mp] genwxashortlink', e instanceof Error ? e.message : String(e))
  }

  const hash = buildRecruitmentHashLinkFallback(orderId)
  if (hash) return { link: hash, source: 'hash_fallback' }
  return { link: buildRecruitmentPlainSchemeLink(orderId), source: 'scheme_fallback' }
}
