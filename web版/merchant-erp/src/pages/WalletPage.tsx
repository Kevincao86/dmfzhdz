import { RefreshCw, Wallet } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import MeooPayQrModal from '../components/MeooPayQrModal'
import { cn } from '../cn'
import { formatYuanFromCents, yuanRefundInputToCents } from '../lib/meooPaymentTiers'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { DB_MIGRATION_HINT_ZH, shouldSuggestDbMigration } from '../lib/dbSchemaErrorHint'
import { fetchPrimaryTenantId, fetchTenantWalletSummary, insertMerchantPaymentOrder } from '../lib/tenantBilling'

function formatSupabaseErr(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && e !== null) {
    const o = e as Record<string, unknown>
    if (typeof o.message === 'string' && o.message.length > 0) return o.message
    if (typeof o.error_description === 'string') return o.error_description
    if (typeof o.details === 'string') return o.details
    if (typeof o.hint === 'string') return o.hint
    try {
      return JSON.stringify(e)
    } catch {
      return String(e)
    }
  }
  return String(e)
}

type LedgerRow = {
  id: string
  delta_cents: number
  balance_after_cents: number
  reason: string
  created_at: string
}

export default function WalletPage() {
  const [balanceCents, setBalanceCents] = useState<number>(0)
  const [expireAt, setExpireAt] = useState<string | null>(null)
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [refundYuanInput, setRefundYuanInput] = useState('')
  const [refundBusy, setRefundBusy] = useState(false)
  const [refundErr, setRefundErr] = useState<string | null>(null)
  const [fullRefundConfirmOpen, setFullRefundConfirmOpen] = useState(false)

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
      const s = await fetchTenantWalletSummary(supabase, tid)
      setBalanceCents(s.balanceCents)
      setExpireAt(s.serviceExpireAt)
      setLedger(s.ledger as LedgerRow[])
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

  const onRechargePaid = async (payload: { amountCents: number; payChannel: 'wechat' | 'alipay' }) => {
    if (!supabase) throw new Error('未配置 Supabase')
    const tid = await fetchPrimaryTenantId(supabase)
    if (!tid) throw new Error('未找到租户关联')
    await insertMerchantPaymentOrder(supabase, {
      tenantId: tid,
      orderKind: 'recharge',
      amountCents: payload.amountCents,
      payChannel: payload.payChannel,
    })
    window.alert('已提交充值申报，到账后运营确认余额将更新。')
  }

  const openRefundModal = () => {
    setRefundErr(null)
    setRefundYuanInput('')
    setFullRefundConfirmOpen(false)
    setRefundOpen(true)
  }

  const submitRefund = async (cents: number) => {
    if (!supabase) throw new Error('未配置 Supabase')
    if (cents <= 0 || !Number.isFinite(cents)) {
      setRefundErr('请输入有效退款金额')
      return
    }
    if (cents > balanceCents) {
      setRefundErr('退款金额不能大于可用余额')
      return
    }
    if (balanceCents <= 0) {
      setRefundErr('当前无可退余额')
      return
    }
    setRefundBusy(true)
    setRefundErr(null)
    try {
      const tid = await fetchPrimaryTenantId(supabase)
      if (!tid) throw new Error('未找到租户关联')
      await insertMerchantPaymentOrder(supabase, {
        tenantId: tid,
        orderKind: 'refund',
        amountCents: cents,
      })
      setRefundOpen(false)
      setRefundYuanInput('')
      setFullRefundConfirmOpen(false)
      window.alert('退款申请已提交，客服审核后进行退还。')
      await reload()
    } catch (e) {
      setRefundErr(formatSupabaseErr(e))
    } finally {
      setRefundBusy(false)
    }
  }

  const onRefundConfirm = async () => {
    const cents = yuanRefundInputToCents(refundYuanInput)
    if (cents === null) {
      setRefundErr('请输入大于 0 的金额（最小 ¥0.01）')
      return
    }
    await submitRefund(cents)
  }

  const onRefundAllClick = () => {
    if (refundBusy || balanceCents <= 0) return
    setFullRefundConfirmOpen(true)
  }

  const onFullRefundConfirmed = async () => {
    setFullRefundConfirmOpen(false)
    await submitRefund(balanceCents)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="relative pl-4">
        <span
          className="absolute left-0 top-1 h-[calc(100%-4px)] w-1 rounded-full bg-gradient-to-b from-violet-500 to-cyan-500"
          aria-hidden
        />
        <h1 className="erp-page-title flex items-center gap-2">
          <Wallet className="h-7 w-7 text-violet-600" />
          我的钱包
        </h1>
        <p className="mt-1.5 text-sm text-slate-600">可用余额与流水；充值档位与订阅扫码流程一致。</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">可用余额</p>
          <p className="mt-2 text-4xl font-bold tabular-nums text-slate-900">
            ¥{formatYuanFromCents(balanceCents)}
          </p>
          {expireAt ? (
            <p className="mt-3 text-xs text-slate-500">
              服务参考到期：<span className="font-medium text-slate-700">{new Date(expireAt).toLocaleString('zh-CN')}</span>
            </p>
          ) : (
            <p className="mt-3 text-xs text-slate-500">服务到期时间由运营确认订阅订单后延长。</p>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPayOpen(true)}
              className="rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/15 hover:brightness-105"
            >
              充值
            </button>
            <button
              type="button"
              disabled={balanceCents <= 0}
              onClick={() => openRefundModal()}
              className="rounded-xl border-2 border-[#149191] bg-white px-5 py-2.5 text-sm font-semibold text-[#149191] hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
            >
              退款
            </button>
            <button
              type="button"
              onClick={() => void reload()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              刷新
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-sm leading-relaxed text-slate-600">
          <p className="font-medium text-slate-800">说明</p>
          <ul className="mt-3 list-inside list-disc space-y-1">
            <li>充值可选固定档位或自定义金额（与订阅弹窗相同的扫码示意）。</li>
            <li>充值点击「我已完成支付」后进入「订单管理」；退款在下方发起后同样进入该列表（类别为退款）。</li>
            <li>运营核对金额并确认后，充值入账或退款扣减将同步到本页余额与客户详情。</li>
          </ul>
        </section>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">使用账单</h2>
          <p className="mt-1 text-xs text-slate-500">充值入账与后续消耗将记录在此（消耗功能可按业务扩展）。</p>
        </div>
        <div className="max-h-[420px] overflow-auto">
          {ledger.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500">暂无流水</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3">时间</th>
                  <th className="px-6 py-3">变动</th>
                  <th className="px-6 py-3">余额</th>
                  <th className="px-6 py-3">说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledger.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-6 py-3 text-slate-600">
                      {new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })}
                    </td>
                    <td
                      className={cn(
                        'whitespace-nowrap px-6 py-3 font-medium tabular-nums',
                        row.delta_cents >= 0 ? 'text-emerald-600' : 'text-rose-600',
                      )}
                    >
                      {row.delta_cents >= 0 ? '+' : ''}
                      ¥{formatYuanFromCents(Math.abs(row.delta_cents))}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 tabular-nums text-slate-800">
                      ¥{formatYuanFromCents(row.balance_after_cents)}
                    </td>
                    <td className="px-6 py-3 text-slate-600">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <MeooPayQrModal
        open={payOpen}
        title="账户充值"
        mode="recharge"
        onClose={() => setPayOpen(false)}
        onCompletedPayment={(p) => onRechargePaid(p)}
      />

      {refundOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => {
            if (refundBusy) return
            if (fullRefundConfirmOpen) {
              setFullRefundConfirmOpen(false)
              return
            }
            setRefundOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-modal
            aria-labelledby="refund-modal-title"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="refund-modal-title" className="text-lg font-bold text-slate-900">
              申请退款
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              可用余额 <span className="font-semibold tabular-nums text-slate-900">¥{formatYuanFromCents(balanceCents)}</span>
              。金额不得超过可用余额；客服审核后进行退还。
            </p>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="refund-amt">
              退款金额（元）
            </label>
            <input
              id="refund-amt"
              inputMode="decimal"
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-base text-slate-900 outline-none focus:border-[#149191] focus:ring-4 focus:ring-teal-500/15"
              placeholder="例如 100.00"
              value={refundYuanInput}
              onChange={(e) => {
                setRefundYuanInput(e.target.value)
                setRefundErr(null)
              }}
            />
            {refundErr ? (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">{refundErr}</p>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={refundBusy || balanceCents <= 0}
                onClick={onRefundAllClick}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
              >
                全部退款（¥{formatYuanFromCents(balanceCents)}）
              </button>
            </div>
            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={refundBusy}
                onClick={() => {
                  setFullRefundConfirmOpen(false)
                  setRefundOpen(false)
                }}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={refundBusy}
                onClick={() => void onRefundConfirm()}
                className="rounded-xl bg-[#149191] px-5 py-2 text-sm font-semibold text-white shadow-md hover:brightness-105 disabled:opacity-50"
              >
                {refundBusy ? '提交中…' : '确认'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {refundOpen && fullRefundConfirmOpen ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4"
          role="presentation"
          onClick={() => !refundBusy && setFullRefundConfirmOpen(false)}
        >
          <div
            role="dialog"
            aria-modal
            aria-labelledby="full-refund-confirm-title"
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="full-refund-confirm-title" className="text-base font-bold text-slate-900">
              是否全部退款？
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              将把当前可用余额{' '}
              <span className="font-semibold tabular-nums text-slate-900">¥{formatYuanFromCents(balanceCents)}</span>{' '}
              全部发起退款申请，提交后进入客服审核流程。
            </p>
            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={refundBusy}
                onClick={() => setFullRefundConfirmOpen(false)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={refundBusy}
                onClick={() => void onFullRefundConfirmed()}
                className="rounded-xl bg-[#149191] px-5 py-2 text-sm font-semibold text-white shadow-md hover:brightness-105 disabled:opacity-50"
              >
                {refundBusy ? '提交中…' : '确认'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
