import { cn } from '../cn'
import { WEB_PSB_FILING, WEB_PSB_URL, WEB_SITE_ICP_FILING, WEB_SITE_ICP_URL } from '../lib/siteIcp'

type Props = {
  className?: string
}

const linkClass = 'inline-flex items-center gap-1 transition-colors hover:text-slate-600 hover:underline'

export default function SiteIcpFooter({ className }: Props) {
  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-xs text-slate-400', className)}>
      <a href={WEB_SITE_ICP_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
        {WEB_SITE_ICP_FILING}
      </a>
      <a href={WEB_PSB_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
        <img src="/beian-ghs.png" alt="" width={16} height={16} className="h-4 w-4 shrink-0" />
        <span>{WEB_PSB_FILING}</span>
      </a>
    </div>
  )
}
