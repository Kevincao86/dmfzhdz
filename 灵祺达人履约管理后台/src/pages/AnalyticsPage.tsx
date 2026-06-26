import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchMpRegistry } from '../lib/mpApi'
import { getWorkIdentity, WORK_EDITION_LABEL } from '../lib/mpWorkIdentity'
import { readApplications, readPublishedOrders } from '../lib/mpSync/applicationsStore'

type StatCell = { label: string; value: string }

export default function AnalyticsPage() {
  const workId = getWorkIdentity()
  const isPr = workId === 'pr'
  const [stats, setStats] = useState<StatCell[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const apps = readApplications()
      const published = readPublishedOrders().filter((o) => !o.deletedAt)
      let openOrders = 0
      try {
        const reg = await fetchMpRegistry()
        const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
        openOrders = mpList.filter((o) => {
          const s = String((o as { status?: string }).status || '')
          return s === 'open' || s === 'collecting'
        }).length
      } catch {
        /* ignore */
      }
      setStats(
        isPr
          ? [
              { label: '当前身份', value: WORK_EDITION_LABEL.pr },
              { label: '我的发单', value: String(published.length) },
              { label: '我的报名', value: String(apps.length) },
              { label: '大厅在招', value: String(openOrders) },
            ]
          : [
              { label: '当前身份', value: WORK_EDITION_LABEL[workId] || '达人' },
              { label: '我的报名', value: String(apps.length) },
              { label: '我的发单', value: String(published.length) },
              { label: '大厅在招', value: String(openOrders) },
            ],
      )
      setLoading(false)
    })()
  }, [isPr, workId])

  return (
    <div className="page-content-shell page-content-shell--narrow space-y-4">
      <header>
        <h1 className="text-xl font-bold">数据分析</h1>
        <p className="text-sm text-[var(--shell-muted)] mt-1">
          {isPr ? '发单与转化概况' : '报名与发单概况'} · 与小程序数据分析同源
        </p>
      </header>

      {loading ? <p className="text-sm text-[var(--shell-muted)]">加载中…</p> : null}

      <div className="analytics-metrics surface-card rounded-xl border p-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="analytics-metrics__cell">
            <p className="analytics-metrics__label">{s.label}</p>
            <p className="analytics-metrics__value">{s.value}</p>
          </div>
        ))}
      </div>

      <p className="text-sm text-[var(--shell-muted)] surface-card rounded-xl border p-4 space-y-2">
        {isPr ? (
          <Link to="/profile/funnel" className="text-sky-700 block">
            查看招募漏斗 · 全链路转化
          </Link>
        ) : (
          <>
            <Link to="/profile/talent-credit" className="text-sky-700 block">
              达人信用 · 履约评分
            </Link>
            <Link to="/profile/subscriptions" className="text-sky-700 block">
              商单订阅 · 新单提醒
            </Link>
          </>
        )}
      </p>
    </div>
  )
}
