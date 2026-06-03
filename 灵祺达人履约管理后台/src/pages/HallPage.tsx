import { useEffect, useState } from 'react'
import { fetchHallRegistry } from '../lib/mpApi'
import { getActiveRole } from '../lib/mpSession'

type Order = {
  id?: string
  mpOrderId?: string
  title?: string
  hall?: string
  fulfillmentLoop?: string
}

export default function HallPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const role = getActiveRole()

  useEffect(() => {
    ;(async () => {
      try {
        const reg = await fetchHallRegistry()
        const list = (reg.mpRecruitmentOrders || []) as Order[]
        setOrders(
          list.filter((o) => {
            const hall = String(o.hall || '')
            if (role === 'pr') return true
            return hall.includes('大厅') || hall.includes('急单') || hall.includes('云剪')
          }),
        )
      } catch (e) {
        setErr(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [role])

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">招募大厅</h2>
      <p className="text-sm text-slate-400 mb-4">数据与小程序 `ops_registry_snapshot` 实时同步</p>
      {loading ? <p className="text-slate-400">加载中…</p> : null}
      {err ? <p className="text-red-400">{err}</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {orders.map((o) => (
          <article key={o.id || o.mpOrderId} className="rounded-xl border border-white/10 bg-[#1a1a28] p-4">
            <div className="text-xs text-violet-400">{o.hall || '招募单'}</div>
            <h3 className="font-semibold mt-1">{o.title || o.mpOrderId}</h3>
            <p className="text-xs text-slate-500 mt-2">{o.fulfillmentLoop === 'closed' ? '云剪闭环' : '开环探店'}</p>
          </article>
        ))}
      </div>
      {!loading && !orders.length ? <p className="text-slate-500">暂无开放商单</p> : null}
    </div>
  )
}
