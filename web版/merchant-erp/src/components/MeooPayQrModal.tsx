import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '../cn'
import { DB_MIGRATION_HINT_ZH, shouldSuggestDbMigration } from '../lib/dbSchemaErrorHint'
import {
  RECHARGE_TIERS,
  SUBSCRIPTION_TIERS,
  yuanInputToCents,
  type PaymentTier,
} from '../lib/meooPaymentTiers'

function formatThrown(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>
    if (typeof o.message === 'string' && o.message.trim()) return o.message
    if (typeof o.error_description === 'string' && o.error_description.trim()) return o.error_description
    if (typeof o.details === 'string' && o.details.trim()) return o.details
    if (typeof o.hint === 'string' && o.hint.trim()) return o.hint
    try {
      const s = JSON.stringify(o)
      if (s && s !== '{}') return s.length > 280 ? `${s.slice(0, 277)}…` : s
    } catch {
      /* ignore */
    }
  }
  return '提交失败，请稍后重试'
}

type PayChannel = 'wechat' | 'alipay'

export type MeooPayQrModalProps = {
  open: boolean
  title: string
  mode: 'subscription' | 'recharge'
  onClose: () => void
  /** 用户点击「我已完成支付」且金额有效时调用 */
  onCompletedPayment: (payload: { amountCents: number; payChannel: PayChannel }) => void | Promise<void>
  /** 充值模式：打开时在「自定义金额」中预填（元） */
  initialRechargeYuan?: string | null
  /** 充值模式：档位上方的补充说明（如招募总预算提示） */
  rechargeContextHint?: string | null
}

