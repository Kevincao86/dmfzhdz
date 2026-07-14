import { Loader2, Percent, RefreshCw, Save } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '../../cn'
import {
  effectiveAffiliateRates,
  effectivePartnerRates,
  mergeDistributionPolicy,
  type DistributionCommissionOverride,
  type DistributionProductLineRates,
  type RegistryDistributionSalesperson,
} from '../../meooRegistryShared/distributionRegistryTypes'
import { useOpsModuleEdit } from '../useOpsModuleEdit'
import {
  batchPatchAffiliateCommission,
  batchPatchPartnerCommission,
  batchPatchSalespersonCommission,
  createSettlementBatch,
  loadDistributionSnapshot,
  patchAffiliateCommission,
  patchAffiliateStatus,
  patchPartnerCommission,
  patchSalespersonCommission,
  pct,
  saveDistributionPolicy,
  settlementBatchAction,
  withdrawAction,
  yuanFromCents,
  type RegistryDistributionAffiliate,
  type RegistryDistributionPartnerChannel,
  type RegistryDistributionPolicy,
} from '../opsDistributionApi'

const AFFILIATE_STATUS_LABEL: Record<string, string> = {
  pending: '待审核',
  active: '已通过',
  rejected: '未通过',
  disabled: '已停用',
}

function affiliateStatusLabel(status: string): string {
  return AFFILIATE_STATUS_LABEL[status] ?? status
}

type TabId = 'policy' | 'affiliates' | 'partners' | 'withdraw' | 'settlement'

const TABS: { id: TabId; label: string }[] = [
  { id: 'policy', label: '全局策略' },
  { id: 'affiliates', label: '个人分销员' },
  { id: 'partners', label: '服务商/分销员' },
  { id: 'withdraw', label: '提现审核 P1' },
  { id: 'settlement', label: '结算批次 P2' },
]

function rateInput(
  label: string,
  value: number | undefined,
  onChange: (v: number | undefined) => void,
  disabled: boolean,
) {
  return (
    <label className="block text-xs text-slate-400">
      {label}
      <input
        type="number"
        min={0}
        max={100}
        step={0.1}
        disabled={disabled}
        className="mt-1 w-full rounded-lg border border-[var(--ops-border)] bg-slate-900 px-2 py-1.5 text-sm text-white"
        value={value != null ? Math.round(value * 1000) / 10 : ''}
        onChange={(e) => {
          const n = Number(e.target.value)
          onChange(Number.isFinite(n) ? Math.min(100, Math.max(0, n)) / 100 : undefined)
        }}
        placeholder="默认"
      />
    </label>
  )
}

