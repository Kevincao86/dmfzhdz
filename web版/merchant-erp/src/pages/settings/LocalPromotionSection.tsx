import { BookOpen, ExternalLink } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import MerchantPlatformAccountsPanel from '../../components/settings/MerchantPlatformAccountsPanel'
import SecretInput from '../../components/SecretInput'
import { useMembership } from '../../context/MembershipContext'
import { cn } from '../../cn'
import {
  canAddPlatformBinding,
  platformBindingLimitDescription,
  platformBindingLimitExceededMessage,
} from '../../lib/membershipPlan'
import { PlatformBrandLogo } from '../../lib/platformBranding'
import { toUserFacingError } from '../../lib/userFacingError'
import {
  applyActiveLocalPromotionBinding,
  localPromotionRowToBindState,
  packLocalPromotionForCloud,
  pickActiveLocalPromotionBinding,
  readLocalPromotionBinding,
  writeLocalPromotionBinding,
} from '../../lib/localPromotionBinding'
import {
  deleteMerchantBindingById,
  listMerchantBindings,
  readActiveBindingId,
  upsertMerchantBinding,
  type MerchantPlatformBindingRow,
} from '../../lib/merchantPlatformBindings'
import { supabase, supabaseConfigured } from '../../lib/supabaseClient'
import {
  buildLocalPromotionAuthorizeUrl,
  clearLocalPromotionOAuthDraft,
  exchangeLocalPromotionAuthCode,
  isAuthCodeAlreadyUsedMessage,
  localPromotionOAuthRedirectUri,
  peekLocalPromotionOAuthPendingCode,
  readLocalPromotionOAuthDraft,
  saveLocalPromotionOAuthDraft,
  stashLocalPromotionOAuthPendingCode,
  takeLocalPromotionOAuthPendingCode,
  testLocalPromotionBind,
} from '../../services/localPromotionApi'
import BindGuideModal from './bindGuide/BindGuideModal'
import PlatformBindGuide from './bindGuide/PlatformBindGuide'
import { LOCAL_PROMOTION_BIND_GUIDE } from './bindGuide/localPromotionBindGuide'

const OE_OAUTH_STATE_KEY = 'meoo_local_promotion_oauth_state'