export default function MeooPayQrModal({
  open,
  title,
  mode,
  onClose,
  onCompletedPayment,
  initialRechargeYuan = null,
  rechargeContextHint = null,
}: MeooPayQrModalProps) {
  const tiers: PaymentTier[] = useMemo(
    () => (mode === 'subscription' ? SUBSCRIPTION_TIERS : RECHARGE_TIERS),
    [mode],
  )
  const [step, setStep] = useState<'choose' | 'pay'>('choose')
  const [payChannel, setPayChannel] = useState<PayChannel | null>(null)
  const [tierIndex, setTierIndex] = useState(0)
  const [customYuan, setCustomYuan] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [busy, setBusy] = useState(false)
  const [localErr, setLocalErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open || mode !== 'recharge') return
    const y = initialRechargeYuan?.trim()
    if (!y) return
    setUseCustom(true)
    setCustomYuan(y)
    setTierIndex(0)
    setStep('choose')
    setPayChannel(null)
    setLocalErr(null)
  }, [open, mode, initialRechargeYuan])

  if (!open) return null

  const resetAndClose = () => {
    setStep('choose')
    setPayChannel(null)
    setTierIndex(0)
    setCustomYuan('')
    setUseCustom(false)
    setLocalErr(null)
    setBusy(false)
    onClose()
  }

  const resolveAmountCents = (): number | null => {
    if (useCustom) return yuanInputToCents(customYuan)
    const t = tiers[tierIndex]
    return t ? t.cents : null
  }

  const openPay = (ch: PayChannel) => {
    setLocalErr(null)
    const cents = resolveAmountCents()
    if (cents === null) {
      setLocalErr(mode === 'recharge' ? '请输入自定义金额（整数元，不少于 ¥1）' : '请选择档位或填写有效自定义金额')
      return
    }
    setPayChannel(ch)
    setStep('pay')
  }

  const handlePaid = async () => {
    setLocalErr(null)
    if (!payChannel) return
    const cents = resolveAmountCents()
    if (cents === null) {
      setLocalErr('金额无效')
      return
    }
    setBusy(true)
    try {
      await onCompletedPayment({ amountCents: cents, payChannel })
      resetAndClose()
    } catch (e) {
      const msg = formatThrown(e)
      setLocalErr(shouldSuggestDbMigration(msg) ? DB_MIGRATION_HINT_ZH : msg)
    } finally {
      setBusy(false)
    }
  }

  const selectedTier = tiers[tierIndex]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      onClick={resetAndClose}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-6 shadow-[0_0_60px_-12px_rgba(34,211,238,0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]" aria-hidden>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(rgba(34,211,238,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.15) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          />
        </div>

        <div className="relative mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold tracking-tight text-white">
            {step === 'pay'
              ? payChannel === 'wechat'
                ? '微信支付'
                : '支付宝'
              : title}
          </h3>
          <button
            type="button"
            onClick={resetAndClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {step === 'choose' ? (
          <>
            {mode === 'recharge' && rechargeContextHint ? (
              <p className="relative mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm leading-relaxed text-amber-100 ring-1 ring-amber-400/25">
                {rechargeContextHint}
              </p>
            ) : null}
            <p className="relative text-sm leading-relaxed text-slate-400">
              支付时请备注<strong className="text-cyan-200">账号ID或商户名</strong>；以下为示意二维码。
            </p>

            <div className="relative mt-4 space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">选择档位</p>
              <div className="flex flex-wrap gap-2">
                {tiers.map((t, i) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => {
                      setUseCustom(false)
                      setTierIndex(i)
                    }}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-sm transition',
                      !useCustom && tierIndex === i
                        ? 'border-cyan-400/80 bg-cyan-500/15 text-cyan-100'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20',
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-400">
                <input
                  type="checkbox"
                  checked={useCustom}
                  onChange={(e) => setUseCustom(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-900 text-cyan-500"
                />
                自定义金额（元）
              </label>
              {useCustom ? (
                <input
                  type="number"
                  min={1}
                  step={1}
                  placeholder="例如 188"
                  value={customYuan}
                  onChange={(e) => setCustomYuan(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-slate-950/80 px-3 py-2.5 text-sm text-white outline-none ring-cyan-500/0 transition focus:border-cyan-400/60 focus:ring-4 focus:ring-cyan-500/15"
                />
              ) : (
                <p className="text-sm text-slate-300">
                  当前：<span className="font-semibold text-cyan-200">¥{selectedTier?.yuan ?? '—'}</span>
                </p>
              )}
            </div>

            {localErr ? (
              <p className="relative mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200 ring-1 ring-red-500/25">
                {localErr}
              </p>
            ) : null}

            <div className="relative mt-6 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
                onClick={() => openPay('wechat')}
              >
                微信支付
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-sky-600 py-2.5 text-sm font-medium text-white hover:bg-sky-500"
                onClick={() => openPay('alipay')}
              >
                支付宝
              </button>
            </div>
          </>
        ) : (
          <div className="relative flex flex-col items-center text-center">
            <p className="text-sm text-slate-300">
              {payChannel === 'wechat' ? '请使用微信扫描二维码完成支付' : '请使用支付宝扫描二维码完成支付'}
            </p>
            <img
              src={
                payChannel === 'wechat'
                  ? `${import.meta.env.BASE_URL}subscription/wechat-pay-qr.png`
                  : `${import.meta.env.BASE_URL}subscription/alipay-qr.png`
              }
              alt={payChannel === 'wechat' ? '微信支付二维码' : '支付宝二维码'}
              className="mt-4 w-60 max-w-full rounded-xl border border-white/10 bg-white p-2 shadow-lg sm:w-64"
            />
            <p className="mt-3 max-w-sm text-xs text-amber-200/90">
              点击「我已完成支付」后，工作人员核对到账后将为您延长服务或入账余额。
            </p>
            {localErr ? (
              <p className="mt-3 w-full rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200 ring-1 ring-red-500/25">
                {localErr}
              </p>
            ) : null}
            <div className="mt-5 flex w-full max-w-sm flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                disabled={busy}
                className="rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-900/30 hover:brightness-110 disabled:opacity-50 sm:flex-1"
                onClick={() => void handlePaid()}
              >
                {busy ? '提交中…' : '我已完成支付'}
              </button>
              <button
                type="button"
                className="rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/10 sm:flex-1"
                onClick={() => {
                  setStep('choose')
                  setPayChannel(null)
                  setLocalErr(null)
                }}
              >
                返回重选
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
