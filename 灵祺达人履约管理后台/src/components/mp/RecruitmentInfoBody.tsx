import { formatFormRelayRecruitmentLine } from '@merchant/lib/formRelayPlatforms'

const SOURCE_LINK_RE = /^原表链接[:：]\s*(.+)$/i
const HTTP_URL_RE = /^https?:\/\/\S+$/i

function parseSourceLinkLine(line: string): { label: string; url: string } | null {
  const m = String(line || '').trim().match(SOURCE_LINK_RE)
  if (!m?.[1]) return null
  const url = m[1].trim()
  if (!HTTP_URL_RE.test(url)) return null
  return { label: '原表链接', url }
}

type Props = {
  text: string
  fallbackSourceUrl?: string
  className?: string
}

/** 招募说明正文：原表链接行渲染为可点击跳转 */
export default function RecruitmentInfoBody({ text, fallbackSourceUrl, className }: Props) {
  const lines = String(text || '').split('\n')
  const fallback = String(fallbackSourceUrl || '').trim()

  return (
    <div className={className || 'recruitment-detail-body text-sm whitespace-pre-wrap font-sans space-y-1'}>
      {lines.map((line, idx) => {
        const link = parseSourceLinkLine(line)
        if (link) {
          return (
            <p key={idx}>
              原表链接：
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline underline-offset-2 break-all hover:text-blue-500"
              >
                {link.url}
              </a>
            </p>
          )
        }
        if (!line.trim() && idx === lines.length - 1) return null
        const displayLine = formatFormRelayRecruitmentLine(line)
        return (
          <p key={idx} className={line ? undefined : 'min-h-[0.5rem]'}>
            {displayLine || '\u00a0'}
          </p>
        )
      })}
      {fallback && !lines.some((l) => parseSourceLinkLine(l)) ? (
        <p>
          原表链接：
          <a
            href={fallback}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline underline-offset-2 break-all hover:text-blue-500"
          >
            {fallback}
          </a>
        </p>
      ) : null}
    </div>
  )
}
