import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { fetchPrimaryTenantId } from '../lib/tenantBilling'
import {
  fetchTenantAnnouncementInbox,
  markAllTenantAnnouncementsRead,
  markTenantAnnouncementRead,
  type TenantAnnouncementInboxItem,
} from '../lib/tenantAnnouncements'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'

type TenantAnnouncementContextValue = {
  items: TenantAnnouncementInboxItem[]
  loading: boolean
  tenantId: string | null
  unreadCount: number
  normalUnreadCount: number
  urgentUnreadItems: TenantAnnouncementInboxItem[]
  reload: () => Promise<void>
  markItemRead: (item: TenantAnnouncementInboxItem) => Promise<void>
  markAllRead: () => Promise<void>
}

const TenantAnnouncementContext = createContext<TenantAnnouncementContextValue | null>(null)

export function TenantAnnouncementProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<TenantAnnouncementInboxItem[]>([])
  const [loading, setLoading] = useState(false)
  const [tenantId, setTenantId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!supabaseConfigured || !supabase) {
      setItems([])
      setTenantId(null)
      return
    }
    const tid = await fetchPrimaryTenantId(supabase)
    setTenantId(tid)
    if (!tid) {
      setItems([])
      return
    }
    setLoading(true)
    const r = await fetchTenantAnnouncementInbox(supabase, tid)
    setLoading(false)
    if (r.ok) setItems(r.items)
  }, [])

  useEffect(() => {
    void reload()
    const t = window.setInterval(() => void reload(), 45_000)
    return () => window.clearInterval(t)
  }, [reload])

  useEffect(() => {
    if (!supabaseConfigured || !supabase) return
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void reload()
    })
    return () => subscription.unsubscribe()
  }, [reload])

  const markItemRead = useCallback(async (item: TenantAnnouncementInboxItem) => {
    if (item.readAt || !supabase) return
    const r = await markTenantAnnouncementRead(supabase, item.deliveryId)
    if (r.ok) {
      setItems((prev) =>
        prev.map((x) =>
          x.deliveryId === item.deliveryId ? { ...x, readAt: new Date().toISOString() } : x,
        ),
      )
    }
  }, [])

  const markAllRead = useCallback(async () => {
    if (!supabase || !tenantId) return
    const r = await markAllTenantAnnouncementsRead(supabase, tenantId)
    if (r.ok) {
      const now = new Date().toISOString()
      setItems((prev) => prev.map((x) => ({ ...x, readAt: x.readAt ?? now })))
    }
  }, [tenantId])

  const unreadCount = useMemo(() => items.filter((i) => !i.readAt).length, [items])
  const normalUnreadCount = useMemo(
    () => items.filter((i) => !i.readAt && i.priority !== 'urgent').length,
    [items],
  )
  const urgentUnreadItems = useMemo(
    () => items.filter((i) => !i.readAt && i.priority === 'urgent'),
    [items],
  )

  const value = useMemo(
    () => ({
      items,
      loading,
      tenantId,
      unreadCount,
      normalUnreadCount,
      urgentUnreadItems,
      reload,
      markItemRead,
      markAllRead,
    }),
    [
      items,
      loading,
      tenantId,
      unreadCount,
      normalUnreadCount,
      urgentUnreadItems,
      reload,
      markItemRead,
      markAllRead,
    ],
  )

  if (!supabaseConfigured) return <>{children}</>

  return (
    <TenantAnnouncementContext.Provider value={value}>{children}</TenantAnnouncementContext.Provider>
  )
}

export function useTenantAnnouncements(): TenantAnnouncementContextValue {
  const ctx = useContext(TenantAnnouncementContext)
  if (!ctx) {
    return {
      items: [],
      loading: false,
      tenantId: null,
      unreadCount: 0,
      normalUnreadCount: 0,
      urgentUnreadItems: [],
      reload: async () => {},
      markItemRead: async () => {},
      markAllRead: async () => {},
    }
  }
  return ctx
}
