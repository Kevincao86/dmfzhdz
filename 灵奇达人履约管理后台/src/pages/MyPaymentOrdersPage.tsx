import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { cn } from '../cn'
import { PointsOrderResumePaySheet } from '../components/PointsOrderResumePaySheet'
import { fetchAffiliatePortal, formatCentsYuan } from '@merchant/lib/distributionAffiliatePortalClient'
import { withdrawRequestStatusLabel } from '@merchant/lib/distributionRegistryCore'
import { fetchMyPaymentOrders, fetchTraining, postPrCashWallet, type MpMyUsageDetails } from '../lib/mpApi'
import { getAccount } from '../lib/mpSession'
import { getWorkIdentity } from '../lib/mpWorkIdentity'
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

type TabId = 'spend' | 'quota' | 'membership' | 'recharge' | 'withdraw'

type WithdrawRow = {
  id: string
  kindLabel: string
  amountYuan: string
  statusText: string
  paid: boolean
  createdAt: string
  detail: string
}

function parseTabParam(raw: string | null): TabId {
  const tab = String(raw || '').trim()
  if (tab === 'quota' || tab === 'package') return 'quota'
  if (tab === 'membership') return 'membership'
  if (tab === 'recharge' || tab === 'points') return 'recharge'
  if (tab === 'withdraw') return 'withdraw'
  return 'spend'
}

function clipTime(iso: string): string {
  return String(iso || '').slice(0, 16).replace('T', ' ')
}

