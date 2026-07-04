import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PaymentChannelIcon } from './PaymentChannelIcon'
import { buildMembershipPayQrDataUrl } from '../lib/wechatPayQrDataUrl'
import {
  pollPointsPay,
  resumePointsPay,
  type MpPointsPayChannel,
} from '../lib/mpPointsApi'
import { myOrdersPath } from '../lib/mpMyOrdersApi'
import type { MpPointsOrderRow } from '../lib/mpApi'

function yuanLabel(cents: number): string {
  return (cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function channelLabel(channel: MpPointsPayChannel): string {
  if (channel === 'alipay') return '支付宝'
  if (channel === 'douyin') return '抖音支付'
  return '微信支付'
}

async function resolvePayQrDisplay(qrText: string, channel: MpPointsPayChannel): Promise<string> {
  const text = String(qrText || '').trim()
  if (!text) return ''
  if (/^data:image\//i.test(text)) return text
  return buildMembershipPayQrDataUrl(text, channel)
}

type Props = {
  order: MpPointsOrderRow | null
  onClose: () => void
  onPaid?: () => void
  onExpired?: () => void
}

export function PointsOrderResumePaySheet({ order, onClose, onPaid, onExpired }: Props) {
  const open = Boolean(order?.outTradeNo && order.status === 'pending')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [doneMsg, setDoneMsg] = useState('')
  const [prepayLoading, setPrepayLoading] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [payPageUrl, setPayPageUrl] = useState('')
  const [channel, setChannel] = useState<MpPointsPayChannel>('wechat')
  const [outTradeNo, setOutTradeNo] = useState('')

  useEffect(() => {
    if (!open || !order?.outTradeNo) return
    setErr('')
    setDoneMsg('')
    setBusy(false)
    setPrepayLoading(true)
    setQrDataUrl('')
    setPayPageUrl('')
    setOutTradeNo('')
    setChannel(order.channel === 'alipay' ? 'alipay' : order.channel === 'douyin' ? 'douyin' : 'wechat')

    let cancelled = false
    void (async () => {
      try {
        const prepay = await resumePointsPay(order.outTradeNo!)
        if (cancelled) return
        setChannel(prepay.channel)
        setOutTradeNo(prepay.outTradeNo)
        const pageUrl = prepay.payPageUrl || ''
        setPayPageUrl(pageUrl)
        const qrText = prepay.codeUrl || prepay.qrCode || ''
        const dataUrl = pageUrl ? '' : await resolvePayQrDisplay(qrText, prepay.channel)
        if (cancelled) return
        setQrDataUrl(dataUrl)
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e)
          setErr(msg)
          if (/超时|expired|closed|关闭/i.test(msg)) onExpired?.()
        }
      } finally {
        if (!cancelled) setPrepayLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, order?.outTradeNo, order?.channel, onExpired])

  useEffect(() => {
    if (!open || !outTradeNo || doneMsg) return

    let stopped = false
    const tick = async () => {
      try {
        const result = await pollPointsPay(channel, outTradeNo)
        if (stopped) return
        if (result.status === 'expired') {
          onExpired?.()
          return
        }
        if (result.status !== 'paid') return
        setDoneMsg(result.message)
        onPaid?.()
      } catch {
        /* 轮询偶发失败忽略 */
      }
    }

    const id = window.setInterval(() => void tick(), 3000)
    return () => {
      stopped = true
      window.clearInterval(id)
    }
  }, [open, outTradeNo, doneMsg, channel, onPaid, onExpired])

  if (!open || !order) return null

  async function onCompletedPayClick() {
    if (outTradeNo) {
      setBusy(true)
      setErr('')
      try {
        const result = await pollPointsPay(channel, outTradeNo)
        if (result.status === 'expired') {
          onExpired?.()
          onClose()
          return
        }
        if (result.status === 'paid') {
          onPaid?.()
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    }
    onClose()
  }

  const scanHint =
    channel === 'alipay'
      ? '请使用支付宝扫一扫完成支付；支付成功后积分将自动到账。'
      : channel === 'douyin'
        ? '请使用抖音扫一扫完成支付；支付成功后积分将自动到账。'
        : '请使用微信扫一扫完成支付；支付成功后积分将自动到账。'

  return (
    <div className="xx-membership-pay-backdrop" role="presentation" onClick={onClose}>
      <div
        className="xx-membership-pay-sheet surface-card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="xx-membership-pay-sheet__head">
          <h3>继续支付 · {order.points.toLocaleString('zh-CN')} 积分</h3>
          <button type="button" className="xx-membership-pay-sheet__close" onClick={onClose}>
            ✕
          </button>
        </header>
        {doneMsg ? (
          <div className="xx-membership-pay-sheet__body">
            <p className="text-sm leading-relaxed text-[var(--shell-text)]">{doneMsg}</p>
            <button
              type="button"
              className="xx-membership-cta xx-membership-cta--primary mt-4 w-full"
              onClick={() => {
                onClose()
              }}
            >
              完成
            </button>
          </div>
        ) : (
          <div className="xx-membership-pay-sheet__body">
            <p className="text-sm text-[var(--shell-muted)]">
              应付金额：
              <strong className="text-[var(--shell-text)] ml-1">¥{yuanLabel(order.amountCents)}</strong>
            </p>
            <p className="text-sm font-medium text-[var(--shell-text)] mt-3 flex items-center gap-2">
              <PaymentChannelIcon channel={channel} />
              {channelLabel(channel)}
            </p>
            <div className="xx-membership-pay-sheet__qr-wrap">
              {prepayLoading ? (
                <p className="text-sm text-[var(--shell-muted)] py-8 text-center">正在加载支付码…</p>
              ) : payPageUrl ? (
                <div className="xx-membership-pay-sheet__alipay-shell">
                  <iframe
                    src={payPageUrl}
                    title={`${channelLabel(channel)}扫码支付`}
                    className="xx-membership-pay-sheet__alipay-frame"
                    scrolling="no"
                  />
                </div>
              ) : qrDataUrl ? (
                <img src={qrDataUrl} alt={`${channelLabel(channel)}扫码支付`} className="xx-membership-pay-sheet__qr" />
              ) : (
                <p className="text-sm text-[var(--shell-muted)] py-8 text-center">暂无支付码</p>
              )}
            </div>
            <p className="text-xs text-[var(--shell-muted)]">{scanHint}</p>
            <button
              type="button"
              className="xx-membership-cta xx-membership-cta--primary w-full"
              disabled={busy || prepayLoading}
              onClick={() => void onCompletedPayClick()}
            >
              {busy ? '查询中…' : '我已完成支付'}
            </button>
            <Link
              to={myOrdersPath({ tab: 'recharge', outTradeNo: outTradeNo || order.outTradeNo })}
              className="mt-2 block text-center text-xs text-violet-600 hover:underline"
              onClick={onClose}
            >
              返回我的订单
            </Link>
            {err ? <p className="text-sm text-red-600 mt-2">{err}</p> : null}
          </div>
        )}
      </div>
    </div>
  )
}