export default function LocalPromotionSection() {
  const { plan, entitlements } = useMembership()
  const location = useLocation()
  const navigate = useNavigate()
  const bindingLimit = entitlements.platformBindingLimit
  const active = readLocalPromotionBinding()
  const [cloudBindings, setCloudBindings] = useState<MerchantPlatformBindingRow[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [authCode, setAuthCode] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [refreshToken, setRefreshToken] = useState('')
  const [tokenExpiresAt, setTokenExpiresAt] = useState('')
  const [localAccountId, setLocalAccountId] = useState('')
  const [advertiserOptions, setAdvertiserOptions] = useState<string[]>([])
  const [accountName, setAccountName] = useState('')
  const [busy, setBusy] = useState(false)
  const [oauthBusy, setOauthBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const refreshCloudList = useCallback(async () => {
    if (!supabaseConfigured || !supabase) return
    const rows = await listMerchantBindings(supabase, 'local_promotion')
    setCloudBindings(rows)
    const picked = pickActiveLocalPromotionBinding(rows)
    applyActiveLocalPromotionBinding(picked)
  }, [])

  useEffect(() => {
    void refreshCloudList()
  }, [refreshCloudList])

  const activeBindingId = readActiveBindingId('local_promotion')

  const accountItems = useMemo(
    () =>
      cloudBindings.map((b) => ({
        id: b.id,
        accountId: b.merchantAccountId,
        displayName: b.bindingLabel || b.accountDisplayName || b.merchantAccountId,
        subLabel: b.clientKey ? `应用编号 ${b.clientKey}` : undefined,
        isActive: b.id === activeBindingId,
        demoMode: b.demoMode,
      })),
    [cloudBindings, activeBindingId],
  )

  const resetForm = () => {
    setAppId('')
    setAppSecret('')
    setAuthCode('')
    setAccessToken('')
    setRefreshToken('')
    setTokenExpiresAt('')
    setLocalAccountId('')
    setAdvertiserOptions([])
    setAccountName('')
  }

  const openAddForm = () => {
    setMsg(null)
    if (!canAddPlatformBinding(plan, cloudBindings.length)) {
      setMsg({ tone: 'err', text: platformBindingLimitExceededMessage(plan) })
      return
    }
    resetForm()
    const draft = readLocalPromotionOAuthDraft()
    if (draft) {
      setAppId(draft.appId)
      setAppSecret(draft.appSecret)
      if (draft.accountName) setAccountName(draft.accountName)
    }
    setFormOpen(true)
  }

  const applyOAuthResult = (input: {
    accessToken: string
    refreshToken?: string
    tokenExpiresAt?: string
    advertiserIds?: string[]
    message: string
  }) => {
    setAccessToken(input.accessToken)
    setAuthCode('')
    if (input.refreshToken) setRefreshToken(input.refreshToken)
    if (input.tokenExpiresAt) setTokenExpiresAt(input.tokenExpiresAt)
    if (input.advertiserIds?.length) {
      setAdvertiserOptions(input.advertiserIds)
      if (input.advertiserIds.length === 1) setLocalAccountId(input.advertiserIds[0])
    }
    setMsg({ tone: 'ok', text: input.message })
  }

  const stripOAuthQuery = useCallback(() => {
    const p = new URLSearchParams(location.search)
    if (!p.has('auth_code') && !p.has('code') && !p.has('state')) return
    p.delete('auth_code')
    p.delete('code')
    p.delete('state')
    if (!p.get('tab')) p.set('tab', 'commercial')
    const qs = p.toString()
    navigate({ pathname: location.pathname, search: qs ? `?${qs}` : '' }, { replace: true })
  }, [location.pathname, location.search, navigate])

  /** OAuth 回调：开放平台 redirect 至 /settings?auth_code=… */
  useEffect(() => {
    const p = new URLSearchParams(location.search)
    const fromUrl = (p.get('auth_code') || p.get('code') || '').trim()
    const code = fromUrl || peekLocalPromotionOAuthPendingCode()
    if (!code) return

    if (fromUrl) {
      stashLocalPromotionOAuthPendingCode(fromUrl)
      stripOAuthQuery()
    }

    const draft = readLocalPromotionOAuthDraft()
    if (draft) {
      setAppId(draft.appId)
      setAppSecret(draft.appSecret)
      if (draft.accountName) setAccountName(draft.accountName)
    }
    setFormOpen(true)
    setMsg({ tone: 'ok', text: '已收到授权码，正在换取 Access Token…' })

    const expectedState = sessionStorage.getItem(OE_OAUTH_STATE_KEY)
    const returnedState = (p.get('state') || '').trim()
    if (expectedState && returnedState && expectedState !== returnedState) {
      setMsg({ tone: 'err', text: 'OAuth state 校验失败，请重新发起授权' })
      takeLocalPromotionOAuthPendingCode()
      return
    }

    if (!draft?.appId || !draft.appSecret) {
      setMsg({
        tone: 'err',
        text: '请先填写应用编号与 App Secret，再点击「前往巨量授权」；也可手动粘贴授权码后保存。',
      })
      takeLocalPromotionOAuthPendingCode()
      return
    }

    let cancelled = false
    ;(async () => {
      setOauthBusy(true)
      try {
        const ex = await exchangeLocalPromotionAuthCode({
          appId: draft.appId,
          appSecret: draft.appSecret,
          authCode: code,
        })
        if (cancelled) return
        if (!ex.ok) {
          if (isAuthCodeAlreadyUsedMessage(ex.message)) {
            setAuthCode('')
            setMsg({
              tone: 'err',
              text: '授权码已使用或已过期，请重新点击「前往巨量授权」获取新授权码；若已显示 Access Token，可直接保存。',
            })
          } else {
            setMsg({ tone: 'err', text: toUserFacingError(ex.message, 'OAuth 换票') })
          }
          return
        }
        applyOAuthResult(ex)
        clearLocalPromotionOAuthDraft()
      } finally {
        takeLocalPromotionOAuthPendingCode()
        if (!cancelled) setOauthBusy(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [location.search, stripOAuthQuery])

  const startOAuth = async () => {
    setMsg(null)
    if (!appId.trim() || !appSecret.trim()) {
      setMsg({ tone: 'err', text: '请先填写应用编号与 App Secret（开放平台应用详情）' })
      return
    }
    saveLocalPromotionOAuthDraft({
      appId: appId.trim(),
      appSecret: appSecret.trim(),
      accountName: accountName.trim(),
    })
    setOauthBusy(true)
    try {
      const r = await buildLocalPromotionAuthorizeUrl({ appId: appId.trim() })
      if (!r.ok) {
        setMsg({ tone: 'err', text: r.message })
        return
      }
      window.location.href = r.url
    } finally {
      setOauthBusy(false)
    }
  }

  const save = async () => {
    setMsg(null)
    const hasTokenPath = Boolean(accessToken.trim() || authCode.trim() || refreshToken.trim())
    if (!hasTokenPath && (!appId.trim() || !appSecret.trim())) {
      setMsg({ tone: 'err', text: '请填写应用编号与 App Secret，并完成 OAuth 授权' })
      return
    }
    if (!localAccountId.trim()) {
      setMsg({ tone: 'err', text: '请填写或选择广告主编号' })
      return
    }
    const exists = cloudBindings.some((b) => b.merchantAccountId === localAccountId.trim())
    if (!exists && !canAddPlatformBinding(plan, cloudBindings.length)) {
      setMsg({ tone: 'err', text: platformBindingLimitExceededMessage(plan) })
      return
    }
    setBusy(true)
    try {
      const r = await testLocalPromotionBind({
        appId: appId.trim(),
        appSecret: appSecret.trim() || undefined,
        accessToken: accessToken.trim() || undefined,
        authCode: accessToken.trim() ? undefined : authCode.trim() || undefined,
        refreshToken: refreshToken.trim() || undefined,
        localAccountId: localAccountId.trim(),
      })
      if (!r.ok) {
        setMsg({ tone: 'err', text: toUserFacingError(r.message, '授权校验') })
        return
      }

      const resolvedAccess = r.accessToken ?? accessToken.trim()
      const resolvedRefresh = r.refreshToken ?? (refreshToken.trim() || undefined)
      const resolvedExpires = r.tokenExpiresAt ?? (tokenExpiresAt.trim() || undefined)
      if (r.advertiserIds?.length) setAdvertiserOptions(r.advertiserIds)

      const label = accountName.trim() || `本地推 ${localAccountId.trim()}`
      let bindingId: string | undefined

      if (supabaseConfigured && supabase) {
        const ur = await upsertMerchantBinding(supabase, {
          provider: 'local_promotion',
          merchantAccountId: localAccountId.trim(),
          sealedCredentials: packLocalPromotionForCloud({
            accessToken: resolvedAccess,
            appId: appId.trim(),
            appSecret: appSecret.trim() || undefined,
            refreshToken: resolvedRefresh,
            tokenExpiresAt: resolvedExpires,
          }),
          clientKey: appId.trim() || null,
          accountDisplayName: label,
          bindingLabel: label,
          demoMode: r.demoMode,
        })
        if (!ur.ok) {
          setMsg({ tone: 'err', text: ur.message })
          return
        }
        bindingId = ur.row.id
        await refreshCloudList()
      }

      writeLocalPromotionBinding({
        bindingId,
        appId: appId.trim(),
        appSecret: appSecret.trim() || undefined,
        accessToken: resolvedAccess,
        refreshToken: resolvedRefresh,
        tokenExpiresAt: resolvedExpires,
        localAccountId: localAccountId.trim(),
        accountName: label,
        boundAt: new Date().toISOString(),
        demoMode: r.demoMode,
      })

      setFormOpen(false)
      resetForm()
      clearLocalPromotionOAuthDraft()
      setMsg({
        tone: 'ok',
        text: r.demoMode
          ? `${r.message} · 当前为演示数据，完成平台授权后可查看真实投流与线索。`
          : `${r.message} · 已设为当前使用账号。`,
      })
    } finally {
      setBusy(false)
    }
  }

  const selectBinding = (id: string) => {
    const row = cloudBindings.find((b) => b.id === id)
    if (!row) return
    applyActiveLocalPromotionBinding(row)
    const state = localPromotionRowToBindState(row)
    if (state) writeLocalPromotionBinding(state)
    setMsg({ tone: 'ok', text: '已切换当前本地推账号' })
  }

  const removeBinding = async (id: string) => {
    if (!window.confirm('确定移除此本地推账号？')) return
    if (supabaseConfigured && supabase) {
      const d = await deleteMerchantBindingById(supabase, id)
      if (!d.ok) {
        setMsg({ tone: 'err', text: d.message })
        return
      }
      const rows = await listMerchantBindings(supabase, 'local_promotion')
      setCloudBindings(rows)
      const next = pickActiveLocalPromotionBinding(rows)
      applyActiveLocalPromotionBinding(next)
      writeLocalPromotionBinding(next ? localPromotionRowToBindState(next) : null)
    } else if (readActiveBindingId('local_promotion') === id) {
      writeLocalPromotionBinding(null)
    }
    setMsg({ tone: 'ok', text: '已移除账号' })
  }

  const redirectHint = localPromotionOAuthRedirectUri()

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <PlatformBrandLogo logo="ocean_engine_local" alt="巨量本地推" size="md" />
            <div>
              <h3 className="font-semibold text-slate-900">巨量本地推</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                用于「投流」「线索」中的本地推数据；与抖音来客经营账号相互独立。
                App Secret 不能替代 Access Token，须通过 OAuth 授权换取。
                {platformBindingLimitDescription(plan)}，「当前使用」决定数据范围。
                {plan !== 'member_plus' ? (
                  <>
                    {' '}
                    <Link to="/settings?tab=subscription" className="text-cyan-600 hover:underline">
                      升级套餐
                    </Link>
                    可绑定更多账号。
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <BookOpen className="h-4 w-4" />
              绑定说明书
            </button>
            {active ? (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-medium',
                  active.demoMode ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800',
                )}
              >
                {active.demoMode ? '演示' : '已连接'}
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">未连接</span>
            )}
          </div>
        </div>

        {supabaseConfigured ? (
          <div className="mb-5">
            <MerchantPlatformAccountsPanel
              accounts={accountItems}
              maxAccounts={bindingLimit}
              planHint={platformBindingLimitDescription(plan)}
              emptyHint="尚未绑定本地推账号"
              onSelectActive={selectBinding}
              onRemove={(id) => void removeBinding(id)}
              onAddClick={openAddForm}
            />
          </div>
        ) : null}

        {formOpen || (!active && !supabaseConfigured) ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-orange-100 bg-orange-50/60 px-3 py-2 text-xs text-orange-900">
              <p className="font-medium">OAuth 绑定流程</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-orange-800/90">
                <li>在开放平台应用详情复制 <strong>App ID</strong> 与 <strong>Secret</strong> 填入下方。</li>
                <li>确认回调地址为 <code className="rounded bg-white/80 px-1">{redirectHint}</code>（须与平台配置一致）。</li>
                <li>点击「前往巨量授权」，登录并勾选投放账户后确认。</li>
                <li>返回本页自动换票，选择广告主编号后「保存并校验」。</li>
              </ol>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-slate-600">应用编号 App ID（必填）</label>
                <input
                  value={appId}
                  onChange={(e) => setAppId(e.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums"
                  placeholder="开放平台应用详情中的 APP_ID"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">应用密钥 App Secret（必填）</label>
                <SecretInput
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="开放平台应用详情中的 Secret"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-slate-600">账户备注名</label>
                <input
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="例如：杭州西湖店"
                />
              </div>
              <div className="sm:col-span-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={oauthBusy || busy}
                  onClick={() => void startOAuth()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  <ExternalLink className="h-4 w-4" />
                  {oauthBusy ? '处理授权中…' : '前往巨量授权'}
                </button>
                {accessToken ? (
                  <span className="self-center text-xs text-emerald-600">已获取 Access Token</span>
                ) : null}
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-slate-600">授权码 auth_code（选填，OAuth 回调自动填入）</label>
                <SecretInput
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="授权后约 10 分钟内有效；通常无需手动粘贴"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-slate-600">
                  Access Token（选填，已有 token 可直接粘贴）
                </label>
                <SecretInput
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="OAuth 换票成功后自动填入；勿将 App Secret 填在此处"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-slate-600">广告主编号（必填）</label>
                {advertiserOptions.length > 1 ? (
                  <select
                    value={localAccountId}
                    onChange={(e) => setLocalAccountId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums"
                  >
                    <option value="">请选择已授权广告主</option>
                    {advertiserOptions.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={localAccountId}
                    onChange={(e) => setLocalAccountId(e.target.value.replace(/\D/g, ''))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums"
                    placeholder="本地推后台中的数字广告主 ID"
                  />
                )}
              </div>
            </div>
          </div>
        ) : active && supabaseConfigured ? (
          <p className="text-sm text-slate-600">
            当前使用：<strong>{active.accountName}</strong>
            <span className="ml-2 text-xs text-slate-500 tabular-nums">编号 {active.localAccountId}</span>
            {active.demoMode ? (
              <span className="ml-2 text-xs text-amber-600">（演示模式）</span>
            ) : (
              <span className="ml-2 text-xs text-emerald-600">（已连接）</span>
            )}
          </p>
        ) : null}

        {msg ? (
          <p className={cn('mt-3 text-sm', msg.tone === 'ok' ? 'text-emerald-600' : 'text-rose-600')}>
            {msg.text}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {(formOpen || !active) && (
            <>
              <button
                type="button"
                disabled={busy || oauthBusy}
                onClick={() => void save()}
                className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50"
              >
                {busy ? '校验中…' : '保存并校验'}
              </button>
              {formOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setFormOpen(false)
                    resetForm()
                  }}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  取消
                </button>
              ) : null}
            </>
          )}
          {active && !formOpen ? (
            <button
              type="button"
              onClick={openAddForm}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              添加本地推账号
            </button>
          ) : null}
        </div>
      </div>

      <BindGuideModal
        open={guideOpen}
        title="巨量本地推绑定说明书"
        onClose={() => setGuideOpen(false)}
        primaryAction={
          !active || formOpen
            ? {
                label: '去绑定',
                onClick: () => {
                  setGuideOpen(false)
                  openAddForm()
                },
              }
            : undefined
        }
      >
        <PlatformBindGuide config={LOCAL_PROMOTION_BIND_GUIDE} compact />
      </BindGuideModal>
    </>
  )
}