function CommissionOverrideModal({
  title,
  open,
  onClose,
  initial,
  mode,
  onSave,
}: {
  title: string
  open: boolean
  onClose: () => void
  initial: DistributionCommissionOverride | null
  mode: 'affiliate' | 'partner'
  onSave: (v: DistributionCommissionOverride | null) => Promise<void>
}) {
  const [erp, setErp] = useState<DistributionProductLineRates>({})
  const [xingxuan, setXingxuan] = useState<DistributionProductLineRates>({})
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setErp({ ...(initial?.erp ?? {}) })
    setXingxuan({ ...(initial?.xingxuan ?? {}) })
    setNote(initial?.note ?? '')
  }, [open, initial])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--ops-border)] bg-[var(--ops-panel)] p-5">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="mt-1 text-xs text-slate-400">留空字段沿用全局默认；保存后覆盖生效。</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium text-indigo-300">ERP（cs）</p>
            <div className="space-y-2">
              {rateInput('分润池占实收', erp.partnerPoolRate, (v) => setErp((p: DistributionProductLineRates) => ({ ...p, partnerPoolRate: v })), false)}
              {mode === 'partner' ? (
                <>
                  {rateInput('服务商占池', erp.partnerShareOfPool, (v) => setErp((p: DistributionProductLineRates) => ({ ...p, partnerShareOfPool: v })), false)}
                  {rateInput('分销员占池', erp.salespersonShareOfPool, (v) => setErp((p: DistributionProductLineRates) => ({ ...p, salespersonShareOfPool: v })), false)}
                </>
              ) : (
                rateInput('个人整池', erp.individualPoolRate, (v) => setErp((p: DistributionProductLineRates) => ({ ...p, individualPoolRate: v })), false)
              )}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-sky-300">星选（dr/mp）</p>
            <div className="space-y-2">
              {rateInput('分润池占实收', xingxuan.partnerPoolRate, (v) => setXingxuan((p: DistributionProductLineRates) => ({ ...p, partnerPoolRate: v })), false)}
              {mode === 'partner' ? (
                <>
                  {rateInput('服务商占池', xingxuan.partnerShareOfPool, (v) => setXingxuan((p: DistributionProductLineRates) => ({ ...p, partnerShareOfPool: v })), false)}
                  {rateInput('分销员占池', xingxuan.salespersonShareOfPool, (v) => setXingxuan((p: DistributionProductLineRates) => ({ ...p, salespersonShareOfPool: v })), false)}
                </>
              ) : (
                rateInput('个人整池', xingxuan.individualPoolRate, (v) => setXingxuan((p: DistributionProductLineRates) => ({ ...p, individualPoolRate: v })), false)
              )}
            </div>
          </div>
        </div>
        <label className="mt-4 block text-xs text-slate-400">
          备注
          <input
            className="mt-1 w-full rounded-lg border border-[var(--ops-border)] bg-slate-900 px-2 py-1.5 text-sm text-white"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
            disabled={saving}
            onClick={() => {
              void (async () => {
                setSaving(true)
                try {
                  await onSave({ erp, xingxuan, note: note.trim() || undefined })
                  onClose()
                } finally {
                  setSaving(false)
                }
              })()
            }}
          >
            {saving ? '保存中…' : '保存覆盖'}
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300"
            onClick={() => {
              void (async () => {
                setSaving(true)
                try {
                  await onSave(null)
                  onClose()
                } finally {
                  setSaving(false)
                }
              })()
            }}
          >
            恢复默认
          </button>
          <button type="button" className="rounded-lg px-4 py-2 text-sm text-slate-400" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OpsDistributionPage() {
  const { canEdit } = useOpsModuleEdit('distribution')
  const [tab, setTab] = useState<TabId>('policy')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [policy, setPolicy] = useState<RegistryDistributionPolicy>(mergeDistributionPolicy(null))
  const [affiliates, setAffiliates] = useState<RegistryDistributionAffiliate[]>([])
  const [partners, setPartners] = useState<RegistryDistributionPartnerChannel[]>([])
  const [withdrawRequests, setWithdrawRequests] = useState<
    Awaited<ReturnType<typeof loadDistributionSnapshot>>['withdrawRequests']
  >([])
  const [settlementBatches, setSettlementBatches] = useState<
    Awaited<ReturnType<typeof loadDistributionSnapshot>>['settlementBatches']
  >([])

  const [selectedAffiliateIds, setSelectedAffiliateIds] = useState<string[]>([])
  const [selectedPartnerIds, setSelectedPartnerIds] = useState<string[]>([])
  const [selectedSalesIds, setSelectedSalesIds] = useState<string[]>([])
  const [activePartnerId, setActivePartnerId] = useState<string>('')

  const [modal, setModal] = useState<{
    kind: 'affiliate' | 'partner' | 'salesperson' | 'batch_affiliate' | 'batch_partner' | 'batch_sales'
    title: string
    mode: 'affiliate' | 'partner'
    initial: DistributionCommissionOverride | null
    affiliateId?: string
    partnerTenantId?: string
    salespersonId?: string
  } | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const data = await loadDistributionSnapshot()
      setPolicy(mergeDistributionPolicy(data.policy))
      setAffiliates(data.affiliates)
      setPartners(data.partners)
      setWithdrawRequests(data.withdrawRequests)
      setSettlementBatches(data.settlementBatches)
      if (!activePartnerId && data.partners[0]) setActivePartnerId(data.partners[0].partnerTenantId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [activePartnerId])

  useEffect(() => {
    void reload()
  }, [reload])

  const activePartner = useMemo(
    () => partners.find((p) => p.partnerTenantId === activePartnerId),
    [partners, activePartnerId],
  )

  const handleSavePolicy = async () => {
    const r = await saveDistributionPolicy(policy)
    if (!r.ok) setErr(r.error ?? '保存失败')
    else void reload()
  }

  const handleModalSave = async (override: DistributionCommissionOverride | null) => {
    if (!modal) return
    if (modal.kind === 'affiliate' && modal.affiliateId) {
      const r = await patchAffiliateCommission(modal.affiliateId, override)
      if (!r.ok) throw new Error(r.error)
    } else if (modal.kind === 'batch_affiliate') {
      const r = await batchPatchAffiliateCommission(selectedAffiliateIds, override)
      if (!r.ok) throw new Error(r.error)
      setSelectedAffiliateIds([])
    } else if (modal.kind === 'partner' && modal.partnerTenantId) {
      const r = await patchPartnerCommission(modal.partnerTenantId, { commissionOverride: override })
      if (!r.ok) throw new Error(r.error)
    } else if (modal.kind === 'batch_partner') {
      const r = await batchPatchPartnerCommission(selectedPartnerIds, override)
      if (!r.ok) throw new Error(r.error)
      setSelectedPartnerIds([])
    } else if (modal.kind === 'salesperson' && modal.partnerTenantId && modal.salespersonId) {
      const r = await patchSalespersonCommission(modal.partnerTenantId, modal.salespersonId, override)
      if (!r.ok) throw new Error(r.error)
    } else if (modal.kind === 'batch_sales' && activePartnerId) {
      const r = await batchPatchSalespersonCommission(activePartnerId, selectedSalesIds, override)
      if (!r.ok) throw new Error(r.error)
      setSelectedSalesIds([])
    }
    await reload()
  }

  return (
    <div className="ops-page space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Percent className="h-7 w-7 text-indigo-400" />
            渠道分销
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            P1 提现审核 · P2 结算批次 · 单个/批量调整个人分销员与服务商（代理商）佣金比例。数据写入注册表扩展字段。
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--ops-border)] px-3 py-2 text-sm text-slate-300"
          onClick={() => void reload()}
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          刷新
        </button>
      </div>

      {err ? (
        <p className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">{err}</p>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-[var(--ops-border)] pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm',
              tab === t.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white',
            )}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          加载中…
        </div>
      ) : null}

      {!loading && tab === 'policy' ? (
        <div className="rounded-xl border border-[var(--ops-border)] bg-[var(--ops-panel)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">全局默认佣金</h2>
            {canEdit ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white"
                onClick={() => void handleSavePolicy()}
              >
                <Save className="h-4 w-4" />
                保存策略
              </button>
            ) : null}
          </div>
          <label className="mb-4 flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={policy.enabled}
              disabled={!canEdit}
              onChange={(e) => setPolicy((p) => ({ ...p, enabled: e.target.checked }))}
            />
            启用渠道分销
          </label>
          <div className="grid gap-6 lg:grid-cols-2">
            {(['erp', 'xingxuan'] as const).map((line) => (
              <div key={line} className="rounded-lg border border-slate-800 p-4">
                <p className="mb-3 font-medium text-white">{line === 'erp' ? 'ERP · cs' : '星选 · dr/mp'}</p>
                <div className="grid grid-cols-2 gap-3">
                  {rateInput('分润池', policy[line].partnerPoolRate, (v) => setPolicy((p) => ({ ...p, [line]: { ...p[line], partnerPoolRate: v } })), !canEdit)}
                  {rateInput('服务商占池', policy[line].partnerShareOfPool, (v) => setPolicy((p) => ({ ...p, [line]: { ...p[line], partnerShareOfPool: v } })), !canEdit)}
                  {rateInput('分销员占池', policy[line].salespersonShareOfPool, (v) => setPolicy((p) => ({ ...p, [line]: { ...p[line], salespersonShareOfPool: v } })), !canEdit)}
                  {rateInput('个人整池', policy[line].individualPoolRate, (v) => setPolicy((p) => ({ ...p, [line]: { ...p[line], individualPoolRate: v } })), !canEdit)}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            默认：ERP 池 40%（服务商 16% + 分销员 24%）· 个人 30%；星选池 35% · 个人 25%。
          </p>
        </div>
      ) : null}

      {!loading && tab === 'affiliates' ? (
        <div className="space-y-3">
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!selectedAffiliateIds.length}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
                onClick={() =>
                  setModal({
                    kind: 'batch_affiliate',
                    title: `批量调整 ${selectedAffiliateIds.length} 名个人分销员`,
                    mode: 'affiliate',
                    initial: null,
                  })
                }
              >
                批量调整佣金（已选 {selectedAffiliateIds.length}）
              </button>
            </div>
          ) : null}
          <div className="overflow-x-auto rounded-xl border border-[var(--ops-border)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-900/80 text-xs text-slate-400">
                <tr>
                  {canEdit ? <th className="p-2">选</th> : null}
                  <th className="p-2">姓名</th>
                  <th className="p-2">手机</th>
                  <th className="p-2">推广码</th>
                  <th className="p-2">ERP 个人池</th>
                  <th className="p-2">星选个人池</th>
                  <th className="p-2">状态</th>
                  {canEdit ? <th className="p-2">操作</th> : null}
                </tr>
              </thead>
              <tbody>
                {affiliates.map((a) => {
                  const rates = effectiveAffiliateRates(policy, a.commissionOverride)
                  return (
                    <tr key={a.id} className="border-t border-slate-800">
                      {canEdit ? (
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={selectedAffiliateIds.includes(a.id)}
                            onChange={(e) =>
                              setSelectedAffiliateIds((ids) =>
                                e.target.checked ? [...ids, a.id] : ids.filter((x) => x !== a.id),
                              )
                            }
                          />
                        </td>
                      ) : null}
                      <td className="p-2 text-white">{a.realName}</td>
                      <td className="p-2 font-mono text-xs text-slate-400">{a.phone}</td>
                      <td className="p-2 font-mono text-xs text-slate-300">{a.refCode}</td>
                      <td className="p-2 tabular-nums">{pct(rates.erp.individualPoolRate)}</td>
                      <td className="p-2 tabular-nums">{pct(rates.xingxuan.individualPoolRate)}</td>
                      <td className="p-2 text-slate-400">
                        {affiliateStatusLabel(a.status)}
                        {a.applySource ? (
                          <span className="ml-1 text-xs text-slate-500">· {a.applySource}</span>
                        ) : null}
                      </td>
                      {canEdit ? (
                        <td className="p-2 space-x-2">
                          {a.status === 'pending' ? (
                            <>
                              <button
                                type="button"
                                className="text-emerald-400 hover:underline"
                                onClick={() => void patchAffiliateStatus(a.id, 'active').then(reload)}
                              >
                                通过
                              </button>
                              <button
                                type="button"
                                className="text-red-400 hover:underline"
                                onClick={() => void patchAffiliateStatus(a.id, 'rejected').then(reload)}
                              >
                                拒绝
                              </button>
                            </>
                          ) : null}
                          <button
                            type="button"
                            className="text-indigo-400 hover:underline"
                            onClick={() =>
                              setModal({
                                kind: 'affiliate',
                                title: `调整 · ${a.realName}`,
                                mode: 'affiliate',
                                initial: a.commissionOverride ?? null,
                                affiliateId: a.id,
                              })
                            }
                          >
                            佣金
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!affiliates.length ? <p className="p-6 text-center text-slate-500">暂无个人分销员；用户可在 cs/dr/小程序「申请成为推广员」提交。</p> : null}
          </div>
        </div>
      ) : null}

      {!loading && tab === 'partners' ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-[var(--ops-border)] p-3 lg:col-span-1">
            <p className="mb-2 text-sm font-medium text-white">服务商（代理商）</p>
            {canEdit ? (
              <button
                type="button"
                disabled={!selectedPartnerIds.length}
                className="mb-2 w-full rounded-lg bg-indigo-600 px-2 py-1.5 text-xs text-white disabled:opacity-40"
                onClick={() =>
                  setModal({
                    kind: 'batch_partner',
                    title: `批量调整 ${selectedPartnerIds.length} 家服务商`,
                    mode: 'partner',
                    initial: null,
                  })
                }
              >
                批量调整（{selectedPartnerIds.length}）
              </button>
            ) : null}
            <ul className="max-h-96 space-y-1 overflow-y-auto">
              {partners.map((p) => {
                const rates = effectivePartnerRates(policy, p.commissionOverride)
                return (
                  <li key={p.partnerTenantId}>
                    <div
                      className={cn(
                        'rounded-lg px-2 py-2',
                        activePartnerId === p.partnerTenantId ? 'bg-indigo-900/40' : 'hover:bg-slate-800/60',
                      )}
                    >
                      {canEdit ? (
                        <input
                          type="checkbox"
                          className="mr-2"
                          checked={selectedPartnerIds.includes(p.partnerTenantId)}
                          onChange={(e) =>
                            setSelectedPartnerIds((ids) =>
                              e.target.checked
                                ? [...ids, p.partnerTenantId]
                                : ids.filter((x) => x !== p.partnerTenantId),
                            )
                          }
                        />
                      ) : null}
                      <button
                        type="button"
                        className="text-left text-sm text-white"
                        onClick={() => setActivePartnerId(p.partnerTenantId)}
                      >
                        {p.partnerName}
                      </button>
                      <p className="mt-0.5 text-xs text-slate-500">
                        ERP 池 {pct(rates.erp.partnerPoolRate)} · 分销员 {pct(rates.erp.salespersonShareOfPool)} 占池
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
          <div className="rounded-xl border border-[var(--ops-border)] p-3 lg:col-span-2">
            {activePartner ? (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium text-white">{activePartner.partnerName}</h3>
                  {canEdit ? (
                    <button
                      type="button"
                      className="text-sm text-indigo-400"
                      onClick={() =>
                        setModal({
                          kind: 'partner',
                          title: `服务商佣金 · ${activePartner.partnerName}`,
                          mode: 'partner',
                          initial: activePartner.commissionOverride ?? null,
                          partnerTenantId: activePartner.partnerTenantId,
                        })
                      }
                    >
                      调整服务商默认佣金
                    </button>
                  ) : null}
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    disabled={!selectedSalesIds.length}
                    className="mb-2 rounded-lg border border-indigo-700 px-2 py-1 text-xs text-indigo-300 disabled:opacity-40"
                    onClick={() =>
                      setModal({
                        kind: 'batch_sales',
                        title: `批量调整分销员 ${selectedSalesIds.length} 人`,
                        mode: 'partner',
                        initial: null,
                      })
                    }
                  >
                    批量调整分销员（{selectedSalesIds.length}）
                  </button>
                ) : null}
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs text-slate-400">
                    <tr>
                      {canEdit ? <th className="p-2">选</th> : null}
                      <th className="p-2">分销员</th>
                      <th className="p-2">工号/码</th>
                      <th className="p-2">ERP 分销员占池</th>
                      {canEdit ? <th className="p-2" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {activePartner.salespersons.map((sp: RegistryDistributionSalesperson) => {
                      const rates = effectivePartnerRates(policy, sp.commissionOverride ?? activePartner.commissionOverride)
                      return (
                        <tr key={sp.id} className="border-t border-slate-800">
                          {canEdit ? (
                            <td className="p-2">
                              <input
                                type="checkbox"
                                checked={selectedSalesIds.includes(sp.id)}
                                onChange={(e) =>
                                  setSelectedSalesIds((ids) =>
                                    e.target.checked ? [...ids, sp.id] : ids.filter((x) => x !== sp.id),
                                  )
                                }
                              />
                            </td>
                          ) : null}
                          <td className="p-2 text-white">{sp.realName}</td>
                          <td className="p-2 font-mono text-xs">{sp.refCode}</td>
                          <td className="p-2">{pct(rates.erp.salespersonShareOfPool)}</td>
                          {canEdit ? (
                            <td className="p-2">
                              <button
                                type="button"
                                className="text-indigo-400 hover:underline"
                                onClick={() =>
                                  setModal({
                                    kind: 'salesperson',
                                    title: `分销员 · ${sp.realName}`,
                                    mode: 'partner',
                                    initial: sp.commissionOverride ?? null,
                                    partnerTenantId: activePartner.partnerTenantId,
                                    salespersonId: sp.id,
                                  })
                                }
                              >
                                佣金
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="py-8 text-center text-slate-500">请选择左侧服务商，或通过 fws 分销设置 / API 录入。</p>
            )}
          </div>
        </div>
      ) : null}

      {!loading && tab === 'withdraw' ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--ops-border)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-xs text-slate-400">
              <tr>
                <th className="p-2">申请人</th>
                <th className="p-2">金额</th>
                <th className="p-2">渠道</th>
                <th className="p-2">状态</th>
                <th className="p-2">时间</th>
                {canEdit ? <th className="p-2">操作</th> : null}
              </tr>
            </thead>
            <tbody>
              {withdrawRequests.map((w) => (
                <tr key={w.id} className="border-t border-slate-800">
                  <td className="p-2 text-white">{w.ownerLabel}</td>
                  <td className="p-2">¥{yuanFromCents(w.amountCents)}</td>
                  <td className="p-2 text-slate-400">{w.channel}</td>
                  <td className="p-2">{w.status}</td>
                  <td className="p-2 text-xs text-slate-500">{w.createdAt}</td>
                  {canEdit ? (
                    <td className="p-2 space-x-2">
                      {w.status === 'pending_review' ? (
                        <>
                          <button type="button" className="text-emerald-400" onClick={() => void withdrawAction(w.id, 'approve').then(reload)}>通过</button>
                          <button type="button" className="text-red-400" onClick={() => void withdrawAction(w.id, 'reject', { failReason: '运营拒绝' }).then(reload)}>拒绝</button>
                        </>
                      ) : null}
                      {w.status === 'approved' ? (
                        <button
                          type="button"
                          className="text-indigo-400"
                          onClick={() => {
                            const ref = window.prompt('银行/支付宝流水号')
                            if (ref) void withdrawAction(w.id, 'mark_paid', { externalBillNo: ref }).then(reload)
                          }}
                        >
                          标记已付
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {!withdrawRequests.length ? <p className="p-6 text-center text-slate-500">暂无提现申请（P1：C 端申请提现后出现在此）。</p> : null}
        </div>
      ) : null}

      {!loading && tab === 'settlement' ? (
        <div className="space-y-4">
          {canEdit ? (
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white"
              onClick={() => {
                const payeeLabel = window.prompt('收款方名称')?.trim()
                const payeeId = window.prompt('收款方 ID（tenantId / affiliateId）')?.trim()
                const totalYuan = window.prompt('结算金额（元）')
                if (!payeeLabel || !payeeId || !totalYuan) return
                const cents = Math.round(Number(totalYuan) * 100)
                if (!Number.isFinite(cents)) return
                const now = new Date()
                const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
                const end = now.toISOString().slice(0, 10)
                void createSettlementBatch({
                  payeeType: 'partner_tenant',
                  payeeId,
                  payeeLabel,
                  periodStart: start,
                  periodEnd: end,
                  totalCents: cents,
                }).then(reload)
              }}
            >
              新建结算批次（P2）
            </button>
          ) : null}
          <div className="overflow-x-auto rounded-xl border border-[var(--ops-border)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-900/80 text-xs text-slate-400">
                <tr>
                  <th className="p-2">批次号</th>
                  <th className="p-2">收款方</th>
                  <th className="p-2">区间</th>
                  <th className="p-2">金额</th>
                  <th className="p-2">状态</th>
                  {canEdit ? <th className="p-2">操作</th> : null}
                </tr>
              </thead>
              <tbody>
                {settlementBatches.map((b) => (
                  <tr key={b.id} className="border-t border-slate-800">
                    <td className="p-2 font-mono text-xs">{b.id}</td>
                    <td className="p-2 text-white">{b.payeeLabel}</td>
                    <td className="p-2 text-xs text-slate-400">{b.periodStart} ~ {b.periodEnd}</td>
                    <td className="p-2">¥{yuanFromCents(b.totalCents)}</td>
                    <td className="p-2">{b.status}</td>
                    {canEdit ? (
                      <td className="p-2 space-x-2">
                        {b.status === 'draft' ? (
                          <button type="button" className="text-amber-400" onClick={() => void settlementBatchAction(b.id, 'confirm').then(reload)}>确认</button>
                        ) : null}
                        {b.status === 'confirmed' || b.status === 'draft' ? (
                          <button
                            type="button"
                            className="text-indigo-400"
                            onClick={() => {
                              const ref = window.prompt('对公流水号')
                              if (ref) void settlementBatchAction(b.id, 'mark_paid', { bankReference: ref }).then(reload)
                            }}
                          >
                            已付
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <CommissionOverrideModal
        open={!!modal}
        title={modal?.title ?? ''}
        mode={modal?.mode ?? 'affiliate'}
        initial={modal?.initial ?? null}
        onClose={() => setModal(null)}
        onSave={handleModalSave}
      />
    </div>
  )
}
