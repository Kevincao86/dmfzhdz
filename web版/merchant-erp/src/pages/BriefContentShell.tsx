import { NavLink, Outlet } from 'react-router-dom'
import type { ReactNode } from 'react'
import { isFulfillmentEmbedHost } from '../lib/merchantApiAuth'

/** 商家 ERP / 履约嵌入：Brief 子路由壳（生成 / 记录） */
export default function BriefContentShell() {
  const embedHost = isFulfillmentEmbedHost()
  return (
    <div className="space-y-4">
      {!embedHost ? (
        <nav className="flex flex-wrap gap-2 border-b border-gray-100 pb-3" aria-label="Brief 功能">
          <BriefSubNavLink to="." end>
            爆款 Brief 生成
          </BriefSubNavLink>
          <BriefSubNavLink to="records">生成记录</BriefSubNavLink>
        </nav>
      ) : (
        <nav
          className="flex flex-wrap gap-2 border-b border-gray-100 pb-3 md:hidden"
          aria-label="Brief 功能"
        >
          <BriefSubNavLink to="." end>
            爆款 Brief 生成
          </BriefSubNavLink>
          <BriefSubNavLink to="records">生成记录</BriefSubNavLink>
        </nav>
      )}
      <Outlet />
    </div>
  )
}

function BriefSubNavLink({
  to,
  end,
  children,
}: {
  to: string
  end?: boolean
  children: ReactNode
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-violet-600 text-white shadow-sm'
            : 'text-[var(--shell-muted,theme(colors.gray.500))] hover:bg-gray-100'
        }`
      }
    >
      {children}
    </NavLink>
  )
}
