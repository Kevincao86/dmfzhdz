import { Bell } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { getAccount } from '../lib/mpSession'
import { pageTitleForPath } from '../lib/shellNavConfig'
import { unreadNotificationCount } from '../lib/mpSync/messagesStore'

export default function AppTopBar() {
  const { pathname, search } = useLocation()
  const account = getAccount()
  const { section, page } = pageTitleForPath(pathname, search)
  const unread = unreadNotificationCount()
  const displayName = account?.wxNickName || account?.loginName || '灵祺用户'

  return (
    <header className="app-topbar">
      <div className="app-topbar__crumb">
        <span className="app-topbar__section">{section}</span>
        <span className="app-topbar__sep">/</span>
        <span className="app-topbar__page">{page}</span>
      </div>
      <div className="app-topbar__actions">
        <Link to="/messages" className="app-topbar__icon-btn" title="消息通知">
          <Bell size={18} strokeWidth={2} />
          {unread > 0 ? (
            <span className="app-topbar__badge">{unread > 99 ? '99+' : unread}</span>
          ) : null}
        </Link>
        <Link to="/profile" className="app-topbar__user">
          <img src="/logo.png" alt="" className="app-topbar__avatar" />
          <span className="app-topbar__name">{displayName}</span>
        </Link>
      </div>
    </header>
  )
}
