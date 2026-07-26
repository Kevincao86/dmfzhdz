import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { fetchMerchants, readSession } from '../lib/api'

export default function MerchantsPage() {
  const session = readSession()
  const [rows, setRows] = useState<
    Array<{
      id: string
      name: string
      openStatus: string
      attributionCity: string | null
      serviceExpireAt: string | null
      createdAt: string
    }>
  >([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    void fetchMerchants().then((r) => {
      if (!r.ok) {
        setErr(r.error)
        return
      }
      setRows(r.data.merchants)
    })
  }, [])

  if (!session?.permissions.includes('merchants')) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">名下商家</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">由平台运营台归因绑定到本区域服务商的商家账号</p>
      </div>
      {err ? <p className="text-sm text-rose-400">{err}</p> : null}
      <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-[11px] uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">商家</th>
              <th className="px-4 py-3">城市</th>
              <th className="px-4 py-3">开通状态</th>
              <th className="px-4 py-3">服务到期</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-[var(--muted)]">
                  暂无绑定商家
                </td>
              </tr>
            ) : (
              rows.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3 text-white">{m.name}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{m.attributionCity || '—'}</td>
                  <td className="px-4 py-3 text-[var(--good)]">{m.openStatus}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {m.serviceExpireAt
                      ? new Date(m.serviceExpireAt).toLocaleDateString('zh-CN')
                      : '—'}
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
