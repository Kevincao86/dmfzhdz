/**
 * 抖音网站 OAuth：须嵌入/打开 open.douyin.com 官方授权页（禁止自建二维码）。
 * @see https://developer.open-douyin.com/announcement/134
 */
type Props = {
  authorizeUrl: string
  redirectUri?: string
  clientKey?: string
  className?: string
}

function parseDouyinOAuthMeta(authorizeUrl: string): { redirectUri: string; clientKey: string } {
  try {
    const u = new URL(authorizeUrl)
    return {
      clientKey: String(u.searchParams.get('client_key') || '').trim(),
      redirectUri: String(u.searchParams.get('redirect_uri') || '').trim(),
    }
  } catch {
    return { redirectUri: '', clientKey: '' }
  }
}

export default function DyOAuthOfficialPanel({
  authorizeUrl,
  redirectUri,
  clientKey,
  className,
}: Props) {
  if (!authorizeUrl) return null

  const parsed = parseDouyinOAuthMeta(authorizeUrl)
  const redirect = String(redirectUri || parsed.redirectUri || '').trim()
  const key = String(clientKey || parsed.clientKey || '').trim()
  const slashVariant = redirect ? (redirect.endsWith('/') ? redirect : `${redirect}/`) : ''

  return (
    <div className={className ?? 'flex flex-col items-center gap-3'}>
      <p className="max-w-sm text-center text-xs leading-relaxed text-slate-500">
        请扫下方抖音官方页中的二维码。若提示 <span className="font-mono">Illegal redirect link</span>
        ，说明回调地址与开放平台登记不一致（见下方黄框，须逐字复制到「授权回调」）。
      </p>
      {redirect ? (
        <div className="w-full max-w-md rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-left text-[11px] leading-relaxed text-amber-950">
          <p className="font-semibold">当前 redirect_uri（须与控制台完全一致）</p>
          <p className="mt-1 break-all font-mono">{redirect}</p>
          {slashVariant && slashVariant !== redirect ? (
            <p className="mt-2">
              建议再新增一条（带尾斜杠）：<span className="break-all font-mono">{slashVariant}</span>
            </p>
          ) : null}
          {key ? (
            <p className="mt-2 break-all">
              Client Key：<span className="font-mono">{key}</span>（请确认在「灵祺科技」网站应用下改回调）
            </p>
          ) : null}
        </div>
      ) : null}
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
