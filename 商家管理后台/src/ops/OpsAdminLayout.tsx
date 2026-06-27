import { ChevronDown, LogOut } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import ThemeToggle from '../components/ThemeToggle'
import { cn } from '../cn'
import { BRAND_LOGO_URL, BRAND_NAME } from '../lib/brand'
import {
  isOpsNavGroupActive,
  isOpsNavLeafActive,
  isOpsNavParentActive,
  OPS_NAV_DEFAULT_EXPANDED_IDS,
  OPS_NAV_GROUPS,
  opsNavGroupStorageKey,
  resolveOpsPageMeta,
  type OpsNavLeaf,
  type OpsNavParent,
} from './opsNavConfig'
import {
  clearOpsSession,
  isSuperAdmin,
  readOpsSession,
  refreshOpsSessionFromStorage,
  sessionHasPermission,
  type OpsSession,
} from './opsStaffAuth'

const NAV_EXPAND_STORAGE = 'ops-nav-expanded-v2'

function navLeafVisible(session: OpsSession, item: OpsNavLeaf): boolean {
  if (item.permission === 'home') return true
  if (item.permission === 'staff_admin') return isSuperAdmin(session)
  return sessionHasPermission(session, item.permission)
}

function readExpandedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(NAV_EXPAND_STORAGE)
    if (raw) {
      const arr = JSON.parse(raw) as string[]
      if (Array.isArray(arr) && arr.length) return new Set(arr)
    }
    const legacy = localStorage.getItem('ops-nav-expanded-v1')
    if (legacy) {
      const arr = JSON.parse(legacy) as string[]
      if (Array.isArray(arr)) {
        return new Set([...OPS_NAV_DEFAULT_EXPANDED_IDS, ...arr])
      }
    }
  } catch {
    /* ignore */
  }
  return new Set(OPS_NAV_DEFAULT_EXPANDED_IDS)
}

function persistExpandedIds(ids: Set<string>) {
  try {
    localStorage.setItem(NAV_EXPAND_STORAGE, JSON.stringify([...ids]))
  } catch {
    /* ignore */
  }
}

