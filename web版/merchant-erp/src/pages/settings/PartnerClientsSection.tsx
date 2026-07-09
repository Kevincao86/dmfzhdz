import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../cn'
import MerchantPlatformAccountsPanel from '../../components/settings/MerchantPlatformAccountsPanel'
import SecretInput from '../../components/SecretInput'
import { usePartnerClients } from '../../context/PartnerClientContext'
import { usePartnerTenant } from '../../context/PartnerTenantContext'
import type { MerchantBindingProvider } from '../../lib/merchantPlatformBindings'
import {
  applyActivePartnerClient,
  deletePartnerClient,
  listPartnerClients,
  pickActivePartnerClient,
  upsertPartnerClient,
  type PartnerClientRow,
} from '../../lib/partnerClientBindings'
import { MERCHANT_BACKEND_PLATFORMS, PlatformBrandLogo } from '../../lib/platformBranding'
import {
  hasServiceProviderPlatformBinding,
  serviceProviderGateHint,
} from '../../lib/partnerServiceProviderGate'
import { supabase, supabaseConfigured } from '../../lib/supabaseClient'
import { toUserFacingError } from '../../lib/userFacingError'
import {
  linkeOnboardStatusLabel,
  listPartnerLinkeOnboarding,
  retryPartnerLinkeCooperation,
  startPartnerLinkeInvite,
  type PartnerLinkeOnboardItem,
} from '../../services/partnerLinkeOnboardClient'

const PARTNER_CLIENT_PLATFORMS = MERCHANT_BACKEND_PLATFORMS.filter((p) =>
  (['douyin', 'kuaishou'] as const).includes(p.id as 'douyin' | 'kuaishou'),
)

