import { useEffect, useState } from 'react'
import { xingxuanEnhanceApi } from '../lib/mpSync/xingxuanEnhanceApi'

export default function XingxuanFunnelPage() {
  const [summary, setSummary] = useState<Array<{ stage: string; count: number }>>([])
  const [orders, setOrders] = useState<
    Array<{ mpOrderId: string; title?: string; applied: number; approved: number; videoSubmitted: number }>
  >([])
  const [err, setErr] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const res = (await xingxuanEnhanceApi.getRecruitmentFunnel()) as {
          overview?: {
            totalViews?: number
            totalApplies?: number
            totalSelected?: number
            totalPublished?: number
            funnels?: Array<{
              mpOrderId: string
              title?: string
              applyCount: number
              selectedCount: number
              videoSubmittedCount: number
            }>
          }
        }
        const ov = res.overview || {}
        setSummary([
          { stage: '曝光', count: ov.totalViews || 0 },
          { stage: '报名', count: ov.totalApplies || 0 },
          { stage: '入选', count: ov.totalSelected || 0 },
          { stage: '已发布', count: ov.totalPublished || 0 },
        ])
        setOrders(
          (ov.funnels || []).map((f) => ({
            mpOrderId: f.mpOrderId,
            title: f.title,
            applied: f.applyCount,
            approved: f.selectedCount,
            videoSubmitted: f.videoSubmittedCount,
          })),
        )
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [])

  return (
    <div className="page-content-shell page-content-shell--narrow space-y-4">
      <header>
        <h1 className="text-xl font-bold">招募漏斗</h1>
        <p className="text-sm text-[var(--shell-muted)] mt-1">曝光→报名→入选→发布全链路转化</p>
      </header>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      <div className="surface-card rounded-xl border p-4 space-y-2">
        {summary.map((s) => (
          <div key={s.stage} className="flex justify-between text-sm py-2 border-b last:border-0">
            <span>{s.stage}</span>
            <span className="font-semibold text-sky-600">{s.count}</span>
          </div>
        ))}
      </div>
      {orders.map((o) => (
        <div key={o.mpOrderId} className="surface-card rounded-xl border p-4">
          <p className="font-medium text-sm">{o.title || o.mpOrderId}</p>
          <p className="text-xs text-[var(--shell-muted)] mt-1">
            报名 {o.applied} · 通过 {o.approved} · 成片 {o.videoSubmitted}
          </p>
        </div>
      ))}
    </div>
  )
}
