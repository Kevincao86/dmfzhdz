import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { isPartnerEdition } from '../lib/appEdition'
import {
  fetchPartnerTenantProfile,
  type PartnerTenantProfile,
} from '../lib/partnerTenantProfile'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'

type PartnerTenantContextValue = {
  profile: PartnerTenantProfile
  loading: boolean
  reload: () => Promise<void>
}

const DEFAULT_PROFILE: PartnerTenantProfile = {
  tenantId: '',
  name: '',
  edition: 'partner',
  parentTenantId: null,
  isAgent: false,
  isParent: true,
}

const PartnerTenantContext = createContext<PartnerTenantContextValue | null>(null)

export function PartnerTenantProvider({ children }: { children: ReactNode }) {
  const enabled = isPartnerEdition()
  const [profile, setProfile] = useState<PartnerTenantProfile>(DEFAULT_PROFILE)
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!enabled || !supabaseConfigured || !supabase) {
      setProfile(DEFAULT_PROFILE)
      return
    }
    setLoading(true)
    try {
      const p = await fetchPartnerTenantProfile(supabase)
      setProfile(p)
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    void reload()
  }, [reload])

  const value = useMemo(
    () => ({ profile, loading, reload }),
    [profile, loading, reload],
  )

  if (!enabled) return <>{children}</>

  return (
    <PartnerTenantContext.Provider value={value}>{children}</PartnerTenantContext.Provider>
  )
}

export function usePartnerTenant(): PartnerTenantContextValue {
  const ctx = useContext(PartnerTenantContext)
  if (!ctx) {
    return {
      profile: DEFAULT_PROFILE,
      loading: false,
      reload: async () => {},
    }
  }
  return ctx
}
