import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { fetchDashboard, readSession, yuan } from '../lib/api'

export default function HomePage() {
  const session = readSession()
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchDashboard>> | null>(null)

  useEffect(() => {
    void fetchDashboard().then(setData)
  }, [])

  if (!session?.permissions.includes('dashboard')) {
    return <Navigate to="/settings" replace />
  }

  const d = data?.ok ? data.data.dashboard : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">城市业绩看板</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          城市范围：
          {(d?.cities ?? session.cities).map((c) => c.city).join('、') || '未配置'}
        </p>
      </div>

      {data && !data.ok ? (
        <p className="text-sm text-rose-400">{data.error}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: '名下商家', value: d ? String(d.merchantCount) : '—' },
          { label: '开通中', value: d ? String(d.activeMerchantCount) : '—' },
          { label: '确认订阅实收', value: d ? yuan(d.grossCents) : '—' },
          { label: '代理应得', value: d ? yuan(d.partnerShareCents) : '—' },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5"
          >
            <p className="text-xs text-[var(--muted)]">{card.label}</p>
            <p className="mt-2 font-[DM_Sans] text-2xl font-bold text-white">{card.value}</p>
          </div>
        ))}
      </div>

      {d ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 text-sm text-[var(--muted)]">
          分成口径：代理 {(d.partnerShareRate * 100).toFixed(1)}% · 平台{' '}
          {(d.platformShareRate * 100).toFixed(1)}% · 已确认订阅订单 {d.confirmedOrderCount} 笔 ·
          平台留存 {yuan(d.platformShareCents)}
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">加载中…</p>
      )}
    </div>
  )
}
