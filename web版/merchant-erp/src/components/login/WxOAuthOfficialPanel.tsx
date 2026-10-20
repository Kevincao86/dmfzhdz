/**
 * 微信开放平台网站应用登录。
 * 使用官方 WxLogin，电脑已登录微信（Windows 3.9.11+ / Mac 4.0.0+ 且未锁定）时拉起客户端确认。
 * @see https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html
 */
import { useEffect, useId, useRef } from 'react'

type Props = {
  authorizeUrl: string
  className?: string
}

type WxLoginOptions = {
  self_redirect: boolean
  id: string
  appid: string
  scope: string
  redirect_uri: string
  state: string
  stylelite: number
  onCleanup?: () => void
}

declare global {
  interface Window {
    WxLogin?: new (opts: WxLoginOptions) => void
  }
}

const WX_LOGIN_SRC = 'https://res.wx.qq.com/connect/zh_CN/htmledition/js/wxLogin.js'

function loadWxLoginScript(): Promise<void> {
  if (typeof window.WxLogin === 'function') return Promise.resolve()
  const found = document.querySelector('script[data-wx-login="1"]')
  if (found) {
    return new Promise((resolve, reject) => {
      found.addEventListener('load', () => resolve(), { once: true })
      found.addEventListener('error', () => reject(new Error('wx_login_script')), { once: true })
    })
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = WX_LOGIN_SRC
    script.async = true
    script.dataset.wxLogin = '1'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('wx_login_script'))
    document.head.appendChild(script)
  })
}

export default function WxOAuthOfficialPanel({ authorizeUrl, className }: Props) {
  const reactId = useId().replace(/:/g, '')
  const boxId = `wx-login-${reactId}`
  const optsRef = useRef<WxLoginOptions | null>(null)

  useEffect(() => {
    let cancelled = false
    let parsed: URL
    try {
      parsed = new URL(authorizeUrl)
    } catch {
      return
    }
    const appid = parsed.searchParams.get('appid') || ''
    const redirect = parsed.searchParams.get('redirect_uri') || ''
    const state = parsed.searchParams.get('state') || ''
    if (!appid || !redirect || !state) return

    const opts: WxLoginOptions = {
      self_redirect: true,
      id: boxId,
      appid,
      scope: 'snsapi_login',
      redirect_uri: encodeURIComponent(redirect),
      state,
      stylelite: 1,
    }
    optsRef.current = opts

    void loadWxLoginScript()
      .then(() => {
        if (cancelled || typeof window.WxLogin !== 'function') return
        const box = document.getElementById(boxId)
        if (box) box.innerHTML = ''
        new window.WxLogin(opts)
      })
      .catch(() => {
        /* 脚本失败时保留空容器，外层会提示刷新 */
      })

    return () => {
      cancelled = true
      optsRef.current?.onCleanup?.()
      optsRef.current = null
    }
  }, [authorizeUrl, boxId])

  if (!authorizeUrl) return null

  return (
    <div className={className ?? 'flex w-full flex-col items-center'}>
      {/* 官方 iframe 固定 300×400，内容靠上。缩放到 240 宽并裁掉下方空白，一键登录和二维码都保持居中。 */}
      <div className="mx-auto flex h-[220px] w-[240px] justify-center overflow-hidden">
        <div id={boxId} className="h-[400px] w-[300px] origin-top scale-[0.8]" />
      </div>
      <p className="mt-2 max-w-[240px] text-center text-[11px] leading-relaxed text-slate-400">
        电脑已登录微信时，会拉起微信请你确认；没打开微信时仍显示二维码。
      </p>
    </div>
  )
}
