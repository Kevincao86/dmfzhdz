import { Link, useLocation } from 'react-router-dom'
import { cn } from '../../cn'
import { isPartnerEdition } from '../../lib/appEdition'

const BASE_NAV = [
  { to: '/', label: '首页' },
  { to: '/help', label: '帮助手册' },
  { to: '/team', label: '团队介绍' },
] as const

const AFFILIATE_NAV = { to: '/affiliate/apply', label: '推广合作' } as const

type Props = {
  className?: string
  linkClassName?: string
  activeClassName?: string
}

export default function LoginPortalNav({ className, linkClassName, activeClassName }: Props) {
  const { pathname } = useLocation()
  const nav = isPartnerEdition() ? BASE_NAV : [...BASE_NAV, AFFILIATE_NAV]
  return (
    <nav className={cn('flex flex-wrap items-center gap-4 sm:gap-6', className)}>
      {nav.map((item) => {
        const active = item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              'text-sm font-medium transition-colors',
              active ? activeClassName ?? 'text-cyan-700' : linkClassName ?? 'text-slate-600 hover:text-slate-900',
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
