import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { cn } from '../cn'
import { PointsOrderResumePaySheet } from '../components/PointsOrderResumePaySheet'
import { fetchMyPaymentOrders, type MpMyUsageDetails } from '../lib/mpApi'
import { pollMembershipWechatPay } from '../lib/mpMembershipApi'
import { pollPointsWechatPay } from '../lib/mpPointsApi'
import {
  formatPayCountdown,
  membershipBillingLabel,
  membershipPlanLabel,
  payModeLabel,
  paymentOrderStatusClass,
  paymentOrderStatusLabel,
  pointsPayRemainingMs,
  type MpMembershipOrderRow,
  type MpPointsOrderRow,
  yuanFromCents,
} from '../lib/mpMyOrdersApi'

type TabId = 'spend' | 'quota' | 'membership' | 'recharge'

function parseTabParam(raw: string | null): TabId {
  const tab = String(raw || '').trim()
  if (tab === 'quota' || tab === 'package') return 'quota'
  if (tab === 'membership') return 'membership'
  if (tab === 'recharge' || tab === 'points') return 'recharge'
  return 'spend'
}

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

function usePayCountdownTick(active: boolean) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  return nowMs
}

function PointsOrderCard({
  row,
  highlighted,
  nowMs,
  onPay,
}: {
  row: MpPointsOrderRow
  highlighted?: boolean
  nowMs: number
  onPay?: (row: MpPointsOrderRow) => void
}) {
  const isPending = row.status === 'pending'
  const remainingMs = isPending ? pointsPayRemainingMs(row.createdAt, nowMs) : 0
  const showPay = isPending && remainingMs > 0

  return (
    <article
      className={cn(
        'surface-card rounded-xl border p-4',
        highlighted ? 'border-violet-400 ring-2 ring-violet-200' : 'border-[var(--shell-border)]',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[var(--shell-muted)]">积分充值</p>
          <p className="mt-1 font-semibold text-[var(--shell-text)]">{row.points.toLocaleString('zh-CN')} 积分</p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <OrderStatusBadge status={row.status} />
          {showPay ? (
            <>
              <p className="text-xs text-amber-700">
                剩余支付时间 <strong>{formatPayCountdown(remainingMs)}</strong>
              </p>
              <button
                type="button"
                className="xx-membership-cta xx-membership-cta--primary px-4 py-1.5 text-sm"
                onClick={() => onPay?.(row)}
              >
                去支付
              </button>
            </>
          ) : null}
        </div>
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

function DeductOrderNote({ note }: { note: string }) {
  if (!note) return null
  return (
    <p className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
      {note}
    </p>
  )
}

function PointsSpendPanel({ usage }: { usage: MpMyUsageDetails }) {
  const summary = usage.pointsSummary
  const ledger = usage.pointsLedger
  return (
    <div className="space-y-4">
      <DeductOrderNote note={usage.deductOrderNote} />
      <section className="surface-card rounded-xl border border-[var(--shell-border)] p-4">
        <h2 className="text-base font-semibold text-[var(--shell-text)]">积分概览</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-[var(--shell-muted)]">当前总积分</dt>
            <dd className="mt-1 text-lg font-bold text-violet-700">
              {summary.balance.toLocaleString('zh-CN')}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--shell-muted)]">套餐赠送剩余</dt>
            <dd className="mt-1 font-semibold">{summary.packageRemaining.toLocaleString('zh-CN')}</dd>
          </div>
          <div>
            <dt className="text-[var(--shell-muted)]">充值积分剩余</dt>
            <dd className="mt-1 font-semibold">{summary.rechargeBalance.toLocaleString('zh-CN')}</dd>
          </div>
          <div>
            <dt className="text-[var(--shell-muted)]">本月已消耗积分</dt>
            <dd className="mt-1 font-semibold">{summary.monthlySpent.toLocaleString('zh-CN')}</dd>
          </div>
        </dl>
      </section>
      <section className="surface-card rounded-xl border border-[var(--shell-border)] p-4">
        <h2 className="text-base font-semibold text-[var(--shell-text)]">积分消耗明细</h2>
        {ledger.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--shell-muted)]">暂无积分消耗记录</p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--shell-border)]">
            {ledger.map((row) => (
              <li key={row.id} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm">
                <div>
                  <p className="font-medium text-[var(--shell-text)]">{row.kindLabel}</p>
                  {row.note ? <p className="mt-0.5 text-xs text-[var(--shell-muted)]">{row.note}</p> : null}
                  <p className="mt-1 text-xs text-[var(--shell-muted)]">{fmtTime(row.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-amber-700">-{row.points.toLocaleString('zh-CN')} 积分</p>
                  <p className="text-xs text-[var(--shell-muted)]">
                    剩余 {row.balanceAfter.toLocaleString('zh-CN')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function QuotaSpendPanel({ usage }: { usage: MpMyUsageDetails }) {
  const quotaRows = usage.quotaRows
  const usageLedger = usage.usageLedger ?? []
  return (
    <div className="space-y-4">
      <DeductOrderNote note={usage.deductOrderNote} />
      <section className="surface-card rounded-xl border border-[var(--shell-border)] p-4">
        <h2 className="text-base font-semibold text-[var(--shell-text)]">
          套餐次数 / 分钟用量
          {usage.quotaMonth ? (
            <span className="ml-2 text-sm font-normal text-[var(--shell-muted)]">（{usage.quotaMonth}）</span>
          ) : null}
        </h2>
        {quotaRows.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--shell-muted)]">当前版本暂无套餐配额项</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--shell-border)] text-[var(--shell-muted)]">
                  <th className="py-2 pr-3 font-medium">项目</th>
                  <th className="py-2 px-3 font-medium">本月额度</th>
                  <th className="py-2 px-3 font-medium">已消耗</th>
                  <th className="py-2 pl-3 font-medium">剩余</th>
                </tr>
              </thead>
              <tbody>
                {quotaRows.map((row) => (
                  <tr key={row.key} className="border-b border-[var(--shell-border)] last:border-0">
                    <td className="py-2.5 pr-3 text-[var(--shell-text)]">{row.label}</td>
                    <td className="py-2.5 px-3">{row.displayLimit}</td>
                    <td className="py-2.5 px-3 text-amber-700">{row.displayUsed}</td>
                    <td className="py-2.5 pl-3 font-medium text-emerald-700">{row.displayRemaining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="surface-card rounded-xl border border-[var(--shell-border)] p-4">
        <h2 className="text-base font-semibold text-[var(--shell-text)]">套餐消耗明细</h2>
        {usageLedger.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--shell-muted)]">暂无套餐消耗记录</p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--shell-border)]">
            {usageLedger.map((row) => (
              <li key={row.id} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm">
                <div>
                  <p className="font-medium text-[var(--shell-text)]">{row.kindLabel}</p>
                  {row.note ? <p className="mt-0.5 text-xs text-[var(--shell-muted)]">{row.note}</p> : null}
                  <p className="mt-1 text-xs text-[var(--shell-muted)]">{fmtTime(row.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-amber-700">{row.chargeSummary}</p>
                  {row.points > 0 ? (
                    <p className="text-xs text-[var(--shell-muted)]">
                      积分余额 {row.balanceAfter.toLocaleString('zh-CN')}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export default function MyPaymentOrdersPage() {
  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const highlightOutTradeNo = String(searchParams.get('outTradeNo') || '').trim()
  const initialTab = parseTabParam(tabParam)

  const [tab, setTab] = useState<TabId>(initialTab)
  const [membershipOrders, setMembershipOrders] = useState<MpMembershipOrderRow[]>([])
  const [pointsOrders, setPointsOrders] = useState<MpPointsOrderRow[]>([])
  const [usage, setUsage] = useState<MpMyUsageDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [pollMsg, setPollMsg] = useState('')
  const [resumePayOrder, setResumePayOrder] = useState<MpPointsOrderRow | null>(null)

  const hasPendingPointsOrders = useMemo(
    () => pointsOrders.some((row) => row.status === 'pending'),
    [pointsOrders],
  )
  const countdownNowMs = usePayCountdownTick(hasPendingPointsOrders)

  useEffect(() => {
    setTab(parseTabParam(tabParam))
  }, [tabParam])

  const load = useCallback(async () => {
    setErr('')
    setLoading(true)
    try {
      const data = await fetchMyPaymentOrders()
      setMembershipOrders(data.membershipOrders)
      setPointsOrders(data.pointsOrders)
      setUsage(data.usage)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setMembershipOrders([])
      setPointsOrders([])
      setUsage(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!hasPendingPointsOrders) return
    const expiredLocally = pointsOrders.some(
      (row) => row.status === 'pending' && pointsPayRemainingMs(row.createdAt, countdownNowMs) <= 0,
    )
    if (expiredLocally) void load()
  }, [countdownNowMs, hasPendingPointsOrders, pointsOrders, load])

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
            setTab('membership')
            await load()
          }
          return
        }
        if (ptsHit?.status === 'pending') {
          const result = await pollPointsWechatPay(highlightOutTradeNo)
          if (stopped) return
          if (result.status === 'expired') {
            await load()
            return
          }
          if (result.status === 'paid') {
            setPollMsg(result.message)
            setTab('recharge')
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

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'spend', label: '积分消耗' },
    { id: 'quota', label: '套餐消耗' },
    { id: 'membership', label: '会员开通', count: membershipOrders.length },
    { id: 'recharge', label: '积分充值', count: pointsOrders.length },
  ]

  const paymentEmptyMessage =
    tab === 'recharge' ? '暂无积分充值订单' : tab === 'membership' ? '暂无会员开通订单' : ''

  return (
    <div className="page-content-shell page-content-shell--narrow space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/profile" className="text-sm text-[var(--shell-muted)] hover:text-[var(--shell-text)]">
            ← 返回我的
          </Link>
          <h1 className="text-xl font-bold text-[var(--shell-text)] mt-1">我的订单</h1>
          <p className="text-sm text-[var(--shell-muted)] mt-1">积分与套餐用量明细、会员开通与积分充值记录</p>
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
            aria-selected={tab === t.id}
            className={cn('orders-page__tab', tab === t.id && 'orders-page__tab--active')}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.count != null && t.count > 0 ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {pollMsg ? <p className="text-sm text-emerald-700">{pollMsg}</p> : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      {loading && !usage ? (
        <p className="text-sm text-[var(--shell-muted)] py-8 text-center">加载中…</p>
      ) : null}

      {!loading && usage && tab === 'spend' ? <PointsSpendPanel usage={usage} /> : null}
      {!loading && usage && tab === 'quota' ? <QuotaSpendPanel usage={usage} /> : null}

      {!loading && tab === 'membership' ? (
        membershipOrders.length === 0 ? (
          <div className="surface-card rounded-xl border p-8 text-center text-sm text-[var(--shell-muted)]">
            {paymentEmptyMessage}
            <div className="mt-4">
              <Link to="/profile/membership" className="text-violet-600 hover:underline">
                去开通会员
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {membershipOrders.map((row) => (
              <MembershipOrderCard
                key={`m-${row.id}`}
                row={row}
                highlighted={Boolean(highlightOutTradeNo && row.outTradeNo === highlightOutTradeNo)}
              />
            ))}
          </div>
        )
      ) : null}

      {!loading && tab === 'recharge' ? (
        pointsOrders.length === 0 ? (
          <div className="surface-card rounded-xl border p-8 text-center text-sm text-[var(--shell-muted)]">
            {paymentEmptyMessage}
            <div className="mt-4">
              <Link to="/profile/points-recharge" className="text-violet-600 hover:underline">
                去充值积分
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {pointsOrders.map((row) => (
              <PointsOrderCard
                key={`p-${row.id}`}
                row={row}
                highlighted={Boolean(highlightOutTradeNo && row.outTradeNo === highlightOutTradeNo)}
                nowMs={countdownNowMs}
                onPay={setResumePayOrder}
              />
            ))}
          </div>
        )
      ) : null}

      <PointsOrderResumePaySheet
        order={resumePayOrder}
        onClose={() => setResumePayOrder(null)}
        onPaid={() => {
          setPollMsg('支付成功，积分已到账。')
          void load()
        }}
        onExpired={() => {
          setResumePayOrder(null)
          void load()
        }}
      />
    </div>
  )
}
