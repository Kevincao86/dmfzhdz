import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  MP_PERMISSION_DEFS,
  MP_PLAN_PAGE_META,
  MP_PLAN_TIER_TAGLINE,
  normalizeMpMembershipTier,
  planFeatureDetail,
  planFeatureDisplayIcon,
  planGiftPointsDetail,
  resolvePlanGiftPoints,
  resolveMpPermissionRows,
  resolvePlanVersionLabel,
  computeMembershipDiscountPct,
  formatMembershipPromoCountdown,
  isMembershipPromoActive,
  resolveEffectivePlanPriceYuan,
  type MpLibraryRole,
  type MpMembershipPlanVersion,
} from '@merchant/lib/mpMembershipCatalog'
import { fetchMembershipPlanVersions, createMembershipWechatPrepay, createMembershipAlipayPrepay, createMembershipDouyinPrepay, pollMembershipPay, type MpMembershipPayChannel } from '../lib/mpMembershipApi'
import { PaymentChannelIcon } from '../components/PaymentChannelIcon'
import { buildWechatPayQrDataUrl } from '../lib/wechatPayQrDataUrl'
import { fetchRegistryProfile } from '../lib/mpApi'
import { getWorkIdentity, WORK_EDITION_LABEL, type MpWorkIdentity } from '../lib/mpWorkIdentity'
import { getActiveRole } from '../lib/mpSession'
import { myOrdersPath } from '../lib/mpMyOrdersApi'

const TIER_HEAD_CLASS: Record<string, string> = {
  basic: 'xx-membership-card__head--basic',
  pro: 'xx-membership-card__head--pro',
  flagship: 'xx-membership-card__head--flagship',
  enterprise: 'xx-membership-card__head--ent',
}

function workRoleFromIdentity(id: MpWorkIdentity): MpLibraryRole {
  return id
}

function formatPriceBlock(plan: MpMembershipPlanVersion, nowMs = Date.now()) {
  const monthly = plan.priceMonthlyYuan
  const yearly = plan.priceYearlyYuan
  if ((monthly == null || monthly === 0) && (yearly == null || yearly === 0)) {
    return { main: '免费', sub: '永久免费', isFree: true, listMain: '', discountLabel: '', promoCountdown: '' }
  }
  const promo = isMembershipPromoActive(plan, nowMs)
  const effMonthly = resolveEffectivePlanPriceYuan(plan, 'monthly', nowMs)
  const effYearly = resolveEffectivePlanPriceYuan(plan, 'yearly', nowMs)
  const listM = plan.listPriceMonthlyYuan
  const showListM = promo && listM != null && effMonthly != null && listM > effMonthly
  const main =
    effMonthly != null && effMonthly > 0 ? (
      <>
        ¥{effMonthly}
        <span>/月</span>
      </>
    ) : effYearly != null && effYearly > 0 ? (
      <>
        ¥{effYearly}
        <span>/年</span>
      </>
    ) : (
      '免费'
    )
  const listMain =
    showListM && listM != null ? (
      <>
        ¥{listM}
        <span>/月</span>
      </>
    ) : null
  const sub =
    effYearly != null && effYearly > 0 && effMonthly != null && effMonthly > 0
      ? `年付 ¥${effYearly.toLocaleString('zh-CN')}`
      : plan.id === 'enterprise' && effYearly != null && effYearly > 0
        ? `年付 ¥${effYearly.toLocaleString('zh-CN')}/席位`
        : ''
  const pct = computeMembershipDiscountPct(listM, effMonthly)
  const discountLabel =
    pct != null && showListM
      ? `${pct % 10 === 0 ? pct / 10 : (pct / 10).toFixed(1)}折`
      : promo
        ? String(plan.promoBadge || '').trim()
        : ''
  const promoCountdown = promo ? formatMembershipPromoCountdown(plan.promoEndsAt, nowMs) : ''
  return { main, sub, listMain, isFree: false, discountLabel, promoCountdown }
}

function FeatureIcon({ kind }: { kind: 'yes' | 'no' | 'partial' }) {
  if (kind === 'yes') return <span className="xx-membership-feat__icon xx-membership-feat__icon--yes">✓</span>
  if (kind === 'partial') return <span className="xx-membership-feat__icon xx-membership-feat__icon--partial">◐</span>
  return <span className="xx-membership-feat__icon xx-membership-feat__icon--no">✕</span>
}

