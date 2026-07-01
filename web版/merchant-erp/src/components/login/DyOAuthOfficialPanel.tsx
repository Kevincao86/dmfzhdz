/**
 * 抖音网站 OAuth：须嵌入 open.douyin.com 官方授权页（禁止自建二维码）。
 * @see https://developer.open-douyin.com/announcement/134
 */
type Props = {
  authorizeUrl: string
  className?: string
}

/** 裁剪 iframe 视口，仅展示官方页「标题 + 二维码 + 如何扫码」区域 */
const IFRAME_CROP = {
  frameW: 375,
  frameH: 480,
  viewW: 302,
  viewH: 348,
  offsetTop: -10,
} as const

export default function DyOAuthOfficialPanel({ authorizeUrl, className }: Props) {
  if (!authorizeUrl) return null

  return (
    <div className={className ?? 'flex justify-center'}>
      <div
        className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-inner"
        style={{ width: IFRAME_CROP.viewW, height: IFRAME_CROP.viewH }}
      >
        <iframe
          src={authorizeUrl}
          title="抖音官方授权"
          className="absolute left-1/2 border-0 -translate-x-1/2"
          style={{
            width: IFRAME_CROP.frameW,
            height: IFRAME_CROP.frameH,
            top: IFRAME_CROP.offsetTop,
          }}
          scrolling="no"
        />
      </div>
    </div>
  )
}
