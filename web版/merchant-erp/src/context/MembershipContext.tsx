import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MembershipUpgradeDialog,
  type MembershipMediaKind,
} from '../components/MembershipUpgradeDialog'
import {
  MEMBERSHIP_UPGRADE_HREF,
  buildTenantEntitlements,
  membershipAllowsAiImageGen,
  membershipAllowsAiVideoGen,
  type MembershipPlan,
  type TenantEntitlements,
} from '../lib/membershipPlan'
import { readMpEmbedAddonAccess } from '../lib/mpEmbedAddonAccess'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { fetchPrimaryTenantId } from '../lib/tenantBilling'

type MembershipContextValue = {
  plan: MembershipPlan
  entitlements: TenantEntitlements
  loading: boolean
  reload: (opts?: { silent?: boolean }) => Promise<void>
  /** 允许则 true；免费版弹出升级框并返回 false。履约嵌入不拦截。 */
  requireAiImageGen: () => boolean
  requireAiVideoGen: () => boolean
  openMembershipUpgrade: (kind?: MembershipMediaKind) => void
}

const defaultEntitlements = buildTenantEntitlements({ plan: 'free' })

const MembershipContext = createContext<MembershipContextValue>({
  plan: 'free',
  entitlements: defaultEntitlements,
  loading: true,
  reload: async () => {},
  requireAiImageGen: () => true,
  requireAiVideoGen: () => true,
  openMembershipUpgrade: () => {},
})

export function MembershipProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [plan, setPlan] = useState<MembershipPlan>('free')
  const [directUsed, setDirectUsed] = useState(0)
  const [tokenMixBound, setTokenMixBound] = useState(false)
  /** 仅首屏拉取权益时短暂阻塞；默认 free 先渲染，后台刷新 membership */
  const [loading, setLoading] = useState(false)
  /** 首轮 reload 完成前不按免费版拦截，避免付费账号闪升级框 */
  const [ready, setReady] = useState(false)
  const [upgradeKind, setUpgradeKind] = useState<MembershipMediaKind | null>(null)

  const reload = useCallback(async (_opts?: { silent?: boolean }) => {
    const client = supabase
    if (!supabaseConfigured || !client) {
      setPlan('free')
      setDirectUsed(0)
      setTokenMixBound(false)
      setLoading(false)
      setReady(true)
      return
    }
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
      setReady(true)
    }
  }, [])

  useEffect(() => {
    void reload()
    const client = supabase
    if (!client) return
    const { data: sub } = client.auth.onAuthStateChange(() => void reload({ silent: true }))
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

  const skipMediaGate = useCallback(() => {
    if (!ready) return true
    if (readMpEmbedAddonAccess().embedMode) return true
    return false
  }, [ready])

  const requireAiImageGen = useCallback(() => {
    if (skipMediaGate()) return true
    if (membershipAllowsAiImageGen(plan)) return true
    setUpgradeKind('image')
    return false
  }, [plan, skipMediaGate])

  const requireAiVideoGen = useCallback(() => {
    if (skipMediaGate()) return true
    if (membershipAllowsAiVideoGen(plan)) return true
    setUpgradeKind('video')
    return false
  }, [plan, skipMediaGate])

  const openMembershipUpgrade = useCallback(
    (kind: MembershipMediaKind = 'image') => {
      if (readMpEmbedAddonAccess().embedMode) {
        navigate(MEMBERSHIP_UPGRADE_HREF)
        return
      }
      setUpgradeKind(kind)
    },
    [navigate],
  )

  const value = useMemo(
    () => ({
      plan,
      entitlements,
      loading,
      reload,
      requireAiImageGen,
      requireAiVideoGen,
      openMembershipUpgrade,
    }),
    [plan, entitlements, loading, reload, requireAiImageGen, requireAiVideoGen, openMembershipUpgrade],
  )

  return (
    <MembershipContext.Provider value={value}>
      {children}
      {upgradeKind ? (
        <MembershipUpgradeDialog
          kind={upgradeKind}
          planLabel={entitlements.planLabel}
          onClose={() => setUpgradeKind(null)}
        />
      ) : null}
    </MembershipContext.Provider>
  )
}

export function useMembership(): MembershipContextValue {
  return useContext(MembershipContext)
}

export { MembershipMediaLockedBanner } from '../components/MembershipUpgradeDialog'
export type { MembershipMediaKind }
