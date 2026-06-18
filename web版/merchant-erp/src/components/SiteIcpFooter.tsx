import { cn } from '../cn'
import { WEB_SITE_ICP_FILING, WEB_SITE_ICP_URL } from '../lib/siteIcp'

type Props = {
  className?: string
}

export default function SiteIcpFooter({ className }: Props) {
  return (
    <p className={cn('text-center text-xs text-slate-400', className)}>
      <a
        href={WEB_SITE_ICP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="transition-colors hover:text-slate-600 hover:underline"
      >
        {WEB_SITE_ICP_FILING}
      </a>
    </p>
  )
}