export default function OpsAdminLayout() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const [session, setSession] = useState<OpsSession | null>(() => readOpsSession())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(readExpandedIds)
  const pageMeta = useMemo(() => resolveOpsPageMeta(pathname, search), [pathname, search])

  useEffect(() => {
    setSession(refreshOpsSessionFromStorage())
    const onChange = () => setSession(refreshOpsSessionFromStorage())
    window.addEventListener('meoo-ops-staff-changed', onChange)
    return () => window.removeEventListener('meoo-ops-staff-changed', onChange)
  }, [])

  useEffect(() => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      for (const group of OPS_NAV_GROUPS) {
        if (isOpsNavGroupActive(pathname, search, group)) {
          next.add(opsNavGroupStorageKey(group.id))
        }
        for (const entry of group.entries) {
          if (entry.kind === 'parent' && isOpsNavParentActive(pathname, search, entry)) {
            next.add(entry.id)
          }
        }
      }
      return next
    })
  }, [pathname, search])

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      persistExpandedIds(next)
      return next
    })
  }, [])

  const visibleGroups = useMemo(() => {
    if (!session) return []
    return OPS_NAV_GROUPS.map((group) => ({
      ...group,
      entries: group.entries
        .map((entry) => {
          if (entry.kind === 'leaf') {
            return navLeafVisible(session, entry) ? entry : null
          }
          const children = entry.children.filter((c) => navLeafVisible(session, c))
          if (!children.length) return null
          return { ...entry, children }
        })
        .filter(Boolean) as typeof group.entries,
    })).filter((g) => g.entries.length > 0)
  }, [session])

  const logout = () => {
    clearOpsSession()
    navigate('/login', { replace: true })
  }

  function renderLeaf(item: OpsNavLeaf, indent = false) {
    const active = isOpsNavLeafActive(pathname, search, item.to)
    const Icon = item.icon
    return (
      <NavLink
        key={item.to}
        to={item.to}
        title={item.label}
        className={cn(
          'ops-nav-link flex items-center gap-2 rounded-lg py-2 text-[13px] font-medium transition-all',
          indent ? 'pl-8 pr-2.5' : 'px-2.5',
          active ? 'ops-nav-link--active' : 'ops-nav-link--idle',
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 opacity-90" />
        <span className="truncate">{item.label}</span>
      </NavLink>
    )
  }

  function renderParent(entry: OpsNavParent) {
    const expanded = expandedIds.has(entry.id)
    const parentActive = isOpsNavParentActive(pathname, search, entry)
    const Icon = entry.icon
    return (
      <div key={entry.id} className="space-y-0.5">
        <button
          type="button"
          onClick={() => toggleExpanded(entry.id)}
          className={cn(
            'ops-nav-parent flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all',
            parentActive ? 'ops-nav-parent--active' : 'ops-nav-parent--idle',
          )}
        >
          <Icon className="h-4 w-4 shrink-0 opacity-90" />
          <span className="truncate text-left">{entry.label}</span>
          <ChevronDown
            className={cn('ml-auto h-4 w-4 shrink-0 opacity-70 transition-transform', expanded && 'rotate-180')}
          />
        </button>
        {expanded ? (
          <div className="ops-nav-sub ml-4 space-y-0.5 border-l border-[var(--ops-border)] pl-1">
            {entry.children.map((child) => renderLeaf(child, true))}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="ops-shell flex min-h-screen">
      <aside className="ops-sidebar fixed left-0 top-0 z-40 flex h-screen w-[15.5rem] flex-col border-r">
        <div className="ops-sidebar-brand flex h-[4.25rem] items-center gap-2.5 border-b border-[var(--ops-border)] px-4">
          <img src={BRAND_LOGO_URL} alt={BRAND_NAME} className="h-9 w-9 shrink-0 rounded-xl object-contain shadow-sm" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-tight">运营管控台</div>
            <div className="ops-muted truncate text-[10px]">{BRAND_NAME}</div>
          </div>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto px-2.5 py-3">
          {visibleGroups.map((group) => {
            const groupKey = opsNavGroupStorageKey(group.id)
            const groupExpanded = expandedIds.has(groupKey)
            const groupActive = isOpsNavGroupActive(pathname, search, group)
            return (
              <div key={group.id}>
                <button
                  type="button"
                  onClick={() => toggleExpanded(groupKey)}
                  className={cn(
                    'ops-nav-group-header mb-1 flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider transition-all',
                    groupActive ? 'ops-nav-group-header--active' : 'ops-nav-group-header--idle',
                  )}
                >
                  <span className="truncate">{group.label}</span>
                  <ChevronDown
                    className={cn(
                      'ml-auto h-3.5 w-3.5 shrink-0 opacity-70 transition-transform',
                      groupExpanded && 'rotate-180',
                    )}
                  />
                </button>
                {groupExpanded ? (
                  <div className="space-y-0.5">
                    {group.entries.map((entry) =>
                      entry.kind === 'leaf' ? renderLeaf(entry) : renderParent(entry),
                    )}
                  </div>
                ) : null}
              </div>
            )
          })}
        </nav>

        {session ? (
          <div className="ops-sidebar-footer border-t border-[var(--ops-border)] p-3">
            <p className="truncate text-xs font-medium">{session.displayName}</p>
            <p className="ops-muted truncate font-mono text-[10px]">{session.phone}</p>
            <p className="mt-0.5 text-[10px] font-medium text-[var(--ops-accent)]">
              {session.role === 'super_admin' ? '超级管理员' : '运营子账号'}
            </p>
            <ThemeToggle />
            <button type="button" onClick={logout} className="ops-btn-ghost mt-2 flex w-full items-center justify-center gap-1.5 py-1.5 text-xs">
              <LogOut className="h-3.5 w-3.5" />
              退出登录
            </button>
          </div>
        ) : null}
      </aside>

      <div className="ml-[15.5rem] flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="ops-header sticky top-0 z-30 flex min-h-14 flex-wrap items-center justify-between gap-3 border-b px-6 py-3 backdrop-blur-md">
          <div className="min-w-0">
            {pageMeta.group ? (
              <p className="ops-muted text-[11px] font-medium tracking-wide">{pageMeta.group}</p>
            ) : null}
            <h2 className="truncate text-base font-semibold tracking-tight">{pageMeta.title}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="ops-muted hidden text-[11px] lg:inline">三端数据 · 生产网关</span>
            {session && session.role !== 'super_admin' ? (
              <span className="ops-badge ops-badge--sky text-[10px]">已授权 {session.permissions.length} 模块</span>
            ) : (
              <span className="ops-badge ops-badge--amber text-[10px]">超级管理员</span>
            )}
          </div>
        </header>

        <main className="ops-main flex-1 overflow-auto px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
