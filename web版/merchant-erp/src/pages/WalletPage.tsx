import {
  Coins,
  Crown,
  FileText,
  Package,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Wallet,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import TenantPayModal from '../components/TenantPayModal'
import { cn } from '../cn'
import { formatErpPointsEquivalentsLine } from '../lib/erpPointsEconomics'
import { formatYuanFromCents, yuanRefundInputToCents } from '../lib/meooPaymentTiers'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { DB_MIGRATION_HINT_ZH, shouldSuggestDbMigration } from '../lib/dbSchemaErrorHint'
import { fetchPrimaryTenantId, fetchTenantWalletSummary, insertMerchantPaymentOrder } from '../lib/tenantBilling'
import { useMembership } from '../context/MembershipContext'
import {
  fetchTenantBillingSummary,
  fetchTenantMyOrders,
  fetchTenantPointsLedger,
  type TenantBillingSummary,
  type TenantPaymentOrder,
  type TenantPointsLedgerRow,
} from '../services/tenantBillingClient'

function formatSupabaseErr(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

type WalletTab = 'overview' | 'orders' | 'package' | 'points'

type LedgerRow = {
  id: string
  delta_cents: number
  balance_after_cents: number
  reason: string
  created_at: string
}

const ORDER_KIND_LABEL: Record<string, string> = {
  subscription: '会员订阅',
  recharge: '账户充值',
  points_recharge: '积分充值',
  refund: '退款',
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: '待确认',
  amount_verified: '已核对',
  confirmed: '已完成',
  cancelled: '已取消',
}

const CHANNEL_LABEL: Record<string, string> = {
  wechat: '微信',
  alipay: '支付宝',
  douyin: '抖音',
  wallet: '余额',
}

export default function WalletPage() {
  const { entitlements } = useMembership()
  const [tab, setTab] = useState<WalletTab>('overview')
  const [summary, setSummary] = useState<TenantBillingSummary | null>(null)
  const [orders, setOrders] = useState<TenantPaymentOrder[]>([])
  const [pointsLedger, setPointsLedger] = useState<TenantPointsLedgerRow[]>([])
  const [walletLedger, setWalletLedger] = useState<LedgerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [payOpen, setPayOpen] = useState<'recharge' | 'points' | null>(null)
  const [refundOpen, setRefundOpen] = useState(false)
  const [refundYuanInput, setRefundYuanInput] = useState('')
  const [refundBusy, setRefundBusy] = useState(false)
  const [refundErr, setRefundErr] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!supabaseConfigured || !supabase) {
      setErr('未配置 Supabase')
      setLoading(false)
      return
    }
    setErr(null)
    try {
      const tid = await fetchPrimaryTenantId(supabase)
      if (!tid) {
        setErr('未找到租户信息')
        setLoading(false)
        return
      }
      const [s, wallet, orderRows, ptsRows] = await Promise.all([
        fetchTenantBillingSummary().catch(() => null),
        fetchTenantWalletSummary(supabase, tid),
        fetchTenantMyOrders().catch(() => []),
        fetchTenantPointsLedger().catch(() => []),
      ])
      setSummary(s)
      setWalletLedger(wallet.ledger as LedgerRow[])
      setOrders(orderRows)
      setPointsLedger(ptsRows)
    } catch (e) {
      const msg = formatSupabaseErr(e)
      setErr(shouldSuggestDbMigration(msg) ? DB_MIGRATION_HINT_ZH : msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const balanceCents = summary?.walletBalanceCents ?? 0

  const submitRefund = async (cents: number) => {
    if (!supabase) throw new Error('未配置 Supabase')
    if (cents <= 0 || cents > balanceCents) {
      setRefundErr('退款金额无效')
      return
    }
    setRefundBusy(true)
    try {
      const tid = await fetchPrimaryTenantId(supabase)
      if (!tid) throw new Error('未找到租户')
      await insertMerchantPaymentOrder(supabase, {
        tenantId: tid,
        orderKind: 'refund',
        amountCents: cents,
      })
      setRefundOpen(false)
      window.alert('退款申请已提交')
      await reload()
    } catch (e) {
      setRefundErr(formatSupabaseErr(e))
    } finally {
      setRefundBusy(false)
    }
  }

  const tabs: { id: WalletTab; label: string; icon: typeof Wallet }[] = [
    { id: 'overview', label: '概览', icon: Wallet },
    { id: 'orders', label: '我的订单', icon: ShoppingBag },
    { id: 'package', label: '套餐详情', icon: Package },
    { id: 'points', label: '积分明细', icon: Coins },
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="relative pl-4">
        <span
          className="absolute left-0 top-1 h-[calc(100%-4px)] w-1 rounded-full bg-gradient-to-b from-violet-500 to-cyan-500"
          aria-hidden
        />
        <h1 className="erp-page-title flex items-center gap-2">
          <Wallet className="h-7 w-7 text-violet-600" />
          我的钱包
        </h1>
        <p className="mt-1.5 text-sm text-slate-600">
          账户余额、会员套餐、AI 积分与订单记录；支持微信 / 支付宝 / 抖音支付。
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        {tabs.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition',
                tab === t.id
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => void reload()}
          className="ml-auto inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          刷新
        </button>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
      ) : null}

      {tab === 'overview' && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">账户余额</p>
            <p className="mt-2 text-4xl font-bold tabular-nums text-slate-900">
              ¥{formatYuanFromCents(balanceCents)}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPayOpen('recharge')}
                className="rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 px-4 py-2 text-sm font-semibold text-white"
              >
                余额充值
              </button>
              <button
                type="button"
                disabled={balanceCents <= 0}
                onClick={() => setRefundOpen(true)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
              >
                退款
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-6 shadow-sm">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-violet-600">
              <Sparkles className="h-3.5 w-3.5" />
              AI 积分
            </p>
            <p className="mt-2 text-4xl font-bold tabular-nums text-slate-900">
              {(summary?.totalPoints ?? 0).toLocaleString('zh-CN')}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              套餐桶 {(summary?.packagePoints ?? 0).toLocaleString('zh-CN')} · 充值桶{' '}
              {(summary?.rechargePoints ?? 0).toLocaleString('zh-CN')}
            </p>
            <button
              type="button"
              onClick={() => setPayOpen('points')}
              className="mt-4 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
            >
              积分充值
            </button>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <Crown className="h-3.5 w-3.5 text-amber-500" />
              当前套餐
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{summary?.membershipPlanLabel ?? entitlements.planLabel}</p>
            <p className="mt-2 text-sm text-slate-600">
              剩余{' '}
              <span className="font-semibold tabular-nums text-slate-900">
                {summary?.remainDays != null && summary.remainDays > 0 ? summary.remainDays : 0}
              </span>{' '}
              天
            </p>
            <Link
              to="/settings?tab=subscription"
              className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline"
            >
              管理订阅 →
            </Link>
          </section>
        </div>
      )}

      {tab === 'orders' && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <ShoppingBag className="h-5 w-5 text-violet-600" />
              我的订单
            </h2>
            <p className="mt-1 text-xs text-slate-500">订阅、充值、积分充值与退款申请实时状态</p>
          </div>
          <div className="max-h-[520px] overflow-auto">
            {orders.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm text-slate-500">暂无订单</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-6 py-3">时间</th>
                    <th className="px-6 py-3">类型</th>
                    <th className="px-6 py-3">金额</th>
                    <th className="px-6 py-3">支付</th>
                    <th className="px-6 py-3">状态</th>
                    <th className="px-6 py-3">到账</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-6 py-3 text-slate-600">
                        {o.created_at
                          ? new Date(o.created_at).toLocaleString('zh-CN', { hour12: false })
                          : '—'}
                      </td>
                      <td className="px-6 py-3 text-slate-800">
                        {ORDER_KIND_LABEL[o.order_kind] ?? o.order_kind}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 font-medium tabular-nums">
                        ¥{formatYuanFromCents(o.amount_cents)}
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        {o.pay_channel ? CHANNEL_LABEL[o.pay_channel] ?? o.pay_channel : '—'}
                        {o.pay_source === 'online' ? (
                          <span className="ml-1 text-[10px] text-emerald-600">在线</span>
                        ) : null}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            o.status === 'confirmed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : o.status === 'pending'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-600',
                          )}
                        >
                          {ORDER_STATUS_LABEL[o.status] ?? o.status}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-xs text-slate-600">
                        {o.extend_days_applied
                          ? `+${o.extend_days_applied} 天`
                          : o.wallet_credit_cents_applied
                            ? `+¥${formatYuanFromCents(o.wallet_credit_cents_applied)}`
                            : o.points_credit_applied
                              ? `+${o.points_credit_applied} 积分`
                              : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {tab === 'package' && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Package className="h-5 w-5 text-violet-600" />
              套餐详情
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">当前档位</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-900">
                  {summary?.membershipPlanLabel ?? entitlements.planLabel}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">会员剩余</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                  {summary?.remainDays != null && summary.remainDays > 0 ? summary.remainDays : 0} 天
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">订阅累计</dt>
                <dd className="mt-1 tabular-nums text-slate-800">{summary?.subscriptionDays ?? 0} 天</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">赠送累计</dt>
                <dd className="mt-1 tabular-nums text-slate-800">{summary?.opsGiftDays ?? 0} 天</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">月赠积分额度</dt>
                <dd className="mt-1 tabular-nums text-violet-700">
                  {(summary?.monthlyGiftPoints ?? 0).toLocaleString('zh-CN')} 积分/月
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">套餐桶余额</dt>
                <dd className="mt-1 tabular-nums text-slate-800">
                  {(summary?.packagePoints ?? 0).toLocaleString('zh-CN')} 积分
                </dd>
              </div>
            </dl>
            {summary ? (
              <p className="mt-4 text-xs text-slate-500">
                {formatErpPointsEquivalentsLine(summary.packagePoints)}（按当前套餐桶余额估算）
              </p>
            ) : null}
            <Link
              to="/settings?tab=subscription"
              className="mt-5 inline-flex rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              升级 / 续费订阅
            </Link>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <FileText className="h-5 w-5 text-slate-500" />
              钱包流水
            </h3>
            <div className="mt-4 max-h-64 overflow-auto">
              {walletLedger.length === 0 ? (
                <p className="text-sm text-slate-500">暂无流水</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {walletLedger.map((row) => (
                    <li key={row.id} className="flex justify-between gap-4 border-b border-slate-50 pb-2">
                      <span className="text-slate-600">{row.reason}</span>
                      <span
                        className={cn(
                          'shrink-0 font-medium tabular-nums',
                          row.delta_cents >= 0 ? 'text-emerald-600' : 'text-rose-600',
                        )}
                      >
                        {row.delta_cents >= 0 ? '+' : ''}¥{formatYuanFromCents(Math.abs(row.delta_cents))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {tab === 'points' && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  <Coins className="h-5 w-5 text-violet-600" />
                  积分消耗与到账
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  总余额 {(summary?.totalPoints ?? 0).toLocaleString('zh-CN')}（套餐桶优先扣减）
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPayOpen('points')}
                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white"
              >
                积分充值
              </button>
            </div>
          </div>
          <div className="max-h-[520px] overflow-auto">
            {pointsLedger.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm text-slate-500">暂无积分流水</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-6 py-3">时间</th>
                    <th className="px-6 py-3">说明</th>
                    <th className="px-6 py-3">套餐桶</th>
                    <th className="px-6 py-3">充值桶</th>
                    <th className="px-6 py-3">余额</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pointsLedger.map((row) => {
                    const totalAfter = row.balance_package_after + row.balance_recharge_after
                    return (
                      <tr key={row.id} className="hover:bg-slate-50/80">
                        <td className="whitespace-nowrap px-6 py-3 text-slate-600">
                          {new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })}
                        </td>
                        <td className="px-6 py-3 text-slate-800">{row.reason}</td>
                        <td
                          className={cn(
                            'whitespace-nowrap px-6 py-3 tabular-nums',
                            row.delta_package_points >= 0 ? 'text-emerald-600' : 'text-rose-600',
                          )}
                        >
                          {row.delta_package_points >= 0 ? '+' : ''}
                          {row.delta_package_points.toLocaleString('zh-CN')}
                        </td>
                        <td
                          className={cn(
                            'whitespace-nowrap px-6 py-3 tabular-nums',
                            row.delta_recharge_points >= 0 ? 'text-emerald-600' : 'text-rose-600',
                          )}
                        >
                          {row.delta_recharge_points >= 0 ? '+' : ''}
                          {row.delta_recharge_points.toLocaleString('zh-CN')}
                        </td>
                        <td className="whitespace-nowrap px-6 py-3 tabular-nums font-medium text-slate-900">
                          {totalAfter.toLocaleString('zh-CN')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      <TenantPayModal
        open={payOpen === 'recharge'}
        title="账户充值"
        mode="recharge"
        onClose={() => setPayOpen(null)}
        onPaid={() => reload()}
      />
      <TenantPayModal
        open={payOpen === 'points'}
        title="积分充值"
        mode="points_recharge"
        walletBalanceCents={balanceCents}
        onClose={() => setPayOpen(null)}
        onPaid={() => reload()}
      />

      {refundOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/55 p-4" onClick={() => !refundBusy && setRefundOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900">申请退款</h2>
            <p className="mt-2 text-sm text-slate-600">
              可用余额 ¥{formatYuanFromCents(balanceCents)}
            </p>
            <input
              className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2.5"
              placeholder="退款金额（元）"
              value={refundYuanInput}
              onChange={(e) => setRefundYuanInput(e.target.value)}
            />
            {refundErr ? <p className="mt-2 text-sm text-red-600">{refundErr}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="px-4 py-2 text-sm text-slate-600" onClick={() => setRefundOpen(false)}>
                取消
              </button>
              <button
                type="button"
                disabled={refundBusy}
                className="rounded-xl bg-teal-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => {
                  const cents = yuanRefundInputToCents(refundYuanInput)
                  if (cents) void submitRefund(cents)
                  else setRefundErr('请输入有效金额')
                }}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
