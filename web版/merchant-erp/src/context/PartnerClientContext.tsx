import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { MerchantBindingProvider } from '../lib/merchantPlatformBindings'
import {
  applyActivePartnerClient,
  listPartnerClients,
  pickActivePartnerClient,
  readActivePartnerClientId,
  type PartnerClientRow,
  writeActivePartnerClient,
} from '../lib/partnerClientBindings'
import { isPartnerEdition } from '../lib/appEdition'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'

type PartnerClientContextValue = {
  clients: PartnerClientRow[]
  activeClientId: string | null
  activeClient: PartnerClientRow | null
  scopeLabel: string
  loading: boolean
  reload: () => Promise<void>
  setActiveClient: (id: string | null) => void
  setActiveClientForProvider: (provider: MerchantBindingProvider, id: string | null) => void
}

const PartnerClientContext = createContext<PartnerClientContextValue | null>(null)

export function PartnerClientProvider({ children }: { children: ReactNode }) {
  const enabled = isPartnerEdition()
  const [clients, setClients] = useState<PartnerClientRow[]>([])
  const [activeClientId, setActiveClientId] = useState<string | null>(() =>
    enabled ? readActivePartnerClientId() : null,
  )
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!enabled || !supabaseConfigured || !supabase) {
      setClients([])
      return
    }
    setLoading(true)
    try {
      const rows = await listPartnerClients(supabase)
      setClients(rows)
      const picked = pickActivePartnerClient(rows)
      if (picked) {
        setActiveClientId(picked.id)
        applyActivePartnerClient(picked)
      }
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    void reload()
  }, [reload])

  const activeClient = useMemo(
    () => clients.find((c) => c.id === activeClientId) ?? null,
    [clients, activeClientId],
  )

  const setActiveClient = useCallback(
    (id: string | null) => {
      setActiveClientId(id)
      if (id == null) {
        writeActivePartnerClient(null, null)
        applyActivePartnerClient(null)
        return
      }
      const row = clients.find((c) => c.id === id) ?? null
      if (row) {
        writeActivePartnerClient(row.id, row.provider)
        applyActivePartnerClient(row)
      }
    },
    [clients],
  )

  const setActiveClientForProvider = useCallback(
    (provider: MerchantBindingProvider, id: string | null) => {
      if (id == null) {
        if (activeClient?.provider === provider) setActiveClient(null)
        return
      }
      const row = clients.find((c) => c.id === id && c.provider === provider) ?? null
      if (row) setActiveClient(row.id)
    },
    [activeClient?.provider, clients, setActiveClient],
  )

  const scopeLabel = useMemo(() => {
    if (!enabled) return ''
    if (!activeClient) return '全部客户（汇总视图）'
    return activeClient.clientLabel || activeClient.accountDisplayName || activeClient.merchantAccountId
  }, [activeClient, enabled])

  const value = useMemo<PartnerClientContextValue>(
    () => ({
      clients,
      activeClientId,
      activeClient,
      scopeLabel,
      loading,
      reload,
      setActiveClient,
      setActiveClientForProvider,
    }),
    [
      clients,
      activeClientId,
      activeClient,
      scopeLabel,
      loading,
      reload,
      setActiveClient,
      setActiveClientForProvider,
    ],
  )

  if (!enabled) {
    return <>{children}</>
  }

  return (
    <PartnerClientContext.Provider value={value}>{children}</PartnerClientContext.Provider>
  )
}

export function usePartnerClients(): PartnerClientContextValue {
  const ctx = useContext(PartnerClientContext)
  if (!ctx) {
    return {
      clients: [],
      activeClientId: null,
      activeClient: null,
      scopeLabel: '',
      loading: false,
      reload: async () => {},
      setActiveClient: () => {},
      setActiveClientForProvider: () => {},
    }
  }
  return ctx
}
