import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  MP_POINTS_ARTICLE_PER_USE,
  MP_POINTS_BRIEF_PER_USE,
  MP_POINTS_VIDEO_PER_MIN,
  MP_RECHARGE_POINTS_PER_YUAN,
  MP_RECHARGE_TIER_PRESETS,
  computeRechargePoints,
  formatPointsEquivalentsLine,
} from '@merchant/lib/mpPointsEconomics'
import { fetchRegistryProfile } from '../lib/mpApi'
import { createPointsWechatPrepay, createPointsAlipayPrepay, createPointsDouyinPrepay, pollPointsPay, type MpPointsPayChannel } from '../lib/mpPointsApi'
import { buildMembershipPayQrDataUrl } from '../lib/wechatPayQrDataUrl'
import { PaymentChannelIcon } from '../components/PaymentChannelIcon'
import { getWorkIdentity, WORK_EDITION_LABEL, type MpWorkIdentity } from '../lib/mpWorkIdentity'
import type { MpLibraryRole } from '@merchant/lib/mpMembershipCatalog'
import { myOrdersPath } from '../lib/mpMyOrdersApi'

function workRoleFromIdentity(id: MpWorkIdentity): MpLibraryRole {
  return id
}

function yuanLabel(cents: number): string {
  return (cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

type PaySheetProps = {
  open: boolean
  points: number
  amountCents: number
  role: MpLibraryRole
  onClose: () => void
  onPaid?: (newBalance?: number) => void
  onGoMyOrders: (outTradeNo?: string) => void
}

const PAY_CHANNELS: { id: MpPointsPayChannel; label: string }[] = [
  { id: 'wechat', label: '微信支付' },
  { id: 'douyin', label: '抖音支付' },
  { id: 'alipay', label: '支付宝' },
]

async function resolvePayQrDisplay(qrText: string, channel: MpPointsPayChannel): Promise<string> {
  const text = String(qrText || '').trim()
  if (!text) return ''
  if (/^data:image\//i.test(text)) return text
  return buildMembershipPayQrDataUrl(text, channel)
}

function PointsPaySheet({ open, points, amountCents, role, onClose, onPaid, onGoMyOrders }: PaySheetProps) {
  const [channel, setChannel] = useState<MpPointsPayChannel>('wechat')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [doneMsg, setDoneMsg] = useState('')
  const [prepayLoading, setPrepayLoading] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [payPageUrl, setPayPageUrl] = useState('')
  const [outTradeNo, setOutTradeNo] = useState('')

  useEffect(() => {
    if (open) {
      setChannel('wechat')
      setErr('')
      setDoneMsg('')
      setBusy(false)
      setPrepayLoading(false)
      setQrDataUrl('')
      setPayPageUrl('')
      setOutTradeNo('')
    }
  }, [open, points])

  useEffect(() => {
    if (!open || points <= 0) return

    let cancelled = false
    void (async () => {
      setPrepayLoading(true)
      setErr('')
      setQrDataUrl('')
      setPayPageUrl('')
      setOutTradeNo('')
      try {
        const prepayBody = { workRole: role, points }
        let qrText = ''
        let pageUrl = ''
        let tradeNo = ''
        if (channel === 'alipay') {
          const prepay = await createPointsAlipayPrepay(prepayBody)
          qrText = prepay.qrCode || ''
          pageUrl = qrText ? '' : prepay.payPageUrl || ''
          tradeNo = prepay.outTradeNo
        } else if (channel === 'douyin') {
          const prepay = await createPointsDouyinPrepay(prepayBody)
          qrText = prepay.qrCode
          tradeNo = prepay.outTradeNo
        } else {
          const prepay = await createPointsWechatPrepay(prepayBody)
          qrText = prepay.codeUrl
          tradeNo = prepay.outTradeNo
        }
        if (cancelled) return
        setPayPageUrl(pageUrl)
        const dataUrl = pageUrl ? '' : await resolvePayQrDisplay(qrText, channel)
        if (cancelled) return
        setQrDataUrl(dataUrl)
        setOutTradeNo(tradeNo)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setPrepayLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, points, role, channel])

  useEffect(() => {
    if (!open || !outTradeNo || doneMsg) return

    let stopped = false
    const tick = async () => {
      try {
        const result = await pollPointsPay(channel, outTradeNo)
        if (stopped || result.status !== 'paid') return
        setDoneMsg(result.message)
        onPaid?.(result.newBalance)
      } catch {
        /* 轮询偶发失败忽略 */
      }
    }

    const id = window.setInterval(() => void tick(), 3000)
    return () => {
      stopped = true
      window.clearInterval(id)
    }
  }, [open, outTradeNo, doneMsg, onPaid, channel])

  if (!open) return null

  async function onCompletedPayClick() {
    if (outTradeNo) {
      setBusy(true)
      setErr('')
      try {
        const result = await pollPointsPay(channel, outTradeNo)
        if (result.status === 'paid') {
          onPaid?.(result.newBalance)
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    }
    onClose()
    onGoMyOrders(outTradeNo || undefined)
  }

  const channelMeta = PAY_CHANNELS.find((c) => c.id === channel)!
  const scanHint =
    channel === 'alipay'
      ? '请使用支付宝扫一扫完成支付；支付成功后积分将自动到账，约 20 秒内与电脑端同步。'
      : channel === 'douyin'
        ? '请使用抖音扫一扫完成支付；支付成功后积分将自动到账，约 20 秒内与电脑端同步。'
        : '请使用微信扫一扫完成支付；支付成功后积分将自动到账，约 20 秒内与电脑端同步。'

  return (
    <div className="xx-membership-pay-backdrop" role="presentation" onClick={onClose}>
      <div
        className="xx-membership-pay-sheet surface-card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="xx-membership-pay-sheet__head">
          <h3>充值 {points.toLocaleString('zh-CN')} 积分</h3>
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
                onGoMyOrders(outTradeNo || undefined)
              }}
            >
              查看我的订单
            </button>
          </div>
        ) : (
          <div className="xx-membership-pay-sheet__body">
            <p className="text-sm text-[var(--shell-muted)]">
              应付金额：
              <strong className="text-[var(--shell-text)] ml-1">¥{yuanLabel(amountCents)}</strong>
            </p>
            <p className="text-xs text-[var(--shell-muted)] mt-1">{formatPointsEquivalentsLine(points)}</p>
            <div className="xx-membership-pay-sheet__channels mt-4">
              {PAY_CHANNELS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={channel === c.id ? 'is-active' : ''}
                  onClick={() => setChannel(c.id)}
                >
                  <PaymentChannelIcon channel={c.id} />
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
            <p className="text-sm font-medium text-[var(--shell-text)]">{channelMeta.label}</p>
            <div className="xx-membership-pay-sheet__qr-wrap">
              {prepayLoading ? (
                <p className="text-sm text-[var(--shell-muted)] py-8 text-center">
                  正在生成{channelMeta.label}码…
                </p>
              ) : payPageUrl ? (
                <div className="xx-membership-pay-sheet__alipay-shell">
                  <iframe
                    src={payPageUrl}
                    title={`${channelMeta.label}扫码支付`}
                    className="xx-membership-pay-sheet__alipay-frame"
                    scrolling="no"
                  />
                </div>
              ) : qrDataUrl ? (
                <img src={qrDataUrl} alt={`${channelMeta.label}扫码支付`} className="xx-membership-pay-sheet__qr" />
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
              {busy ? '查询中…' : '我已完成支付，查看我的订单'}
            </button>
            <Link
              to={myOrdersPath({ tab: 'points', outTradeNo: outTradeNo || undefined })}
              className="mt-2 block text-center text-xs text-violet-600 hover:underline"
              onClick={onClose}
            >
              直接前往我的订单
            </Link>
            {err ? <p className="text-sm text-red-600 mt-2">{err}</p> : null}
          </div>
        )}
      </div>
    </div>
  )
}

export default function XingxuanPointsRechargePage() {
  const navigate = useNavigate()
  const workId = getWorkIdentity()
  const role = workRoleFromIdentity(workId)

  const [balance, setBalance] = useState(0)
  const [pointsSummary, setPointsSummary] = useState<{
    monthlyGiftQuota: number
    monthlySpent: number
    packageRemaining: number
    rechargeBalance: number
    membershipExpired: boolean
    membershipExpiresAt?: string
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [customYuan, setCustomYuan] = useState('')
  const [selectedPoints, setSelectedPoints] = useState<number | null>(null)
  const [selectedCents, setSelectedCents] = useState(0)
  const [payOpen, setPayOpen] = useState(false)

  const customPoints = useMemo(() => {
    const y = Number(customYuan)
    if (!Number.isFinite(y) || y < 1) return 0
    return computeRechargePoints(y)
  }, [customYuan])

  async function refreshBalance() {
    setLoading(true)
    setErr('')
    try {
      const profile = await fetchRegistryProfile()
      setBalance(Math.max(0, Math.floor(Number(profile.mpAiPointsBalance) || 0)))
      const s = profile.mpAiPointsSummary
      if (s) {
        setPointsSummary({
          monthlyGiftQuota: s.monthlyGiftQuota,
          monthlySpent: s.monthlySpent,
          packageRemaining: s.packageRemaining,
          rechargeBalance: s.rechargeBalance,
          membershipExpired: s.membershipExpired,
          membershipExpiresAt: s.membershipExpiresAt,
        })
      } else {
        setPointsSummary(null)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refreshBalance()
  }, [])

  function openPreset(points: number, yuan: number) {
    setSelectedPoints(points)
    setSelectedCents(Math.round(yuan * 100))
    setPayOpen(true)
  }

  function openCustom() {
    if (customPoints <= 0) {
      setErr('请输入不少于 ¥1 的整数金额')
      return
    }
    setErr('')
    setSelectedPoints(customPoints)
    setSelectedCents(Math.round(Number(customYuan) * 100))
    setPayOpen(true)
  }

  return (
    <div className="page-content-shell xx-membership-page">
      <header className="xx-membership-page__header">
        <div>
          <Link to="/profile" className="text-sm text-[var(--shell-muted)] hover:text-[var(--shell-text)]">
            ← 返回我的
          </Link>
          <h1 className="xx-membership-page__title">积分充值</h1>
          <p className="xx-membership-page__subtitle">
            ¥1 = {MP_RECHARGE_POINTS_PER_YUAN} 积分 · 视频 {MP_POINTS_VIDEO_PER_MIN} 积分/分钟 · 文稿{' '}
            {MP_POINTS_ARTICLE_PER_USE} 积分/次 · Brief {MP_POINTS_BRIEF_PER_USE} 积分/篇
          </p>
          <p className="text-sm text-[var(--shell-muted)] mt-2">
            当前余额：
            <strong className="text-[var(--shell-text)] ml-1">
              {loading ? '…' : balance.toLocaleString('zh-CN')} 积分
            </strong>
            <span className="ml-2 text-xs">（{WORK_EDITION_LABEL[workId]}）</span>
          </p>
          {pointsSummary && !loading ? (
            <div className="text-sm text-[var(--shell-muted)] mt-2 space-y-1">
              <p>
                本月套餐赠送额度：
                <strong className="text-[var(--shell-text)] ml-1">
                  {pointsSummary.monthlyGiftQuota.toLocaleString('zh-CN')} 积分
                </strong>
                <span className="ml-2 text-xs">· 本月已用 {pointsSummary.monthlySpent.toLocaleString('zh-CN')} 积分</span>
              </p>
              <p>
                套餐内剩余额度：
                <strong className="text-[var(--shell-text)] ml-1">
                  {pointsSummary.packageRemaining.toLocaleString('zh-CN')} 积分
                </strong>
                <span className="ml-2 text-xs">
                  · 充值积分 {pointsSummary.rechargeBalance.toLocaleString('zh-CN')}
                </span>
              </p>
              {pointsSummary.membershipExpiresAt ? (
                <p className="text-xs">
                  会员有效期至 {new Date(pointsSummary.membershipExpiresAt).toLocaleString('zh-CN')}
                  {pointsSummary.membershipExpired ? (
                    <span className="text-amber-600 ml-1">（已过期，按基础版权益计费）</span>
                  ) : null}
                </p>
              ) : null}
              <p className="text-xs opacity-80">
                消耗顺序：优先扣套餐额度，套餐用完后扣充值积分。
              </p>
            </div>
          ) : null}
          <p className="text-sm text-[var(--shell-muted)] mt-1">
            <Link to="/profile/membership" className="text-violet-600 hover:underline">
              会员赠送积分
            </Link>
            <span className="mx-2">·</span>
            <Link to={myOrdersPath({ tab: 'points' })} className="text-violet-600 hover:underline">
              充值记录
            </Link>
          </p>
        </div>
      </header>

      {err && !payOpen ? <p className="text-sm text-red-600 mb-4">{err}</p> : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {MP_RECHARGE_TIER_PRESETS.map((tier) => (
          <button
            key={tier.yuan}
            type="button"
            className="surface-card rounded-xl border border-[var(--shell-border)] p-4 text-left hover:border-violet-400 hover:shadow-md transition"
            onClick={() => openPreset(tier.points, tier.yuan)}
          >
            <p className="text-xs font-semibold text-violet-700">{tier.label}</p>
            <p className="mt-2 text-2xl font-bold text-[var(--shell-text)]">
              {tier.points.toLocaleString('zh-CN')}
              <span className="text-sm font-medium text-[var(--shell-muted)] ml-1">积分</span>
            </p>
            <p className="mt-1 text-sm flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              {tier.listPriceYuan != null && tier.listPriceYuan > tier.yuan ? (
                <>
                  <span className="line-through text-[var(--shell-muted)]">¥{tier.listPriceYuan}</span>
                  <span className="text-rose-600 font-semibold">¥{tier.yuan}</span>
                  <span className="text-[10px] font-medium text-rose-500 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded">
                    优惠
                  </span>
                </>
              ) : (
                <span className="text-[var(--shell-muted)]">¥{tier.yuan}</span>
              )}
            </p>
            <p className="mt-2 text-[11px] text-[var(--shell-muted)] leading-snug">
              {formatPointsEquivalentsLine(tier.points)}
            </p>
          </button>
        ))}
      </section>

      <section className="surface-card rounded-xl border border-[var(--shell-border)] p-4">
        <h2 className="text-sm font-semibold text-[var(--shell-text)]">自定义金额</h2>
        <p className="text-xs text-[var(--shell-muted)] mt-1">输入整数元（最低 ¥1），按 ¥1 = {MP_RECHARGE_POINTS_PER_YUAN} 积分换算</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--shell-muted)]">充值金额（元）</span>
            <input
              type="number"
              min={1}
              step={1}
              value={customYuan}
              onChange={(e) => setCustomYuan(e.target.value.replace(/[^\d]/g, ''))}
              className="w-40 rounded-lg border border-[var(--shell-border)] bg-[var(--shell-bg)] px-3 py-2"
              placeholder="例如 30"
            />
          </label>
          <div className="text-sm text-[var(--shell-muted)] pb-2">
            {customPoints > 0 ? (
              <>
                可得 <strong className="text-[var(--shell-text)]">{customPoints.toLocaleString('zh-CN')}</strong> 积分
              </>
            ) : (
              '—'
            )}
          </div>
          <button
            type="button"
            className="xx-membership-cta xx-membership-cta--primary"
            disabled={customPoints <= 0}
            onClick={openCustom}
          >
            去支付
          </button>
        </div>
      </section>

      <PointsPaySheet
        open={payOpen && selectedPoints != null && selectedPoints > 0}
        points={selectedPoints || 0}
        amountCents={selectedCents}
        role={role}
        onClose={() => setPayOpen(false)}
        onPaid={(newBalance) => {
          if (newBalance != null) setBalance(newBalance)
          else void refreshBalance()
        }}
        onGoMyOrders={(tradeNo) => navigate(myOrdersPath({ tab: 'points', outTradeNo: tradeNo }))}
      />
    </div>
  )
}
