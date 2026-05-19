import { ExternalLink, Megaphone } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import MerchantPlatformAccountsPanel from '../../components/settings/MerchantPlatformAccountsPanel'
import { cn } from '../../cn'
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
import { testLocalPromotionBind } from '../../services/localPromotionApi'

const DOC_URL = 'https://open.oceanengine.com/labels/34'
const MAX_ACCOUNTS = 5

export default function LocalPromotionSection() {
  const active = readLocalPromotionBinding()
  const [cloudBindings, setCloudBindings] = useState<MerchantPlatformBindingRow[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [appId, setAppId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [localAccountId, setLocalAccountId] = useState('')
  const [accountName, setAccountName] = useState('')
  const [busy, setBusy] = useState(false)
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
        subLabel: b.clientKey ? `App ${b.clientKey}` : undefined,
        isActive: b.id === activeBindingId,
        demoMode: b.demoMode,
      })),
    [cloudBindings, activeBindingId],
  )

  const resetForm = () => {
    setAppId('')
    setAccessToken('')
    setLocalAccountId('')
    setAccountName('')
  }

  const openAddForm = () => {
    setMsg(null)
    resetForm()
    setFormOpen(true)
  }

  const save = async () => {
    setMsg(null)
    if (!accessToken.trim() || !localAccountId.trim()) {
      setMsg({ tone: 'err', text: '请填写 Access Token 与本地推广告主 ID' })
      return
    }
    if (supabaseConfigured && cloudBindings.length >= MAX_ACCOUNTS) {
      const exists = cloudBindings.some((b) => b.merchantAccountId === localAccountId.trim())
      if (!exists) {
        setMsg({ tone: 'err', text: `最多绑定 ${MAX_ACCOUNTS} 个本地推账号` })
        return
      }
    }
    setBusy(true)
    try {
      const r = await testLocalPromotionBind({
        appId: appId.trim(),
        accessToken: accessToken.trim(),
        localAccountId: localAccountId.trim(),
      })
      if (!r.ok) {
        setMsg({ tone: 'err', text: r.message })
        return
      }

      const label = accountName.trim() || `本地推 ${localAccountId.trim()}`
      let bindingId: string | undefined

      if (supabaseConfigured && supabase) {
        const ur = await upsertMerchantBinding(supabase, {
          provider: 'local_promotion',
          merchantAccountId: localAccountId.trim(),
          sealedCredentials: packLocalPromotionForCloud({
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

      writeLocalPromotionBinding({
        bindingId,
        appId: appId.trim(),
        accessToken: accessToken.trim(),
        localAccountId: localAccountId.trim(),
        accountName: label,
        boundAt: new Date().toISOString(),
        demoMode: r.demoMode,
      })

      setFormOpen(false)
      resetForm()
      setMsg({
        tone: 'ok',
        text: r.demoMode
          ? `${r.message} · 投流/线索页将展示演示数据，配置有效 Token 后可拉取真实数据。`
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

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
            <Megaphone className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-semibold text-slate-900">巨量本地推</h3>
            <p className="text-xs text-slate-500">
              对接{' '}
              <a
                href={DOC_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-cyan-600 hover:underline"
              >
                商业开放平台 · 本地推 Open API
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              与抖音来客账号相互独立，可使用不同登录主体；最多绑定 {MAX_ACCOUNTS} 个广告主，「当前使用」决定投流与线索数据范围。
            </p>
          </div>
        </div>
        {active ? (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-medium',
              active.demoMode ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800',
            )}
          >
            {active.demoMode ? '演示模式' : '已连接'}
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">未连接</span>
        )}
      </div>

      {supabaseConfigured ? (
        <div className="mb-5">
          <MerchantPlatformAccountsPanel
            accounts={accountItems}
            maxAccounts={MAX_ACCOUNTS}
            emptyHint="尚未绑定本地推账号"
            onSelectActive={selectBinding}
            onRemove={(id) => void removeBinding(id)}
            onAddClick={openAddForm}
          />
        </div>
      ) : null}

      {formOpen || (!active && !supabaseConfigured) ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-500">应用 App ID（选填，备案用）</label>
            <input
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="开放平台应用 ID"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">账户备注名</label>
            <input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="例如：杭州西湖店"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-slate-500">Access Token（必填）</label>
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
              placeholder="OAuth 授权后获取"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-slate-500">
              本地推广告主 ID local_account_id（必填）
            </label>
            <input
              value={localAccountId}
              onChange={(e) => setLocalAccountId(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
              placeholder="广告主数字 ID"
            />
          </div>
        </div>
      ) : active && supabaseConfigured ? (
        <p className="text-sm text-slate-600">
          当前使用：<strong>{active.accountName}</strong>
          <span className="ml-2 font-mono text-xs text-slate-500">{active.localAccountId}</span>
        </p>
      ) : null}

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        在开放平台创建应用并申请「本地推」相关权限后，使用授权码换取 Access Token。ERP
        将调用项目/广告/报表/线索等接口；已登录商户账号时凭证同步至云端，换设备可恢复。
      </p>

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
            添加本地推账号
          </button>
        ) : null}
      </div>
    </div>
  )
}
