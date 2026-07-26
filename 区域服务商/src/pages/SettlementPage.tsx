import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { fetchSettlement, readSession, yuan } from '../lib/api'

export default function SettlementPage() {
  const session = readSession()
  const [summary, setSummary] = useState<{
    grossCents: number
    partnerShareCents: number
    platformShareCents: number
    confirmedOrderCount: number
  } | null>(null)
  const [lines, setLines] = useState<
    Array<{
      orderId: string
      merchantName: string
      amountCents: number
      partnerShareCents: number
      platformShareCents: number
      confirmedAt: string | null
    }>
  >([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    void fetchSettlement().then((r) => {
      if (!r.ok) {
        setErr(r.error)
        return
      }
      setSummary(r.data.summary)
      setLines(r.data.lines)
    })
  }, [])

  if (!session?.permissions.includes('settlement')) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">结算明细</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          只读汇总：名下商家已确认订阅实收 × 分成比例（打款由平台线下完成）
        </p>
      </div>
      {err ? <p className="text-sm text-rose-400">{err}</p> : null}
      {summary ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <p className="text-xs text-[var(--muted)]">实收合计</p>
            <p className="mt-1 text-xl font-bold text-white">{yuan(summary.grossCents)}</p>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <p className="text-xs text-[var(--muted)]">代理应得</p>
            <p className="mt-1 text-xl font-bold text-[var(--good)]">
              {yuan(summary.partnerShareCents)}
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <p className="text-xs text-[var(--muted)]">订单笔数</p>
            <p className="mt-1 text-xl font-bold text-white">{summary.confirmedOrderCount}</p>
          </div>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-[11px] uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">商家</th>
              <th className="px-4 py-3">实收</th>
              <th className="px-4 py-3">代理分成</th>
              <th className="px-4 py-3">平台分成</th>
              <th className="px-4 py-3">确认时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {lines.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[var(--muted)]">
                  暂无结算明细
                </td>
              </tr>
            ) : (
              lines.map((l) => (
                <tr key={l.orderId}>
                  <td className="px-4 py-3 text-white">{l.merchantName}</td>
                  <td className="px-4 py-3">{yuan(l.amountCents)}</td>
                  <td className="px-4 py-3 text-[var(--good)]">{yuan(l.partnerShareCents)}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{yuan(l.platformShareCents)}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {l.confirmedAt ? new Date(l.confirmedAt).toLocaleString('zh-CN') : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