async function loadWithdrawRows(): Promise<WithdrawRow[]> {
  const rows: WithdrawRow[] = []
  const cash = await postPrCashWallet({
    action: 'summary',
    workIdentity: getWorkIdentity(),
    allWithdraws: true,
  }).catch(() => null)
  const cashRows = Array.isArray(cash?.withdraws) ? (cash.withdraws as Array<Record<string, unknown>>) : []
  for (const item of cashRows) {
    const createdAt = String(item.createdAt || '')
    const paidAt = String(item.paidAt || '')
    const bankTail = String(item.bankTail || '')
    rows.push({
      id: `cash-${String(item.id || createdAt)}`,
      kindLabel: '活动红包',
      amountYuan: String(item.amountYuan || '0.00'),
      statusText: String(item.statusText || (item.status === 'paid' ? '提现成功' : '待打款')),
      paid: item.status === 'paid',
      createdAt,
      detail: [`申请 ${clipTime(createdAt)}`, paidAt ? `打款 ${clipTime(paidAt)}` : '', bankTail ? `尾号${bankTail}` : '']
        .filter(Boolean)
        .join(' · '),
    })
  }
  const training = await fetchTraining(getAccount()?.accountId).catch(() => null)
  const payouts = Array.isArray(training?.myPayouts) ? (training.myPayouts as Array<Record<string, unknown>>) : []
  for (const item of payouts) {
    const createdAt = String(item.createdAt || '')
    const paidAt = String(item.paidAt || '')
    rows.push({
      id: `train-${String(item.id || createdAt)}`,
      kindLabel: '培训结算',
      amountYuan: Number(item.net || 0).toFixed(2),
      statusText: item.status === 'paid' ? '提现成功' : '待打款',
      paid: item.status === 'paid',
      createdAt,
      detail: [`申请 ${clipTime(createdAt)}`, paidAt ? `打款 ${clipTime(paidAt)}` : ''].filter(Boolean).join(' · '),
    })
  }
  const portal = await fetchAffiliatePortal().catch(() => null)
  for (const item of portal?.withdrawRequests || []) {
    rows.push({
      id: `aff-${item.id}`,
      kindLabel: '推广佣金',
      amountYuan: formatCentsYuan(item.amountCents),
      statusText: withdrawRequestStatusLabel(item.status),
      paid: item.status === 'paid',
      createdAt: item.createdAt,
      detail: [`申请 ${clipTime(item.createdAt)}`, item.paidAt ? `打款 ${clipTime(item.paidAt)}` : '', item.failReason || '']
        .filter(Boolean)
        .join(' · '),
    })
  }
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
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

function usePayCountdownTick(active: boolean) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  return nowMs
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
          <table className="xx-pay-table">
            <thead>
              <tr>
                <th>单号</th>
                <th>类型</th>
                <th>金额</th>
                <th>时间</th>
                <th>余额</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>
                    {row.kindLabel}
                    {row.note ? <p className="xx-pay-table__sub">{row.note}</p> : null}
                  </td>
                  <td>-{row.points.toLocaleString('zh-CN')} 积分</td>
                  <td>{fmtTime(row.createdAt)}</td>
                  <td>{row.balanceAfter.toLocaleString('zh-CN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
          <table className="xx-pay-table">
            <thead>
              <tr>
                <th>单号</th>
                <th>类型</th>
                <th>金额</th>
                <th>时间</th>
                <th>余额</th>
              </tr>
            </thead>
            <tbody>
              {usageLedger.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>
                    {row.kindLabel}
                    {row.note ? <p className="xx-pay-table__sub">{row.note}</p> : null}
                  </td>
                  <td>{row.chargeSummary}</td>
                  <td>{fmtTime(row.createdAt)}</td>
                  <td>{row.points > 0 ? row.balanceAfter.toLocaleString('zh-CN') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
  const [withdraws, setWithdraws] = useState<WithdrawRow[]>([])
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
      const withdrawRows = await loadWithdrawRows()
      setWithdraws(withdrawRows)
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
    { id: 'withdraw', label: '提现', count: withdraws.length },
  ]

  const paymentEmptyMessage =
    tab === 'recharge' ? '暂无积分充值订单' : tab === 'membership' ? '暂无会员开通订单' : ''

  return (
    <div className="page-content-shell page-content-shell--wide xx-pay-desk space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/profile" className="text-sm text-[var(--shell-muted)] hover:text-[var(--shell-text)]">
            ← 返回我的
          </Link>
          <h1 className="text-xl font-bold text-[var(--shell-text)] mt-1">我的订单</h1>
          <p className="text-sm text-[var(--shell-muted)] mt-1">积分与套餐用量、会员开通、积分充值，以及全部提现记录</p>
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
          <table className="xx-pay-table">
            <thead>
              <tr>
                <th>单号</th>
                <th>类型</th>
                <th>金额</th>
                <th>支付方式</th>
                <th>时间</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {membershipOrders.map((row) => (
                <tr key={`m-${row.id}`} className={highlightOutTradeNo && row.outTradeNo === highlightOutTradeNo ? 'xx-pay-table__hit' : undefined}>
                  <td>{row.outTradeNo || row.id}</td>
                  <td>会员 · {membershipPlanLabel(row.planId)} · {membershipBillingLabel(row.billing)}</td>
                  <td>¥{yuanFromCents(row.amountCents)}</td>
                  <td>{payModeLabel(row.payMode)}</td>
                  <td>{row.paidAt ? fmtTime(row.paidAt) : fmtTime(row.createdAt)}</td>
                  <td><OrderStatusBadge status={row.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : null}

      {!loading && tab === 'withdraw' ? (
        withdraws.length === 0 ? (
          <div className="surface-card rounded-xl border p-8 text-center text-sm text-[var(--shell-muted)]">
            暂无提现记录
          </div>
        ) : (
          <table className="xx-pay-table">
            <thead>
              <tr>
                <th>类型</th>
                <th>金额</th>
                <th>状态</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {withdraws.map((row) => (
                <tr key={row.id}>
                  <td>{row.kindLabel}</td>
                  <td>¥{row.amountYuan}</td>
                  <td className={row.paid ? 'text-emerald-700' : 'text-amber-700'}>{row.statusText}</td>
                  <td>
                    {clipTime(row.createdAt)}
                    {row.detail ? <p className="xx-pay-table__sub">{row.detail}</p> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
          <table className="xx-pay-table">
            <thead>
              <tr>
                <th>单号</th>
                <th>类型</th>
                <th>金额</th>
                <th>支付方式</th>
                <th>时间</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {pointsOrders.map((row) => {
                const remainingMs = row.status === 'pending' ? pointsPayRemainingMs(row.createdAt, countdownNowMs) : 0
                const showPay = row.status === 'pending' && remainingMs > 0
                return (
                  <tr key={`p-${row.id}`} className={highlightOutTradeNo && row.outTradeNo === highlightOutTradeNo ? 'xx-pay-table__hit' : undefined}>
                    <td>{row.outTradeNo || row.id}</td>
                    <td>积分 · {row.points.toLocaleString('zh-CN')}</td>
                    <td>¥{yuanFromCents(row.amountCents)}</td>
                    <td>{payModeLabel(row.payMode)}</td>
                    <td>{row.paidAt ? fmtTime(row.paidAt) : fmtTime(row.createdAt)}</td>
                    <td>
                      <OrderStatusBadge status={row.status} />
                      {showPay ? (
                        <button type="button" className="xx-pay-table__pay" onClick={() => setResumePayOrder(row)}>
                          去支付 {formatPayCountdown(remainingMs)}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
