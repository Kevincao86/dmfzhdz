import { BookOpen } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import MerchantPlatformAccountsPanel from '../../components/settings/MerchantPlatformAccountsPanel'
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
  applyActiveXhsCommercialBinding,
  xhsCommercialRowToBindState,
  packXhsCommercialForCloud,
  pickActiveXhsCommercialBinding,
  readXhsCommercialBinding,
  writeXhsCommercialBinding,
} from '../../lib/xhsCommercialBinding'
import {
  deleteMerchantBindingById,
  listMerchantBindings,
  readActiveBindingId,
  upsertMerchantBinding,
  type MerchantPlatformBindingRow,
} from '../../lib/merchantPlatformBindings'
import { supabase, supabaseConfigured } from '../../lib/supabaseClient'
import { testXhsCommercialBind } from '../../services/xhsCommercialApi'
import BindGuideModal from './bindGuide/BindGuideModal'
import PlatformBindGuide from './bindGuide/PlatformBindGuide'
import { XHS_COMMERCIAL_BIND_GUIDE } from './bindGuide/xhsCommercialBindGuide'

export default function XhsCommercialSection() {
  const { plan, entitlements } = useMembership()
  const bindingLimit = entitlements.platformBindingLimit
  const active = readXhsCommercialBinding()
  const [cloudBindings, setCloudBindings] = useState<MerchantPlatformBindingRow[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [appId, setAppId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [advertiserId, setAdvertiserId] = useState('')
  const [accountName, setAccountName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const refreshCloudList = useCallback(async () => {
    if (!supabaseConfigured || !supabase) return
    const rows = await listMerchantBindings(supabase, 'xhs_commercial')
    setCloudBindings(rows)
    const picked = pickActiveXhsCommercialBinding(rows)
    applyActiveXhsCommercialBinding(picked)
  }, [])

  useEffect(() => {
    void refreshCloudList()
  }, [refreshCloudList])

  const activeBindingId = readActiveBindingId('xhs_commercial')

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
    setAccessToken('')
    setAdvertiserId('')
    setAccountName('')
  }

  const openAddForm = () => {
    setMsg(null)
    if (!canAddPlatformBinding(plan, cloudBindings.length)) {
      setMsg({ tone: 'err', text: platformBindingLimitExceededMessage(plan) })
      return
    }
    resetForm()
    setFormOpen(true)
  }

  const save = async () => {
    setMsg(null)
    if (!accessToken.trim() || !advertiserId.trim()) {
      setMsg({ tone: 'err', text: '请填写授权密钥与广告主编号' })
      return
    }
    const exists = cloudBindings.some((b) => b.merchantAccountId === advertiserId.trim())
    if (!exists && !canAddPlatformBinding(plan, cloudBindings.length)) {
      setMsg({ tone: 'err', text: platformBindingLimitExceededMessage(plan) })
      return
    }
    setBusy(true)
    try {
      const r = await testXhsCommercialBind({
        appId: appId.trim(),
        accessToken: accessToken.trim(),
        advertiserId: advertiserId.trim(),
      })
      if (!r.ok) {
        setMsg({ tone: 'err', text: toUserFacingError(r.message, '授权校验') })
        return
      }

      const label = accountName.trim() || `聚光/种小草 ${advertiserId.trim()}`
      let bindingId: string | undefined

      if (supabaseConfigured && supabase) {
        const ur = await upsertMerchantBinding(supabase, {
          provider: 'xhs_commercial',
          merchantAccountId: advertiserId.trim(),
          sealedCredentials: packXhsCommercialForCloud({
            accessToken: accessToken.trim(),
            appId: appId.trim(),
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

      writeXhsCommercialBinding({
        bindingId,
        appId: appId.trim(),
        accessToken: accessToken.trim(),
        advertiserId: advertiserId.trim(),
        accountName: label,
        boundAt: new Date().toISOString(),
        demoMode: r.demoMode,
      })

      setFormOpen(false)
      resetForm()
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
    applyActiveXhsCommercialBinding(row)
    const state = xhsCommercialRowToBindState(row)
    if (state) writeXhsCommercialBinding(state)
    setMsg({ tone: 'ok', text: '已切换当前聚光/种小草账号' })
  }

  const removeBinding = async (id: string) => {
    if (!window.confirm('确定移除此聚光/种小草账号？')) return
    if (supabaseConfigured && supabase) {
      const d = await deleteMerchantBindingById(supabase, id)
      if (!d.ok) {
        setMsg({ tone: 'err', text: d.message })
        return
      }
      const rows = await listMerchantBindings(supabase, 'xhs_commercial')
      setCloudBindings(rows)
      const next = pickActiveXhsCommercialBinding(rows)
      applyActiveXhsCommercialBinding(next)
      writeXhsCommercialBinding(next ? xhsCommercialRowToBindState(next) : null)
    } else if (readActiveBindingId('xhs_commercial') === id) {
      writeXhsCommercialBinding(null)
    }
    setMsg({ tone: 'ok', text: '已移除账号' })
  }

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <PlatformBrandLogo logo="xhs_juguang" alt="小红书聚光 · 种小草" size="md" />
            <div>
              <h3 className="font-semibold text-slate-900">小红书聚光 · 种小草</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                用于「投流」「线索」中的聚光/种小草数据；与抖音来客经营账号相互独立。
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
              emptyHint="尚未绑定聚光/种小草账号"
              onSelectActive={selectBinding}
              onRemove={(id) => void removeBinding(id)}
              onAddClick={openAddForm}
            />
          </div>
        ) : null}

        {formOpen || (!active && !supabaseConfigured) ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-600">应用编号（选填）</label>
              <input
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="便于区分多应用，可不填"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">账户备注名</label>
              <input
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="例如：杭州西湖店"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-slate-600">授权密钥（必填）</label>
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="在小红书商业平台授权后获取"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-slate-600">广告主编号（必填）</label>
              <input
                value={advertiserId}
                onChange={(e) => setAdvertiserId(e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums"
                placeholder="聚光/种小草后台中的数字广告主 ID"
              />
            </div>
          </div>
        ) : active && supabaseConfigured ? (
          <p className="text-sm text-slate-600">
            当前使用：<strong>{active.accountName}</strong>
            <span className="ml-2 text-xs text-slate-500 tabular-nums">编号 {active.advertiserId}</span>
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
                disabled={busy}
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
              添加聚光/种小草账号
            </button>
          ) : null}
        </div>
      </div>

      <BindGuideModal
        open={guideOpen}
        title="小红书聚光 · 种小草绑定说明书"
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
        <PlatformBindGuide config={XHS_COMMERCIAL_BIND_GUIDE} compact />
      </BindGuideModal>
    </>
  )
}
