import { CalendarDays, Coins, Loader2, Save } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { usePartnerTenant } from '../../context/PartnerTenantContext'
import {
  fetchPartnerAgentEntitlements,
  savePartnerAgentEntitlement,
  type PartnerAgentEntitlement,
} from '../../services/partnerAgentsClient'
import { fetchTenantBillingSummary, type TenantBillingSummary } from '../../services/tenantBillingClient'
import { toUserFacingError } from '../../lib/userFacingError'

function EntitlementEditor({
  row,
  onSaved,
}: {
  row: PartnerAgentEntitlement
  onSaved: () => void
}) {
  const [seatLimit, setSeatLimit] = useState(String(row.seatLimit))
  const [pkgQuota, setPkgQuota] = useState(String(row.packagePointsQuota))
  const [recQuota, setRecQuota] = useState(String(row.rechargePointsQuota))
  const [note, setNote] = useState(row.note ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setErr(null)
    try {
      await savePartnerAgentEntitlement({
        agentTenantId: row.agentTenantId,
        seatLimit: Number(seatLimit) || 0,
        packagePointsQuota: Number(pkgQuota) || 0,
        rechargePointsQuota: Number(recQuota) || 0,
        note: note.trim() || null,
      })
      onSaved()
    } catch (e) {
      setErr(toUserFacingError(e, '保存权益'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold text-slate-900">{row.agentName}</h4>
        <span className="text-xs text-slate-500">
          已用 {row.packagePointsUsed + row.rechargePointsUsed} · 剩余 {row.totalRemain}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-slate-600">
          席位
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={seatLimit}
            onChange={(e) => setSeatLimit(e.target.value)}
          />
        </label>
        <label className="text-xs text-slate-600">
          套餐积分额度
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={pkgQuota}
            onChange={(e) => setPkgQuota(e.target.value)}
          />
        </label>
        <label className="text-xs text-slate-600">
          充值积分额度
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={recQuota}
            onChange={(e) => setRecQuota(e.target.value)}
          />
        </label>
      </div>
      <label className="mt-3 block text-xs text-slate-600">
        备注
        <input
          className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {err ? <p className="mt-2 text-xs text-red-600">{err}</p> : null}
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="mt-3 inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        <Save className="h-3.5 w-3.5" />
        {saving ? '保存中…' : '保存分配'}
      </button>
    </div>
  )
}

/** 总代向子代分配席位/积分；子代只读 */
export default function PartnerEntitlementSection() {
  const { profile } = usePartnerTenant()
  const [rows, setRows] = useState<PartnerAgentEntitlement[]>([])
  const [billing, setBilling] = useState<TenantBillingSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      setRows(await fetchPartnerAgentEntitlements())
      if (profile.isParent) {
        try {
          setBilling(await fetchTenantBillingSummary())
        } catch {
          setBilling(null)
        }
      }
    } catch (e) {
      setErr(toUserFacingError(e, '加载权益'))
    } finally {
      setLoading(false)
    }
  }, [profile.isParent])

  useEffect(() => {
    void load()
  }, [load])

  if (profile.isAgent) {
    const mine = rows[0]
    return (
      <div className="space-y-4">
        <div className="erp-panel space-y-3 p-6 text-sm text-slate-600">
          <p className="font-medium text-slate-900">权益由总代分配</p>
          {mine ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">套餐积分</p>
                <p className="text-lg font-bold tabular-nums text-slate-900">
                  {mine.packagePointsRemain.toLocaleString('zh-CN')}
                  <span className="text-xs font-normal text-slate-400">
                    {' '}
                    / {mine.packagePointsQuota.toLocaleString('zh-CN')}
                  </span>
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">充值积分</p>
                <p className="text-lg font-bold tabular-nums text-slate-900">
                  {mine.rechargePointsRemain.toLocaleString('zh-CN')}
                  <span className="text-xs font-normal text-slate-400">
                    {' '}
                    / {mine.rechargePointsQuota.toLocaleString('zh-CN')}
                  </span>
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">席位</p>
                <p className="text-lg font-bold text-slate-900">{mine.seatLimit}</p>
              </div>
            </div>
          ) : (
            <p>总代尚未为您分配额度，请联系总代在「权益分配」中设置。</p>
          )}
          <p className="text-xs text-slate-400">星选内嵌与 ERP AI 功能均从上述额度扣费。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-cyan-100 bg-cyan-50/50 px-4 py-3 text-sm text-cyan-950">
        总代买断订阅后，在此向各子代分配席位与积分额度。子代消耗将扣减已分配额度。
      </div>

      {err ? (
        <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p>
      ) : null}

      <section className="erp-panel p-6">
        <h3 className="mb-2 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Coins className="h-5 w-5 text-amber-600" />
          总代权益池
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
        </h3>
        {billing ? (
          <p className="text-sm text-slate-600">
            当前可用积分{' '}
            <strong className="tabular-nums text-slate-900">
              {billing.totalPoints.toLocaleString('zh-CN')}
            </strong>
            （套餐桶 {billing.packagePoints.toLocaleString('zh-CN')} + 充值桶{' '}
            {billing.rechargePoints.toLocaleString('zh-CN')}）
          </p>
        ) : (
          <p className="text-sm text-slate-500">加载积分余额中…</p>
        )}
      </section>

      <section className="erp-panel p-6">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <CalendarDays className="h-5 w-5 text-cyan-600" />
          子代权益分配
        </h3>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">请先在「代理管理」创建子代，再为其分配额度。</p>
        ) : (
          <div className="space-y-4">
            {rows.map((r) => (
              <EntitlementEditor key={r.id} row={r} onSaved={() => void load()} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
