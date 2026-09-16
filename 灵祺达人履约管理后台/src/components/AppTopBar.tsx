import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { getAccount, getActiveRole } from '../lib/mpSession'
import { pageTitleForPath } from '../lib/shellNavConfig'
import { unreadNotificationCount } from '../lib/mpSync/messagesStore'
import { getWorkIdentity, workIdentityLabel } from '../lib/mpWorkIdentity'
import { identityBadgeClass } from '../lib/identityTheme'
import { BRAND_LOGO_URL } from '../lib/brand'
import { resolveShellDisplayName } from '../lib/shellDisplayName'
import { onProfileDisplayRefresh } from '../lib/shellRefresh'

type AppTopBarProps = {
  variant?: 'full' | 'header' | 'crumb'
}

export default function AppTopBar({ variant = 'full' }: AppTopBarProps) {
  const { pathname, search } = useLocation()
  const account = getAccount()
  const role = getActiveRole()
  const workId = getWorkIdentity()
  const { section, page, sub } = pageTitleForPath(pathname, search)
  const unread = unreadNotificationCount()
  const [displayRev, setDisplayRev] = useState(0)
  useEffect(() => onProfileDisplayRefresh(() => setDisplayRev((n) => n + 1)), [])
  void displayRev

  const displayName = resolveShellDisplayName()
  const shellWorkId = role === 'pr' ? 'pr' : workId
  const roleBadge = role === 'pr' ? 'PR' : workIdentityLabel(workId)

  const crumbs = (
    <div className="app-topbar__crumb">
      <span className="app-topbar__section">{section}</span>
      <span className="app-topbar__sep">/</span>
      <span className="app-topbar__page">{page}</span>
      {sub ? (
        <>
          <span className="app-topbar__sep">/</span>
          <span className="app-topbar__page">{sub}</span>
        </>
      ) : null}
    </div>
  )

  const actions = (
    <div className="app-topbar__actions">
      <Link to="/messages" className="app-topbar__icon-btn" title="消息通知">
        <Bell size={18} strokeWidth={2} />
        {unread > 0 ? (
          <span className="app-topbar__badge">{unread > 99 ? '99+' : unread}</span>
        ) : null}
      </Link>
      <Link to="/profile/membership" className="app-topbar__upgrade-btn">
        升级会员
      </Link>
      <Link to="/profile" className="app-topbar__user">
        <img src={account?.wxAvatarUrl || BRAND_LOGO_URL} alt="" className="app-topbar__avatar" />
        <span className="app-topbar__name">{displayName}</span>
        <span className={`app-topbar__role-badge ${identityBadgeClass(shellWorkId)}`}>{roleBadge}</span>
      </Link>
    </div>
  )

  if (variant === 'header') return actions
  if (variant === 'crumb') return crumbs

  return (
    <header className="app-topbar">
      {crumbs}
      {actions}
    </header>
  )
}
