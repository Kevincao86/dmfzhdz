import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import ModulePage from '../ModulePage'
import {
  fetchPartnerAgentSettlement,
  type PartnerAgentSettlementRow,
} from '../../services/partnerAgentsClient'
import { toUserFacingError } from '../../lib/userFacingError'

/** 总代：子代理内部分账看板 */
export default function PartnerAgentSettlementPage() {
  const [rows, setRows] = useState<PartnerAgentSettlementRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      setLoading(true)
      setErr(null)
      try {
        setRows(await fetchPartnerAgentSettlement())
      } catch (e) {
        setErr(toUserFacingError(e, '加载代理结算'))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const totals = rows.reduce(
    (acc, r) => ({
      clients: acc.clients + r.clientCount,
      used: acc.used + r.totalPointsUsed,
      remain: acc.remain + r.totalPointsRemain,
    }),
    { clients: 0, used: 0, remain: 0 },
  )

  return (
    <ModulePage
      title="代理结算"
      subtitle="总代视角：各子代负责客户与积分消耗汇总，用于线下与子代结算（非平台原始账单）"
    >
      {err ? (
        <p className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[
          { label: '子代理数', value: String(rows.length) },
          { label: '负责客户合计', value: String(totals.clients) },
          { label: '子代积分已消耗', value: totals.used.toLocaleString('zh-CN') },
        ].map((c) => (
          <div key={c.label} className="erp-panel p-4">
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="erp-panel overflow-x-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            加载中…
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            暂无子代理数据。请先在「系统 → 代理管理」创建子代并分配权益。
          </p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="py-2 pr-4 font-medium">子代理</th>
                <th className="py-2 pr-4 font-medium">负责人</th>
                <th className="py-2 pr-4 font-medium">客户数</th>
                <th className="py-2 pr-4 font-medium">套餐额度/已用</th>
                <th className="py-2 pr-4 font-medium">充值额度/已用</th>
                <th className="py-2 font-medium">剩余积分</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.agentTenantId} className="border-b border-slate-100">
                  <td className="py-2.5 pr-4 font-medium text-slate-900">{r.agentName}</td>
                  <td className="py-2.5 pr-4 text-slate-600">{r.contactPhone ?? '—'}</td>
                  <td className="py-2.5 pr-4 tabular-nums">{r.clientCount}</td>
                  <td className="py-2.5 pr-4 tabular-nums text-slate-600">
                    {r.packagePointsQuota} / {r.packagePointsUsed}
                  </td>
                  <td className="py-2.5 pr-4 tabular-nums text-slate-600">
                    {r.rechargePointsQuota} / {r.rechargePointsUsed}
                  </td>
                  <td className="py-2.5 tabular-nums font-medium text-emerald-700">
                    {r.totalPointsRemain.toLocaleString('zh-CN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </ModulePage>
  )
}
