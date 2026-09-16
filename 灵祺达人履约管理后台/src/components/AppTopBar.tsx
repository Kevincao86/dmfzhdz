import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { getAccount, getActiveRole } from '../lib/mpSession'
import { pageTitleForPath } from '../lib/shellNavConfig'
import { unreadNotificationCount } from '../lib/mpSync/messagesStore'
import { getWorkIdentity, workIdentityLabel } from '../lib/mpWorkIdentity'
import { identityBadgeClass } from '../lib/identityTheme'
import { resolveShellDisplayName } from '../lib/shellDisplayName'
import { onProfileDisplayRefresh } from '../lib/shellRefresh'
import { readMember } from '../lib/mpSync/talentMember'
import { readPrProfile } from '../lib/mpSync/userProfile'

type AppTopBarProps = {
  variant?: 'full' | 'header' | 'crumb'
}

function isUserAvatarUrl(url: unknown): string {
  const u = String(url || '').trim()
  if (!u) return ''
  if (/\/logo\.png(?:\?|$)/i.test(u) || u.endsWith('logo.png')) return ''
  return u
}

function resolveShellAvatarUrl(): string {
  const account = getAccount()
  if (getActiveRole() === 'pr') {
    return (
      isUserAvatarUrl(readPrProfile()?.wxAvatarUrl) || isUserAvatarUrl(account?.wxAvatarUrl)
    )
  }
  return isUserAvatarUrl(readMember()?.wxAvatarUrl) || isUserAvatarUrl(account?.wxAvatarUrl)
}

export default function AppTopBar({ variant = 'full' }: AppTopBarProps) {
  const { pathname, search } = useLocation()
  const role = getActiveRole()
  const workId = getWorkIdentity()
  const { section, page, sub } = pageTitleForPath(pathname, search)
  const unread = unreadNotificationCount()
  const [displayRev, setDisplayRev] = useState(0)
  useEffect(() => onProfileDisplayRefresh(() => setDisplayRev((n) => n + 1)), [])
  void displayRev

  const displayName = resolveShellDisplayName()
  const avatarUrl = resolveShellAvatarUrl()
  const avatarInitial = (displayName.match(/[\u4e00-\u9fff]/)?.[0] || displayName.trim().slice(0, 1) || '用')
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
      <NavLink to="/profile/membership" className="app-topbar__upgrade-btn">
        升级会员
      </NavLink>
      <Link to="/profile" className="app-topbar__user">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="app-topbar__avatar" />
        ) : (
          <span className="app-topbar__avatar app-topbar__avatar--ph" aria-hidden>
            {avatarInitial}
          </span>
        )}
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