export default function PartnerClientsSection() {
  const { reload: reloadCtx, setActiveClientForProvider } = usePartnerClients()
  const { profile } = usePartnerTenant()
  const [plat, setPlat] = useState<'douyin' | 'kuaishou'>('douyin')
  const [rows, setRows] = useState<PartnerClientRow[]>([])
  const [loading, setLoading] = useState(false)
  const [providerBound, setProviderBound] = useState<boolean | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [bindOpen, setBindOpen] = useState(false)
  const [clientLabel, setClientLabel] = useState('')
  const [merchantAccountId, setMerchantAccountId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [appId, setAppId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [onboardItems, setOnboardItems] = useState<PartnerLinkeOnboardItem[]>([])
  const [onboardLoading, setOnboardLoading] = useState(false)
  const [inviteLabel, setInviteLabel] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [lastAuthUrl, setLastAuthUrl] = useState<string | null>(null)
  const [bindMode, setBindMode] = useState<'linke_invite' | 'manual'>('linke_invite')

  const provider = plat as MerchantBindingProvider
  const platformLabel = plat === 'douyin' ? '抖音来客' : '快手团购'

  const loadProviderGate = useCallback(async () => {
    if (!supabaseConfigured || !supabase) {
      setProviderBound(null)
      return
    }
    try {
      const ok = await hasServiceProviderPlatformBinding(supabase, provider)
      setProviderBound(ok)
    } catch {
      setProviderBound(false)
    }
  }, [provider])

  const loadOnboarding = useCallback(async () => {
    if (plat !== 'douyin') {
      setOnboardItems([])
      return
    }
    setOnboardLoading(true)
    try {
      const items = await listPartnerLinkeOnboarding()
      setOnboardItems(items)
    } catch {
      setOnboardItems([])
    } finally {
      setOnboardLoading(false)
    }
  }, [plat])

  const load = useCallback(async () => {
    if (!supabaseConfigured || !supabase) return
    setLoading(true)
    setErr(null)
    try {
      await loadProviderGate()
      const list = await listPartnerClients(supabase, provider)
      setRows(list)
      const picked = pickActivePartnerClient(list, provider)
      if (picked) applyActivePartnerClient(picked)
      await loadOnboarding()
    } catch (e) {
      setErr(toUserFacingError(e, '加载客户绑定'))
    } finally {
      setLoading(false)
    }
  }, [provider, loadProviderGate, loadOnboarding])

  useEffect(() => {
    void load()
  }, [load])

  const activeId = pickActivePartnerClient(rows, provider)?.id ?? null

  const panelItems = useMemo(
    () =>
      rows.map((r) => ({
        id: r.id,
        accountId: r.merchantAccountId,
        displayName: r.clientLabel || r.accountDisplayName || r.merchantAccountId,
        subLabel: r.merchantAccountId,
        isActive: r.id === activeId,
        demoMode: r.demoMode,
      })),
    [rows, activeId],
  )

  const openBindForm = () => {
    if (providerBound === false) {
      setErr(serviceProviderGateHint(provider, { isAgent: profile.isAgent }))
      return
    }
    setErr(null)
    setBindOpen(true)
  }

  const onSelectActive = (id: string) => {
    const row = rows.find((r) => r.id === id) ?? null
    if (row) {
      applyActivePartnerClient(row)
      setActiveClientForProvider(provider, id)
    }
    void reloadCtx()
  }

  const onRemove = async (id: string) => {
    if (!supabase) return
    if (!window.confirm('确定删除该客户商家绑定？')) return
    await deletePartnerClient(supabase, id)
    await load()
    void reloadCtx()
  }

  const submitInvite = async () => {
    if (providerBound === false) {
      setErr(serviceProviderGateHint(provider, { isAgent: profile.isAgent }))
      return
    }
    setInviteBusy(true)
    setErr(null)
    try {
      const out = await startPartnerLinkeInvite({
        clientLabel: inviteLabel.trim() || undefined,
      })
      setLastAuthUrl(out.authUrl)
      setInviteLabel('')
      await loadOnboarding()
      await load()
      void reloadCtx()
    } catch (e) {
      setErr(toUserFacingError(e, '生成林客授权'))
    } finally {
      setInviteBusy(false)
    }
  }

  const copyAuthUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setErr(null)
    } catch {
      setErr('复制失败，请手动选中链接复制')
    }
  }

  const onRetryCooperation = async (id: string) => {
    setInviteBusy(true)
    setErr(null)
    try {
      const msg = await retryPartnerLinkeCooperation(id)
      setErr(msg)
      await loadOnboarding()
    } catch (e) {
      setErr(toUserFacingError(e, '重试代运营合作'))
    } finally {
      setInviteBusy(false)
    }
  }

  const submitBind = async () => {
    if (!supabase) return
    if (providerBound === false) {
      setErr(serviceProviderGateHint(provider, { isAgent: profile.isAgent }))
      return
    }
    const mid = merchantAccountId.trim()
    const token = accessToken.trim()
    if (!mid || !token) {
      setErr('请填写客户商家账号 ID 与授权凭证（sealed token）')
      return
    }
    setSubmitting(true)
    setErr(null)
    try {
      const row = await upsertPartnerClient(supabase, {
        provider,
        merchantAccountId: mid,
        sealedCredentials: token,
        clientKey: appId.trim() || null,
        clientLabel: clientLabel.trim() || null,
        accountDisplayName: clientLabel.trim() || mid,
      })
      if (!row) {
        setErr('保存失败，请确认已登录服务商租户')
        return
      }
      applyActivePartnerClient(row)
      setActiveClientForProvider(provider, row.id)
      setBindOpen(false)
      setClientLabel('')
      setMerchantAccountId('')
      setAccessToken('')
      setAppId('')
      await load()
      void reloadCtx()
    } catch (e) {
      setErr(toUserFacingError(e, '绑定客户'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900">客户商家账号</h3>
        <p className="mt-1 text-sm text-gray-500">
          在「系统 → 服务商平台」完成<strong>抖音林客 / 快手服务商</strong>绑定后，在此添加代运营客户的
          <strong>商家授权凭证</strong>。商品、门店与招募将使用顶栏选中的客户身份。
        </p>
      </div>

      {providerBound === false ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {serviceProviderGateHint(provider)}
          <Link
            to="/settings?tab=merchant"
            className="ml-1 font-medium text-amber-900 underline hover:text-amber-950"
          >
            前往服务商平台
          </Link>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {PARTNER_CLIENT_PLATFORMS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPlat(p.id as 'douyin' | 'kuaishou')}
            className={cn(
              'flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all',
              plat === p.id
                ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
            )}
          >
            <PlatformBrandLogo logo={p.logo} alt={p.tabName} size="sm" />
            {p.tabName}
          </button>
        ))}
      </div>

      {err ? (
        <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p>
      ) : null}

      <MerchantPlatformAccountsPanel
        accounts={panelItems}
        maxAccounts={50}
        planHint="服务商版可绑定多个代运营客户"
        emptyHint={
          providerBound === false
            ? `请先完成${plat === 'douyin' ? '抖音林客' : '快手服务商'}绑定，再添加客户商家`
            : `尚未绑定该平台的客户商家账号`
        }
        onSelectActive={onSelectActive}
        onRemove={(id) => void onRemove(id)}
        onAddClick={() => {
          if (plat === 'douyin' && bindMode === 'linke_invite') {
            setBindMode('manual')
          }
          openBindForm()
        }}
        addDisabled={providerBound === false}
      />

      {loading ? <p className="text-sm text-gray-500">加载中…</p> : null}

      {plat === 'douyin' ? (
        <div className="space-y-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="font-medium text-gray-900">林客邀请开通（授权 + 代运营）</h4>
              <p className="mt-1 text-xs text-gray-600">
                生成官方授权链接 → 商家在<strong>抖音来客</strong>完成授权 → 系统自动写入客户商家并发起代运营合作 →
                商家在<strong>来客 App</strong>确认合作。Webhook 地址：
                <code className="mx-1 rounded bg-white px-1 text-[11px]">/erp-api/meoo-douyin-life-webhook</code>
              </p>
            </div>
            <div className="flex gap-2 text-sm">
              <button
                type="button"
                onClick={() => setBindMode('linke_invite')}
                className={cn(
                  'rounded-lg border px-3 py-1.5',
                  bindMode === 'linke_invite'
                    ? 'border-indigo-300 bg-white text-indigo-800'
                    : 'border-gray-200 bg-white/60 text-gray-600',
                )}
              >
                邀请开通
              </button>
              <button
                type="button"
                onClick={() => setBindMode('manual')}
                className={cn(
                  'rounded-lg border px-3 py-1.5',
                  bindMode === 'manual'
                    ? 'border-indigo-300 bg-white text-indigo-800'
                    : 'border-gray-200 bg-white/60 text-gray-600',
                )}
              >
                手工录入
              </button>
            </div>
          </div>

          {bindMode === 'linke_invite' ? (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="text-gray-700">客户备注名（可选）</span>
                <input
                  className="mt-1 w-full max-w-md rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  value={inviteLabel}
                  onChange={(e) => setInviteLabel(e.target.value)}
                  placeholder="例如：XX火锅人民路店"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={inviteBusy || providerBound === false}
                  onClick={() => void submitInvite()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {inviteBusy ? '生成中…' : '生成林客授权链接'}
                </button>
                <button
                  type="button"
                  disabled={onboardLoading}
                  onClick={() => void loadOnboarding()}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  刷新进度
                </button>
              </div>
              {lastAuthUrl ? (
                <div className="rounded-lg border border-indigo-200 bg-white p-3 text-sm">
                  <p className="font-medium text-gray-900">最新授权链接（24 小时内有效）</p>
                  <p className="mt-1 break-all text-xs text-gray-600">{lastAuthUrl}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void copyAuthUrl(lastAuthUrl)}
                      className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                    >
                      复制链接
                    </button>
                    <a
                      href={lastAuthUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50"
                    >
                      新窗口打开
                    </a>
                  </div>
                </div>
              ) : null}
              {onboardLoading ? <p className="text-sm text-gray-500">开通任务加载中…</p> : null}
              {onboardItems.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                  <table className="min-w-[640px] w-full text-left text-sm">
                    <thead className="border-b bg-gray-50 text-gray-600">
                      <tr>
                        <th className="px-3 py-2">客户</th>
                        <th className="px-3 py-2">授权</th>
                        <th className="px-3 py-2">代运营</th>
                        <th className="px-3 py-2">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {onboardItems.map((item) => (
                        <tr key={item.id} className="border-b border-gray-100 last:border-0">
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-900">
                              {item.clientLabel || item.merchantAccountId || '—'}
                            </div>
                            {item.merchantAccountId ? (
                              <div className="text-xs text-gray-500">{item.merchantAccountId}</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-gray-700">{linkeOnboardStatusLabel(item)}</td>
                          <td className="px-3 py-2 text-xs text-gray-600">
                            {item.cooperationOrderId ? `单号 ${item.cooperationOrderId}` : '—'}
                            {item.cooperationError ? (
                              <div className="text-red-600">{item.cooperationError}</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {item.authUrl && item.authStatus === 'pending' ? (
                                <button
                                  type="button"
                                  onClick={() => void copyAuthUrl(item.authUrl!)}
                                  className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                                >
                                  复制授权链
                                </button>
                              ) : null}
                              {item.cooperationStatus === 'failed' ? (
                                <button
                                  type="button"
                                  disabled={inviteBusy}
                                  onClick={() => void onRetryCooperation(item.id)}
                                  className="rounded border border-amber-300 px-2 py-1 text-xs text-amber-900 hover:bg-amber-50"
                                >
                                  重试代运营
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-500">暂无开通任务，点击上方按钮生成授权链接。</p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {bindOpen && (plat !== 'douyin' || bindMode === 'manual') ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-5 space-y-4">
          <h4 className="font-medium text-gray-900">添加客户 · {platformLabel}商家</h4>
          <p className="text-xs text-gray-600">
            请使用<strong>林客服务商应用</strong>为该商家完成 OAuth 授权后，将平台返回的商家 access_token（或本系统
            sealed 凭证）与客户商家 ID 填入。详见「服务商平台」上方 OpenAPI 接入说明。
          </p>
          <label className="block text-sm">
            <span className="text-gray-700">客户备注名</span>
            <input
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={clientLabel}
              onChange={(e) => setClientLabel(e.target.value)}
              placeholder="例如：XX火锅人民路店"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">客户商家账号 ID</span>
            <input
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={merchantAccountId}
              onChange={(e) => setMerchantAccountId(e.target.value)}
              placeholder="平台侧该商家的商户 / POI 根账户 ID"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">App ID（可选）</span>
            <input
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">商家授权凭证 / access_token</span>
            <SecretInput
              className="mt-1 w-full"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="粘贴该客户的 sealed 凭证或 token"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submitBind()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? '保存中…' : '保存绑定'}
            </button>
            <button
              type="button"
              onClick={() => setBindOpen(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-white"
            >
              取消
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
