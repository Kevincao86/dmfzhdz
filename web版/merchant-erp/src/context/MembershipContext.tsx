import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  buildTenantEntitlements,
  type MembershipPlan,
  type TenantEntitlements,
} from '../lib/membershipPlan'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { fetchPrimaryTenantId } from '../lib/tenantBilling'

type MembershipContextValue = {
  plan: MembershipPlan
  entitlements: TenantEntitlements
  loading: boolean
  reload: () => Promise<void>
}

const defaultEntitlements = buildTenantEntitlements({ plan: 'free' })

const MembershipContext = createContext<MembershipContextValue>({
  plan: 'free',
  entitlements: defaultEntitlements,
  loading: true,
  reload: async () => {},
})

export function MembershipProvider({ children }: { children: ReactNode }) {
  const [plan, setPlan] = useState<MembershipPlan>('free')
  const [directUsed, setDirectUsed] = useState(0)
  const [tokenMixBound, setTokenMixBound] = useState(false)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const client = supabase
    if (!supabaseConfigured || !client) {
      setPlan('free')
      setDirectUsed(0)
      setTokenMixBound(false)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const tid = await fetchPrimaryTenantId(client)
      if (!tid) {
        setPlan('free')
        setDirectUsed(0)
        setTokenMixBound(false)
        return
      }
      const { data, error } = await client
        .from('tenants')
        .select('membership_plan, direct_ai_calls_used')
        .eq('id', tid)
        .maybeSingle()
      if (error || !data) {
        setPlan('free')
        setDirectUsed(0)
        setTokenMixBound(false)
        return
      }
      const rawPlan = data.membership_plan
      const p: MembershipPlan =
        rawPlan === 'free' || rawPlan === 'member' || rawPlan === 'member_plus'
          ? rawPlan
          : 'free'
      setPlan(p)
      setDirectUsed(Math.max(0, Math.floor(Number(data.direct_ai_calls_used) || 0)))
      setTokenMixBound(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    const client = supabase
    if (!client) return
    const { data: sub } = client.auth.onAuthStateChange(() => void reload())
    return () => sub.subscription.unsubscribe()
  }, [reload])

  const entitlements = useMemo(
    () =>
      buildTenantEntitlements({
        plan,
        directAiCallsUsed: directUsed,
        tokenMixBound,
      }),
    [plan, directUsed, tokenMixBound],
  )

  const value = useMemo(
    () => ({ plan, entitlements, loading, reload }),
    [plan, entitlements, loading, reload],
  )

  return <MembershipContext.Provider value={value}>{children}</MembershipContext.Provider>
}

export function useMembership(): MembershipContextValue {
  return useContext(MembershipContext)
}
