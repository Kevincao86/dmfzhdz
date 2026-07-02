import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { cn } from '../cn'
import { fetchMyPaymentOrders } from '../lib/mpApi'
import { pollMembershipWechatPay } from '../lib/mpMembershipApi'
import { pollPointsWechatPay } from '../lib/mpPointsApi'
import {
  membershipBillingLabel,
  membershipPlanLabel,
  payModeLabel,
  paymentOrderStatusClass,
  paymentOrderStatusLabel,
  type MpMembershipOrderRow,
  type MpPointsOrderRow,
  yuanFromCents,
} from '../lib/mpMyOrdersApi'

type TabId = 'all' | 'membership' | 'points'

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}

function OrderStatusBadge({ status }: { status: 'pending' | 'confirmed' | 'rejected' }) {
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', paymentOrderStatusClass(status))}>
      {paymentOrderStatusLabel(status)}
    </span>
  )
}

function MembershipOrderCard({
  row,
  highlighted,
}: {
  row: MpMembershipOrderRow
  highlighted?: boolean
}) {
  return (
    <article
      className={cn(
        'surface-card rounded-xl border p-4',
        highlighted ? 'border-violet-400 ring-2 ring-violet-200' : 'border-[var(--shell-border)]',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs text-[var(--shell-muted)]">会员开通</p>
          <p className="mt-1 font-semibold text-[var(--shell-text)]">
            {membershipPlanLabel(row.planId)} · {membershipBillingLabel(row.billing)}
          </p>
        </div>
        <OrderStatusBadge status={row.status} />
      </div>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--shell-muted)]">金额</dt>
          <dd className="font-semibold text-[var(--shell-text)]">¥{yuanFromCents(row.amountCents)}</dd>
        </div>
        <div>
          <dt className="text-[var(--shell-muted)]">支付方式</dt>
          <dd>{payModeLabel(row.payMode)}</dd>
        </div>
        <div>
          <dt className="text-[var(--shell-muted)]">创建时间</dt>
          <dd>{fmtTime(row.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-[var(--shell-muted)]">支付时间</dt>
          <dd>{row.paidAt ? fmtTime(row.paidAt) : '—'}</dd>
        </div>
      </dl>
      {row.outTradeNo ? (
        <p className="mt-2 font-mono text-xs text-[var(--shell-muted)]">商户单号 {row.outTradeNo}</p>
      ) : null}
    </article>
  )
}

function PointsOrderCard({
  row,
  highlighted,
}: {
  row: MpPointsOrderRow
  highlighted?: boolean
}) {
  return (
    <article
      className={cn(
        'surface-card rounded-xl border p-4',
        highlighted ? 'border-violet-400 ring-2 ring-violet-200' : 'border-[var(--shell-border)]',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs text-[var(--shell-muted)]">积分充值</p>
          <p className="mt-1 font-semibold text-[var(--shell-text)]">{row.points.toLocaleString('zh-CN')} 积分</p>
        </div>
        <OrderStatusBadge status={row.status} />
      </div>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--shell-muted)]">金额</dt>
          <dd className="font-semibold text-[var(--shell-text)]">¥{yuanFromCents(row.amountCents)}</dd>
        </div>
        <div>
          <dt className="text-[var(--shell-muted)]">支付方式</dt>
          <dd>{payModeLabel(row.payMode)}</dd>
        </div>
        <div>
          <dt className="text-[var(--shell-muted)]">创建时间</dt>
          <dd>{fmtTime(row.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-[var(--shell-muted)]">到账时间</dt>
          <dd>{row.paidAt ? fmtTime(row.paidAt) : '—'}</dd>
        </div>
      </dl>
      {row.outTradeNo ? (
        <p className="mt-2 font-mono text-xs text-[var(--shell-muted)]">商户单号 {row.outTradeNo}</p>
      ) : null}
    </article>
  )
}

export default function MyPaymentOrdersPage() {
  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const highlightOutTradeNo = String(searchParams.get('outTradeNo') || '').trim()
  const initialTab: TabId =
    tabParam === 'membership' || tabParam === 'points' || tabParam === 'all' ? tabParam : 'all'

  const [tab, setTab] = useState<TabId>(initialTab)
  const [membershipOrders, setMembershipOrders] = useState<MpMembershipOrderRow[]>([])
  const [pointsOrders, setPointsOrders] = useState<MpPointsOrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [pollMsg, setPollMsg] = useState('')

  const load = useCallback(async () => {
    setErr('')
    setLoading(true)
    try {
      const data = await fetchMyPaymentOrders()
      setMembershipOrders(data.membershipOrders)
      setPointsOrders(data.pointsOrders)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setMembershipOrders([])
      setPointsOrders([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!highlightOutTradeNo) return
    let stopped = false
    const tick = async () => {
      try {
        const memHit = membershipOrders.find((row) => row.outTradeNo === highlightOutTradeNo)
        const ptsHit = pointsOrders.find((row) => row.outTradeNo === highlightOutTradeNo)
        if (!memHit && !ptsHit) return
        if (memHit?.status === 'pending') {
          const result = await pollMembershipWechatPay(highlightOutTradeNo)
          if (stopped) return
          if (result.status === 'paid') {
            setPollMsg(result.message)
            await load()
          }
          return
        }
        if (ptsHit?.status === 'pending') {
          const result = await pollPointsWechatPay(highlightOutTradeNo)
          if (stopped) return
          if (result.status === 'paid') {
            setPollMsg(result.message)
            await load()
          }
        }
      } catch {
        /* 轮询失败忽略 */
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 4000)
    return () => {
      stopped = true
      window.clearInterval(id)
    }
  }, [highlightOutTradeNo, membershipOrders, pointsOrders, load])

  const visibleMembership =
    tab === 'all' || tab === 'membership' ? membershipOrders : []
  const visiblePoints = tab === 'all' || tab === 'points' ? pointsOrders : []
  const totalCount = visibleMembership.length + visiblePoints.length

  const mergedRows = useMemo(() => {
    const rows: Array<
      | { kind: 'membership'; createdAt: string; row: MpMembershipOrderRow }
      | { kind: 'points'; createdAt: string; row: MpPointsOrderRow }
    > = [
      ...visibleMembership.map((row) => ({ kind: 'membership' as const, createdAt: row.createdAt, row })),
      ...visiblePoints.map((row) => ({ kind: 'points' as const, createdAt: row.createdAt, row })),
    ]
    return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [visibleMembership, visiblePoints])

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: 'all', label: '全部', count: membershipOrders.length + pointsOrders.length },
    { id: 'membership', label: '会员开通', count: membershipOrders.length },
    { id: 'points', label: '积分充值', count: pointsOrders.length },
  ]

  return (
    <div className="page-content-shell page-content-shell--narrow space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/profile" className="text-sm text-[var(--shell-muted)] hover:text-[var(--shell-text)]">
            ← 返回我的
          </Link>
          <h1 className="text-xl font-bold text-[var(--shell-text)] mt-1">我的订单</h1>
          <p className="text-sm text-[var(--shell-muted)] mt-1">会员开通与积分充值支付记录</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--shell-border)] px-3 py-2 text-sm"
          onClick={() => void load()}
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          刷新
        </button>
      </header>

      <div className="orders-page__tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className={cn('orders-page__tab', tab === t.id && 'orders-page__tab--active')}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.count > 0 ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {pollMsg ? <p className="text-sm text-emerald-700">{pollMsg}</p> : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {loading && totalCount === 0 ? (
        <p className="text-sm text-[var(--shell-muted)] py-8 text-center">加载订单…</p>
      ) : null}

      {!loading && totalCount === 0 ? (
        <div className="surface-card rounded-xl border p-8 text-center text-sm text-[var(--shell-muted)]">
          {tab === 'points'
            ? '暂无积分充值订单'
            : tab === 'membership'
              ? '暂无会员开通订单'
              : '暂无支付订单'}
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link to="/profile/membership" className="text-violet-600 hover:underline">
              去开通会员
            </Link>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {mergedRows.map((item) =>
          item.kind === 'membership' ? (
            <MembershipOrderCard
              key={`m-${item.row.id}`}
              row={item.row}
              highlighted={Boolean(highlightOutTradeNo && item.row.outTradeNo === highlightOutTradeNo)}
            />
          ) : (
            <PointsOrderCard
              key={`p-${item.row.id}`}
              row={item.row}
              highlighted={Boolean(highlightOutTradeNo && item.row.outTradeNo === highlightOutTradeNo)}
            />
          ),
        )}
      </div>
    </div>
  )
}
