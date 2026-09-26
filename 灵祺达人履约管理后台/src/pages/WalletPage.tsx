import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchRegistryProfile, fetchTraining, postTraining } from '../lib/mpApi'
import { getAccount } from '../lib/mpSession'

const DEPOSIT = 500

const ORDER_STATUS: Record<string, string> = {
  escrow: '托管中',
  review: '待核实',
  ready: 'T+1 待打款',
  settled: '已结算',
}

type SettleOrder = {
  id: string
  title: string
  payable: number
  status: string
  settleAt?: string
}

export default function WalletPage() {
  const me = getAccount()
  const [balance, setBalance] = useState(0)
  const [depositPaid, setDepositPaid] = useState(false)
  const [orders, setOrders] = useState<SettleOrder[]>([])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [payOpen, setPayOpen] = useState(false)
  const [payChannel, setPayChannel] = useState<'wechat' | 'alipay' | 'douyin'>('wechat')
  const [payQr, setPayQr] = useState('')
  const [payTrade, setPayTrade] = useState('')
  const [payBusy, setPayBusy] = useState(false)

  async function load() {
    setLoading(true)
    setErr('')
    try {
      const [profile, training] = await Promise.all([
        fetchRegistryProfile().catch(() => null),
        fetchTraining(me?.accountId),
      ])
      const summary = profile?.mpAiPointsSummary
      const points = summary
        ? Math.max(0, Math.floor(Number(summary.balance) || Number(summary.packageRemaining || 0) + Number(summary.rechargeBalance || 0)))
        : Math.max(0, Math.floor(Number(profile?.mpAiPointsBalance) || 0))
      const deposit = training.deposit as { paid?: boolean } | undefined
      const rows = Array.isArray(training.orders) ? (training.orders as SettleOrder[]) : []
      setBalance(points)
      setDepositPaid(!!deposit?.paid)
      setOrders(rows)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    if (!payTrade) return
    const timer = window.setInterval(() => {
      postTraining({ action: 'payQuery', outTradeNo: payTrade })
        .then((res) => {
          if (!res.paid) return
          window.clearInterval(timer)
          setPayTrade('')
          setPayQr('')
          setPayOpen(false)
          return load()
        })
        .catch(() => {})
    }, 2500)
    return () => window.clearInterval(timer)
  }, [payTrade])

  async function startScanPay() {
    if (!me?.accountId) {
      setErr('请先登录')
      return
    }
    setPayBusy(true)
    setErr('')
    try {
      const res = await postTraining({
        action: 'prepay',
        purpose: 'deposit',
        channel: payChannel,
        scene: 'native',
        hostId: me.accountId,
      })
      setPayQr(String(res.qrDataUrl || ''))
      setPayTrade(String(res.outTradeNo || ''))
      if (!res.qrDataUrl) setErr('没有拿到付款码')
    } catch (e) {
      setErr(e instanceof Error ? e.message : '支付下单失败')
    } finally {
      setPayBusy(false)
    }
  }

  return (
    <div className="page-content-shell page-content-shell--narrow space-y-4">
      <div>
        <Link to="/profile" className="text-sm text-[var(--shell-muted)] hover:text-[var(--shell-text)]">
          ← 返回我的
        </Link>
        <h1 className="mt-2 text-xl font-bold text-[var(--shell-text)]">我的钱包</h1>
        <p className="mt-1 text-sm text-[var(--shell-muted)]">积分、培训保证金和课时费应付款。课时费不是提现。</p>
      </div>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <section className="rounded-2xl border border-[var(--shell-border)] bg-[var(--panel-card)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--shell-text)]">积分</h2>
            <p className="mt-1 text-2xl font-bold text-violet-700">{loading ? '…' : balance.toLocaleString('zh-CN')}</p>
            <p className="mt-1 text-xs text-[var(--shell-muted)]">用于视频、文稿检核和 Brief 生成</p>
          </div>
          <Link to="/profile/points-recharge" className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white">
            去充值
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--shell-border)] bg-[var(--panel-card)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--shell-text)]">培训保证金</h2>
            <p className="mt-1 text-sm text-[var(--shell-text)]">
              {depositPaid ? `¥${DEPOSIT} 已缴纳` : `¥${DEPOSIT} 未缴纳`}
            </p>
            <p className="mt-1 text-xs text-[var(--shell-muted)]">讲师履约保证金，和小程序同一份记录</p>
          </div>
          {depositPaid ? null : (
            <button
              type="button"
              className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white"
              onClick={() => {
                setPayQr('')
                setPayTrade('')
                setPayOpen(true)
              }}
            >
              扫码缴纳
            </button>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--shell-border)] bg-[var(--panel-card)] p-4">
        <h2 className="text-sm font-semibold text-[var(--shell-text)]">培训结算</h2>
        <p className="mt-1 text-xs text-[var(--shell-muted)]">学员付款后由平台代收。提交完成证明后进入 T+1 应付款，不提供提现。</p>
        {!orders.length ? <p className="mt-3 text-sm text-[var(--shell-muted)]">还没有报名订单</p> : null}
        <div className="mt-3 space-y-2">
          {orders.map((order) => (
            <div key={order.id} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <p className="font-medium text-[var(--shell-text)]">{order.title}</p>
              <p className="mt-1 text-xs text-[var(--shell-muted)]">
                应付款 ¥{order.payable} · {ORDER_STATUS[order.status] || order.status}
                {order.settleAt ? ` · ${String(order.settleAt).slice(0, 10)}` : ''}
              </p>
            </div>
          ))}
        </div>
      </section>

      <Link to="/profile/my-orders" className="block rounded-2xl border border-[var(--shell-border)] bg-[var(--panel-card)] p-4">
        <h2 className="text-sm font-semibold text-[var(--shell-text)]">支付记录</h2>
        <p className="mt-1 text-xs text-[var(--shell-muted)]">会员开通与积分充值</p>
      </Link>

      {payOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-6" onClick={() => { setPayOpen(false); setPayTrade(''); setPayQr('') }}>
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900">培训保证金</h2>
            <p className="mt-1 text-sm text-slate-500">用微信、支付宝或抖音扫码支付 ¥{DEPOSIT}。支付成功后和小程序共用同一份记录。</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {([
                ['wechat', '微信'],
                ['alipay', '支付宝'],
                ['douyin', '抖音'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={payChannel === id ? 'rounded-xl bg-violet-600 py-2 text-sm font-semibold text-white' : 'rounded-xl bg-slate-100 py-2 text-sm text-slate-600'}
                  onClick={() => { setPayChannel(id); setPayQr(''); setPayTrade('') }}
                >
                  {label}
                </button>
              ))}
            </div>
            {payQr ? <img src={payQr} alt="付款码" className="mx-auto mt-4 h-56 w-56" /> : null}
            <button type="button" disabled={payBusy} className="mt-4 w-full rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60" onClick={() => { void startScanPay() }}>
              {payBusy ? '正在生成付款码' : payQr ? '重新生成付款码' : '生成付款码'}
            </button>
            {payTrade ? <p className="mt-2 text-center text-xs text-slate-400">等待支付结果</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
