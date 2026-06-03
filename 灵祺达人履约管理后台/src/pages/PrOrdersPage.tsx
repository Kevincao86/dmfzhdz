import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchMpRegistry, patchMpRecruitmentOrder } from '../lib/mpApi'
import { getAccount } from '../lib/mpSession'
import * as listFilters from '../lib/mpRecruitment/listFilters'
import { readPublishedOrders } from '../lib/mpRecruitment/publishedOrders'

type PrOrderRow = ReturnType<typeof listFilters.enrichMpOrderListItem> & {
  mpOrderId: string
  hallLabel: string
}

export default function PrOrdersPage() {
  const acc = getAccount()
  const [rows, setRows] = useState<PrOrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [togglingId, setTogglingId] = useState('')

  async function load() {
    const local = readPublishedOrders()
    if (!local.length) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    setErr('')
    try {
      const reg = await fetchMpRegistry()
      const mpList = (Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []) as Record<string, unknown>[]
      setRows(
        local.map((item) => {
          const mp = mpList.find((o) => o && o.id === item.mpOrderId)
          const enriched = listFilters.enrichMpOrderListItem(mp || null, item)
          return { ...enriched, mpOrderId: item.mpOrderId, hallLabel: enriched.hallLabel as string }
        }),
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败')
      setRows(
        local.map((item) => {
          const enriched = listFilters.enrichMpOrderListItem(null, item)
          return { ...enriched, mpOrderId: item.mpOrderId, hallLabel: '招募大厅' }
        }),
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function onToggle(row: PrOrderRow) {
    if (!row.canToggleRecruit || togglingId) return
    const next = row.toggleNextStatus as string
    if (!confirm(next === 'closed' ? '停止后达人将无法继续报名，已报名数据保留。' : '开始后将在招募大厅重新展示。')) return
    setTogglingId(row.mpOrderId)
    try {
      await patchMpRecruitmentOrder({ mpOrderId: row.mpOrderId, status: next })
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败')
    } finally {
      setTogglingId('')
    }
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">我的发单</h2>
      <p className="text-sm text-slate-400 mb-4">
        PR ID：<span className="text-amber-400 font-mono">{acc?.lingqiPrId || '—'}</span> · 与小程序「我的发单」同源
      </p>
      {loading ? <p className="text-slate-400">加载中…</p> : null}
      {err ? <p className="text-amber-500 text-sm mb-2">{err}</p> : null}
      {!loading && !rows.length ? (
        <p className="text-slate-500">暂无发单记录（小程序发招募后会同步到本机 meoo_my_published_orders_v1）</p>
      ) : null}
      <div className="space-y-3">
        {rows.map((row) => (
          <article key={row.mpOrderId} className="rounded-xl border border-white/10 bg-[#1a1a28] p-4">
            <div className="flex justify-between gap-2 items-start">
              <div>
                <span className="text-xs text-violet-400">{row.hallLabel}</span>
                <h3 className="font-semibold mt-1">{row.title}</h3>
                <p className="text-xs text-slate-500 mt-2">{row.signupLabel} · {row.deadlineDaysText}</p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-white/10">{row.statusLabel}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to={`/publish?edit=${encodeURIComponent(row.mpOrderId)}`}
                className="text-sm px-3 py-1.5 rounded-lg border border-violet-500/40 text-violet-300 hover:bg-violet-600/10"
              >
                编辑招募
              </Link>
              {row.canToggleRecruit ? (
                <button
                  type="button"
                  disabled={togglingId === row.mpOrderId}
                  className="text-sm px-3 py-1.5 rounded-lg border border-white/20 hover:bg-white/5"
                  onClick={() => void onToggle(row)}
                >
                  {row.toggleActionLabel}招募
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
