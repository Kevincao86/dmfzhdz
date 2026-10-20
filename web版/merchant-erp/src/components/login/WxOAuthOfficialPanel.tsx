/**
 * 微信开放平台网站应用扫码：嵌入官方 qrconnect 页。
 * @see https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html
 */
type Props = {
  authorizeUrl: string
  className?: string
}

export default function WxOAuthOfficialPanel({ authorizeUrl, className }: Props) {
  if (!authorizeUrl) return null

  return (
    <div className={className ?? 'flex justify-center'}>
      <div
        className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-inner"
        style={{ width: 300, height: 400 }}
      >
        <iframe
          src={authorizeUrl}
          title="微信官方扫码登录"
          className="absolute left-0 top-0 border-0"
          style={{ width: 300, height: 400 }}
          scrolling="no"
        />
      </div>
    </div>
  )
}
