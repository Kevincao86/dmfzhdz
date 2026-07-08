import { Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../cn'
import { DB_MIGRATION_HINT_ZH, shouldSuggestDbMigration } from '../lib/dbSchemaErrorHint'
import {
  POINTS_RECHARGE_TIERS,
  RECHARGE_TIERS,
  SUBSCRIPTION_TIERS,
  yuanInputToCents,
  type PaymentTier,
} from '../lib/meooPaymentTiers'
import { insertMerchantPaymentOrder } from '../lib/tenantBilling'
import { supabase } from '../lib/supabaseClient'
import {
  tenantPayPoll,
  tenantPayPrepay,
  type TenantPayChannel,
  type TenantPayOrderKind,
} from '../services/tenantBillingClient'

function formatThrown(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return '操作失败，请稍后重试'
}

const CHANNELS: { id: TenantPayChannel; label: string; color: string }[] = [
  { id: 'wechat', label: '微信支付', color: 'bg-emerald-600 hover:bg-emerald-500' },
  { id: 'alipay', label: '支付宝', color: 'bg-sky-600 hover:bg-sky-500' },
  { id: 'douyin', label: '抖音支付', color: 'bg-slate-800 hover:bg-slate-700' },
]

export type TenantPayModalProps = {
  open: boolean
  title: string
  mode: 'subscription' | 'recharge' | 'points_recharge'
  onClose: () => void
  onPaid?: () => void | Promise<void>
  initialTierIndex?: number
  initialRechargeYuan?: string | null
  rechargeContextHint?: string | null
}

export default function TenantPayModal({
  open,
  title,
  mode,
  onClose,
  onPaid,
  initialTierIndex = 0,
  initialRechargeYuan = null,
  rechargeContextHint = null,
}: TenantPayModalProps) {
  const tiers: PaymentTier[] = useMemo(() => {
    if (mode === 'subscription') return SUBSCRIPTION_TIERS
    if (mode === 'points_recharge') return POINTS_RECHARGE_TIERS
    return RECHARGE_TIERS
  }, [mode])

  const orderKind: TenantPayOrderKind = useMemo(() => {
    if (mode === 'subscription') return 'subscription'
    if (mode === 'points_recharge') return 'points_recharge'
    return 'recharge'
  }, [mode])

  const [step, setStep] = useState<'choose' | 'pay'>('choose')
  const [channel, setChannel] = useState<TenantPayChannel | null>(null)
  const [tierIndex, setTierIndex] = useState(initialTierIndex)
  const [customYuan, setCustomYuan] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [busy, setBusy] = useState(false)
  const [polling, setPolling] = useState(false)
  const [localErr, setLocalErr] = useState<string | null>(null)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [outTradeNo, setOutTradeNo] = useState<string | null>(null)
  const [payPageUrl, setPayPageUrl] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    setPolling(false)
  }, [])

  const reset = useCallback(() => {
    stopPoll()
    setStep('choose')
    setChannel(null)
    setTierIndex(initialTierIndex)
    setCustomYuan('')
    setUseCustom(false)
    setBusy(false)
    setLocalErr(null)
    setQrUrl(null)
    setOutTradeNo(null)
    setPayPageUrl(null)
  }, [initialTierIndex, stopPoll])

  useEffect(() => {
    if (!open) return
    reset()
    if (mode === 'recharge' && initialRechargeYuan?.trim()) {
      setUseCustom(true)
      setCustomYuan(initialRechargeYuan.trim())
    }
    setTierIndex(initialTierIndex)
  }, [open, mode, initialRechargeYuan, initialTierIndex, reset])

  useEffect(() => () => stopPoll(), [stopPoll])

  if (!open) return null

  const resolveAmountCents = (): number | null => {
    if (useCustom) return yuanInputToCents(customYuan)
    const t = tiers[tierIndex]
    return t ? t.cents : null
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const startPoll = (tradeNo: string) => {
    stopPoll()
    setPolling(true)
    pollRef.current = setInterval(() => {
      void (async () => {
        try {
          const r = await tenantPayPoll(tradeNo)
          if (r.status === 'paid') {
            stopPoll()
            await onPaid?.()
            handleClose()
            window.alert('支付成功，权益已到账。')
          } else if (r.status === 'expired' || r.status === 'cancelled') {
            stopPoll()
            setLocalErr('支付已超时或已取消，请重新发起')
            setStep('choose')
          }
        } catch {
          /* 轮询偶发失败忽略 */
        }
      })()
    }, 2500)
  }

  const startOnlinePay = async (ch: TenantPayChannel) => {
    setLocalErr(null)
    const cents = resolveAmountCents()
    if (cents === null) {
      setLocalErr('请选择有效档位或填写自定义金额')
      return
    }
    setBusy(true)
    setChannel(ch)
    try {
      const prepay = await tenantPayPrepay({
        orderKind,
        amountCents: cents,
        channel: ch,
      })
      const qr = prepay.qrCode || prepay.codeUrl || null
      setQrUrl(qr)
      setOutTradeNo(prepay.outTradeNo)
      setPayPageUrl(prepay.payPageUrl ?? null)
      setStep('pay')
      startPoll(prepay.outTradeNo)
    } catch (e) {
      setLocalErr(formatThrown(e))
      setChannel(null)
    } finally {
      setBusy(false)
    }
  }

  const submitManualPaid = async () => {
    if (!channel) return
    const cents = resolveAmountCents()
    if (cents === null || !supabase) {
      setLocalErr('金额无效或未登录')
      return
    }
    setBusy(true)
    setLocalErr(null)
    try {
      const { fetchPrimaryTenantId } = await import('../lib/tenantBilling')
      const tid = await fetchPrimaryTenantId(supabase)
      if (!tid) throw new Error('未找到租户')
      const kind =
        mode === 'subscription'
          ? 'subscription'
          : mode === 'points_recharge'
            ? ('points_recharge' as const)
            : 'recharge'
      await insertMerchantPaymentOrder(supabase, {
        tenantId: tid,
        orderKind: kind,
        amountCents: cents,
        payChannel: channel,
      })
      await onPaid?.()
      handleClose()
      window.alert('已提交支付申报，运营确认后将自动到账。')
    } catch (e) {
      const msg = formatThrown(e)
      setLocalErr(shouldSuggestDbMigration(msg) ? DB_MIGRATION_HINT_ZH : msg)
    } finally {
      setBusy(false)
    }
  }

  const selectedTier = tiers[tierIndex]
  const channelLabel = CHANNELS.find((c) => c.id === channel)?.label ?? '支付'

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={handleClose}
    >
      <div
        className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-gradient-to-b from-slate-950 via-slate-900 to-indigo-950 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">
            {step === 'pay' ? channelLabel : title}
          </h3>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {step === 'choose' ? (
          <>
            {rechargeContextHint ? (
              <p className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-100 ring-1 ring-amber-400/20">
                {rechargeContextHint}
              </p>
            ) : null}
            <p className="text-sm text-slate-400">
              支持微信、支付宝、抖音扫码支付；支付完成后权益自动到账。
            </p>

            <div className="mt-4 space-y-3">
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

              {mode === 'recharge' ? (
                <>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-400">
                    <input
                      type="checkbox"
                      checked={useCustom}
                      onChange={(e) => setUseCustom(e.target.checked)}
                      className="rounded border-slate-600"
                    />
                    自定义金额（元）
                  </label>
                  {useCustom ? (
                    <input
                      type="number"
                      min={1}
                      placeholder="例如 188"
                      value={customYuan}
                      onChange={(e) => setCustomYuan(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-slate-950/80 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/60"
                    />
                  ) : (
                    <p className="text-sm text-slate-300">
                      应付：<span className="font-semibold text-cyan-200">¥{selectedTier?.yuan ?? '—'}</span>
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-300">
                  应付：<span className="font-semibold text-cyan-200">¥{selectedTier?.yuan ?? '—'}</span>
                </p>
              )}
            </div>

            {localErr ? (
              <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">{localErr}</p>
            ) : null}

            <div className="mt-6 grid gap-2 sm:grid-cols-3">
              {CHANNELS.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  disabled={busy}
                  className={cn('rounded-xl py-2.5 text-sm font-medium text-white disabled:opacity-50', ch.color)}
                  onClick={() => void startOnlinePay(ch.id)}
                >
                  {busy ? '处理中…' : ch.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center text-center">
            <p className="text-sm text-slate-300">请使用{channelLabel}扫描二维码完成支付</p>
            {polling ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-cyan-300/90">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                等待支付结果…
              </p>
            ) : null}
            {qrUrl ? (
              <img
                src={
                  qrUrl.startsWith('data:') || qrUrl.startsWith('http')
                    ? qrUrl
                    : `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrUrl)}`
                }
                alt="支付二维码"
                className="mt-4 w-60 rounded-xl border border-white/10 bg-white p-2"
              />
            ) : payPageUrl ? (
              <a
                href={payPageUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-sky-500"
              >
                打开支付宝收银台
              </a>
            ) : (
              <p className="mt-4 text-sm text-amber-200">未获取到二维码，请尝试其他支付方式</p>
            )}
            <p className="mt-3 max-w-sm text-xs text-slate-400">
              若已支付但页面未更新，请稍候或点击下方「我已支付」；也可改用人工申报。
            </p>
            {localErr ? (
              <p className="mt-3 w-full rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">{localErr}</p>
            ) : null}
            <div className="mt-5 flex w-full flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={busy}
                className="flex-1 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => void submitManualPaid()}
              >
                {busy ? '提交中…' : '我已支付（人工申报）'}
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl border border-white/15 py-2.5 text-sm text-slate-200 hover:bg-white/5"
                onClick={() => {
                  stopPoll()
                  setStep('choose')
                  setChannel(null)
                  setQrUrl(null)
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
