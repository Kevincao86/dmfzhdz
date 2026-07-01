/**
 * 抖音网站 OAuth 扫码登录：须嵌入/打开 open.douyin.com 官方授权页。
 * 平台禁止对 Web 授权链接自行生成二维码（扫自建码会报「链接不合法」）。
 * @see https://developer.open-douyin.com/announcement/134
 */
type Props = {
  authorizeUrl: string
  className?: string
}

export default function DyOAuthOfficialPanel({ authorizeUrl, className }: Props) {
  if (!authorizeUrl) return null

  return (
    <div className={className ?? 'flex flex-col items-center gap-3'}>
      <p className="max-w-sm text-center text-xs leading-relaxed text-slate-500">
        请扫下方<strong className="font-semibold text-slate-700">抖音官方页面</strong>
        中的二维码完成授权（勿扫第三方生成的码，勿在抖音 App 内直接打开链接）。
        建议用<strong className="font-semibold text-slate-700">电脑浏览器</strong>
        打开本页，再用手机抖音扫描。
      </p>
      <iframe
        src={authorizeUrl}
        title="抖音官方授权"
        className="h-[min(420px,58vh)] w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-inner"
      />
      <a
        href={authorizeUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-100"
      >
        新窗口打开官方授权页
      </a>
    </div>
  )
}