type PaySheetProps = {
  open: boolean
  plan: MpMembershipPlanVersion | null
  role: MpLibraryRole
  onClose: () => void
  onPaid?: () => void
  onGoMyOrders: (outTradeNo?: string) => void
}

const PAY_CHANNELS: { id: MpMembershipPayChannel; label: string }[] = [
  { id: 'wechat', label: '微信支付' },
  { id: 'douyin', label: '抖音支付' },
  { id: 'alipay', label: '支付宝' },
]

async function resolvePayQrDisplay(qrText: string): Promise<string> {
  const text = String(qrText || '').trim()
  if (!text) return ''
  // 仅 data URL 可直接作 img src；weixin:// / https://qr.* 等须生成二维码
  if (/^data:image\//i.test(text)) return text
  return buildWechatPayQrDataUrl(text)
}

function MembershipPaySheet({ open, plan, role, onClose, onPaid, onGoMyOrders }: PaySheetProps) {
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly')
  const [channel, setChannel] = useState<MpMembershipPayChannel>('wechat')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [doneMsg, setDoneMsg] = useState('')
  const [prepayLoading, setPrepayLoading] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [payPageUrl, setPayPageUrl] = useState('')
  const [outTradeNo, setOutTradeNo] = useState('')

  useEffect(() => {
    if (open) {
      setBilling('monthly')
      setChannel('wechat')
      setErr('')
      setDoneMsg('')
      setBusy(false)
      setPrepayLoading(false)
      setQrDataUrl('')
      setPayPageUrl('')
      setOutTradeNo('')
    }
  }, [open, plan?.id])

  useEffect(() => {
    if (!open || !plan) return
    if (billing === 'yearly' && (plan.priceYearlyYuan == null || plan.priceYearlyYuan <= 0)) return

    let cancelled = false
    void (async () => {
      setPrepayLoading(true)
      setErr('')
      setQrDataUrl('')
      setPayPageUrl('')
      setOutTradeNo('')
      try {
        const prepayBody = { workRole: role, planId: plan.id, billing }
        let qrText = ''
        let pageUrl = ''
        let tradeNo = ''
        if (channel === 'alipay') {
          const prepay = await createMembershipAlipayPrepay(prepayBody)
          qrText = prepay.qrCode || ''
          pageUrl = prepay.payPageUrl || ''
          tradeNo = prepay.outTradeNo
        } else if (channel === 'douyin') {
          const prepay = await createMembershipDouyinPrepay(prepayBody)
          qrText = prepay.qrCode
          tradeNo = prepay.outTradeNo
        } else {
          const prepay = await createMembershipWechatPrepay(prepayBody)
          qrText = prepay.codeUrl
          tradeNo = prepay.outTradeNo
        }
        if (cancelled) return
        setPayPageUrl(pageUrl)
        const dataUrl = pageUrl ? '' : await resolvePayQrDisplay(qrText)
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
  }, [open, plan, role, billing, channel])

  useEffect(() => {
    if (!open || !outTradeNo || doneMsg) return

    let stopped = false
    const tick = async () => {
      try {
        const result = await pollMembershipPay(channel, outTradeNo)
        if (stopped || result.status !== 'paid') return
        setDoneMsg(result.message)
        onPaid?.()
      } catch {
        /* 轮询偶发失败忽略，下次继续 */
      }
    }

    const id = window.setInterval(() => void tick(), 3000)
    return () => {
      stopped = true
      window.clearInterval(id)
    }
  }, [open, outTradeNo, doneMsg, onPaid, channel])

  if (!open || !plan) return null

  const amountYuan = plan ? resolveEffectivePlanPriceYuan(plan, billing) : null
  const canYearly = plan.priceYearlyYuan != null && plan.priceYearlyYuan > 0

  async function onCompletedPayClick() {
    if (outTradeNo) {
      setBusy(true)
      setErr('')
      try {
        const result = await pollMembershipPay(channel, outTradeNo)
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
    onGoMyOrders(outTradeNo || undefined)
  }

  const channelMeta = PAY_CHANNELS.find((c) => c.id === channel)!
  const scanHint =
    channel === 'alipay'
      ? '请使用支付宝扫一扫完成支付；支付成功后将自动开通会员，约 20 秒内与电脑端同步。'
      : channel === 'douyin'
        ? '请使用抖音扫一扫完成支付；支付成功后将自动开通会员，约 20 秒内与电脑端同步。'
        : '请使用微信扫一扫完成支付；支付成功后将自动开通会员，约 20 秒内与电脑端同步。'

  return (
    <div className="xx-membership-pay-backdrop" role="presentation" onClick={onClose}>
      <div
        className="xx-membership-pay-sheet surface-card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="xx-membership-pay-sheet__head">
          <h3>开通 {plan.name}</h3>
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
              <strong className="text-[var(--shell-text)] ml-1">
                ¥{amountYuan != null && amountYuan > 0 ? amountYuan : '—'}
              </strong>
            </p>
            <div className="xx-membership-pay-sheet__billing">
              <button
                type="button"
                className={billing === 'monthly' ? 'is-active' : ''}
                onClick={() => setBilling('monthly')}
              >
                月付
              </button>
              {canYearly ? (
                <button
                  type="button"
                  className={billing === 'yearly' ? 'is-active' : ''}
                  onClick={() => setBilling('yearly')}
                >
                  年付
                </button>
              ) : null}
            </div>
            <div className="xx-membership-pay-sheet__channels">
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
                <iframe
                  src={payPageUrl}
                  title={`${channelMeta.label}扫码支付`}
                  className="xx-membership-pay-sheet__qr xx-membership-pay-sheet__alipay-frame"
                />
              ) : qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`${channelMeta.label}扫码支付`}
                  className="xx-membership-pay-sheet__qr"
                />
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
              to={myOrdersPath({ tab: 'membership', outTradeNo: outTradeNo || undefined })}
              className="mt-2 block text-center text-xs text-violet-600 hover:underline"
              onClick={onClose}
            >
              直接前往我的订单
            </Link>
            {err ? <p className="text-sm text-red-600">{err}</p> : null}
          </div>
        )}
      </div>
    </div>
  )
}

function fmtExpiryLabel(planId: string, expiresAt?: string): string {
  const plan = String(planId || 'basic').trim() || 'basic'
  if (plan === 'basic') return '永久免费'
  if (!expiresAt) return '未记录'
  const d = new Date(expiresAt)
  if (Number.isNaN(d.getTime())) return '未记录'
  const text = d.toLocaleString('zh-CN', { hour12: false })
  return d.getTime() > Date.now() ? text : `${text}（已过期）`
}

export default function XingxuanMembershipPage() {
  const navigate = useNavigate()
  const workId = getWorkIdentity()
  const role = workRoleFromIdentity(workId)
  const meta = MP_PLAN_PAGE_META[role]
  const permissionDefs = MP_PERMISSION_DEFS[role]

  const [versions, setVersions] = useState<MpMembershipPlanVersion[]>([])
  const [currentPlan, setCurrentPlan] = useState('basic')
  const [currentExpiresAt, setCurrentExpiresAt] = useState<string | undefined>()
  const [profileAccess, setProfileAccess] = useState<{
    mpMembershipPlan?: string
    mpFeatureAccess?: { addons?: boolean; recommendHall?: boolean }
    prFeatureAccess?: { addons?: boolean; recommendHall?: boolean }
  }>({})
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [payPlan, setPayPlan] = useState<MpMembershipPlanVersion | null>(null)
  const [hoverPlanId, setHoverPlanId] = useState<string | null>(null)
  const [promoTick, setPromoTick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setPromoTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const nowMs = Date.now()
  void promoTick

  const highlightPlanId = hoverPlanId ?? payPlan?.id ?? null

  function applyProfilePlan(profile: Awaited<ReturnType<typeof fetchRegistryProfile>>) {
    const activeRole = getActiveRole()
    const plan =
      activeRole === 'pr'
        ? String(profile.prProfile?.mpMembershipPlan || profile.mpMembershipPlan || 'basic')
        : String(profile.talentMember?.mpMembershipPlan || profile.mpMembershipPlan || 'basic')
    const expires =
      activeRole === 'pr'
        ? String(profile.prProfile?.mpMembershipExpiresAt || profile.mpMembershipExpiresAt || '').trim() ||
          undefined
        : String(profile.talentMember?.mpMembershipExpiresAt || profile.mpMembershipExpiresAt || '').trim() ||
          undefined
    setCurrentPlan(plan.trim() || 'basic')
    setCurrentExpiresAt(expires)
    setProfileAccess(
      activeRole === 'pr'
        ? { mpMembershipPlan: plan, prFeatureAccess: profile.prFeatureAccess }
        : { mpMembershipPlan: plan, mpFeatureAccess: profile.prFeatureAccess },
    )
  }

  useEffect(() => {
    void (async () => {
      setLoading(true)
      setErr('')
      try {
        const [plans, profile] = await Promise.all([
          fetchMembershipPlanVersions(role),
          fetchRegistryProfile(),
        ])
        setVersions(plans)
        applyProfilePlan(profile)
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [role])

  const groupedDefs = useMemo(() => {
    const map = new Map<string, typeof permissionDefs>()
    for (const def of permissionDefs) {
      const list = map.get(def.group) ?? []
      list.push(def)
      map.set(def.group, list)
    }
    return [...map.entries()]
  }, [permissionDefs])

  const activeBenefits = useMemo(() => {
    return resolveMpPermissionRows(role, profileAccess, versions).filter((row) => row.enabled)
  }, [role, profileAccess, versions])

  function refreshCurrentPlan() {
    void (async () => {
      try {
        await import('../lib/registryProfileSync').then((m) => m.pullRegistryProfileAfterLogin())
        const profile = await fetchRegistryProfile()
        applyProfilePlan(profile)
      } catch {
        /* 刷新失败不影响关闭弹窗 */
      }
    })()
  }

  function onOpenPlan(plan: MpMembershipPlanVersion) {
    const monthly = plan.priceMonthlyYuan
    const yearly = plan.priceYearlyYuan
    const isFree = (monthly == null || monthly === 0) && (yearly == null || yearly === 0)
    if (isFree || plan.id === currentPlan) return
    setPayPlan(plan)
  }

  return (
    <div className="page-content-shell xx-membership-page">
      <header className="xx-membership-page__header">
        <div>
          <Link to="/profile" className="text-sm text-[var(--shell-muted)] hover:text-[var(--shell-text)]">
            ← 返回我的
          </Link>
          <h1 className="xx-membership-page__title">{meta.title}</h1>
          <p className="xx-membership-page__subtitle">{meta.subtitle}</p>
          <p className="text-sm text-[var(--shell-muted)] mt-2">
            当前档位：
            <strong className="text-[var(--shell-text)] ml-1">
              {resolvePlanVersionLabel(currentPlan, versions)}
            </strong>
            <span className="ml-2 text-xs">（{WORK_EDITION_LABEL[workId]}）</span>
          </p>
          <p className="text-sm text-[var(--shell-muted)] mt-1">
            会员到期：
            <strong className="text-[var(--shell-text)] ml-1">{fmtExpiryLabel(currentPlan, currentExpiresAt)}</strong>
            <Link to={myOrdersPath({ tab: 'membership' })} className="ml-3 text-xs text-violet-600 hover:underline">
              我的订单
            </Link>
            <Link to="/profile/points-recharge" className="ml-3 text-xs text-violet-600 hover:underline">
              积分充值
            </Link>
          </p>
        </div>
      </header>

      {!loading && !err && activeBenefits.length > 0 ? (
        <section className="xx-membership-status-panel surface-card mb-6 p-4">
          <h2 className="text-sm font-semibold text-[var(--shell-text)]">当前开通权益</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {activeBenefits.map((row) => (
              <li key={row.key} className="flex items-start gap-2 text-sm text-[var(--shell-text)]">
                <span className="text-emerald-600">✓</span>
                <span>
                  {row.label}
                  {row.effective && row.effective !== '—' ? (
                    <span className="text-[var(--shell-muted)]"> · {row.effective}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--shell-muted)] py-8 text-center">加载会员方案…</p>
      ) : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      {!loading && !err ? (
        <>
          <div
            className={`xx-membership-grid${highlightPlanId ? ' xx-membership-grid--has-focus' : ''}`}
            onMouseLeave={() => setHoverPlanId(null)}
          >
            {versions.map((plan) => {
              const tier = normalizeMpMembershipTier(plan.id)
              const tagline = MP_PLAN_TIER_TAGLINE[role][tier]
              const price = formatPriceBlock(plan, nowMs)
              const isCurrent = plan.id === currentPlan
              const isRecommended = tier === 'pro'
              const headClass = TIER_HEAD_CLASS[tier] || TIER_HEAD_CLASS.basic
              const isFocused = highlightPlanId === plan.id
              const isDimmed = Boolean(highlightPlanId && highlightPlanId !== plan.id)

              return (
                <article
                  key={plan.id}
                  className={[
                    'xx-membership-card surface-card',
                    isRecommended ? 'xx-membership-card--rec' : '',
                    isCurrent ? 'xx-membership-card--current' : '',
                    isFocused ? 'xx-membership-card--focus' : '',
                    isDimmed ? 'xx-membership-card--dim' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onMouseEnter={() => setHoverPlanId(plan.id)}
                >
                  {isRecommended ? <span className="xx-membership-card__badge">推荐</span> : null}
                  <div className={`xx-membership-card__head ${headClass}`}>
                    <h2 className="xx-membership-card__name">{plan.name}</h2>
                    <p className="xx-membership-card__audience">{tagline}</p>
                    <div className={`xx-membership-card__price ${price.isFree ? 'is-free' : ''}`}>
                      {price.listMain ? (
                        <span className="xx-membership-card__price-list line-through opacity-60 text-sm mr-2">
                          {price.listMain}
                        </span>
                      ) : (
                        <span className="xx-membership-card__price-list is-empty" aria-hidden="true" />
                      )}
                      {price.main}
                    </div>
                    <p className={`xx-membership-card__discount ${price.discountLabel ? '' : 'is-empty'}`}>
                      {price.discountLabel || '\u00a0'}
                    </p>
                    <p className={`xx-membership-card__promo ${price.promoCountdown ? '' : 'is-empty'}`}>
                      {price.promoCountdown ? `限时优惠 ${price.promoCountdown}` : '\u00a0'}
                    </p>
                    {price.sub ? <p className="xx-membership-card__year">{price.sub}</p> : <p className="xx-membership-card__year is-empty" aria-hidden="true" />}
                  </div>
                  <div className="xx-membership-card__body">
                    {(() => {
                      const giftPts = resolvePlanGiftPoints(plan, role)
                      const giftLine = planGiftPointsDetail(plan, role)
                      if (!giftLine) return null
                      return (
                        <div className="mb-3 rounded-lg border border-violet-200/60 bg-violet-50/80 px-3 py-2 dark:border-violet-900/50 dark:bg-violet-950/30">
                          <p className="text-xs font-semibold text-violet-800 dark:text-violet-200">赠送积分</p>
                          <p className="text-sm font-bold text-violet-950 dark:text-violet-100 mt-0.5">
                            {giftPts.toLocaleString('zh-CN')} 积分/月
                          </p>
                          <p className="text-[11px] text-violet-700/90 dark:text-violet-300/90 mt-1 leading-snug">{giftLine.split(' · ').slice(1).join(' · ') || '可用于 AI 视频/文稿检核与 Brief'}</p>
                        </div>
                      )
                    })()}
                    {groupedDefs.map(([group, defs]) => (
                      <div key={group}>
                        <p className="xx-membership-card__section">{group}</p>
                        {defs.map((def) => {
                          const cell = plan.permissions[def.key]
                          const icon = planFeatureDisplayIcon(def, cell as never)
                          const detail = planFeatureDetail(def, cell as never)
                          return (
                            <div key={def.key} className={`xx-membership-feat xx-membership-feat--${icon}`}>
                              <FeatureIcon kind={icon} />
                              <span className="xx-membership-feat__text">
                                {def.label}
                                {detail ? <span className="xx-membership-feat__val"> · {detail}</span> : null}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                  <footer className="xx-membership-card__foot">
                    {isCurrent ? (
                      <span className="xx-membership-cta xx-membership-cta--current">当前档位</span>
                    ) : price.isFree ? (
                      <span className="xx-membership-cta xx-membership-cta--muted">免费档</span>
                    ) : (
                      <button
                        type="button"
                        className="xx-membership-cta xx-membership-cta--primary"
                        onClick={() => onOpenPlan(plan)}
                      >
                        开通 {plan.name}
                      </button>
                    )}
                  </footer>
                </article>
              )
            })}
          </div>
          <p className="xx-membership-footer-note">{meta.footerNote}</p>
        </>
      ) : null}

      <MembershipPaySheet
        open={!!payPlan}
        plan={payPlan}
        role={role}
        onClose={() => setPayPlan(null)}
        onPaid={refreshCurrentPlan}
        onGoMyOrders={(tradeNo) => navigate(myOrdersPath({ tab: 'membership', outTradeNo: tradeNo }))}
      />
    </div>
  )
}
