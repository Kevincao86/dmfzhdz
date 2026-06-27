import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  MP_PERMISSION_DEFS,
  MP_PLAN_PAGE_META,
  MP_PLAN_TIER_TAGLINE,
  normalizeMpMembershipTier,
  planFeatureDetail,
  planFeatureDisplayIcon,
  resolvePlanVersionLabel,
  type MpLibraryRole,
  type MpMembershipPlanVersion,
} from '@merchant/lib/mpMembershipCatalog'
import { fetchMembershipPlanVersions, submitMembershipPlanCheckout } from '../lib/mpMembershipApi'
import { fetchRegistryProfile } from '../lib/mpApi'
import { getWorkIdentity, WORK_EDITION_LABEL, type MpWorkIdentity } from '../lib/mpWorkIdentity'
import { resolveShellDisplayName } from '../lib/shellDisplayName'
import { getActiveRole } from '../lib/mpSession'

const TIER_HEAD_CLASS: Record<string, string> = {
  basic: 'xx-membership-card__head--basic',
  pro: 'xx-membership-card__head--pro',
  flagship: 'xx-membership-card__head--flagship',
  enterprise: 'xx-membership-card__head--ent',
}

function workRoleFromIdentity(id: MpWorkIdentity): MpLibraryRole {
  return id
}

function formatPriceBlock(plan: MpMembershipPlanVersion) {
  const monthly = plan.priceMonthlyYuan
  const yearly = plan.priceYearlyYuan
  if ((monthly == null || monthly === 0) && (yearly == null || yearly === 0)) {
    return { main: '免费', sub: '永久免费', isFree: true }
  }
  const main =
    monthly != null && monthly > 0 ? (
      <>
        ¥{monthly}
        <span>/月</span>
      </>
    ) : yearly != null && yearly > 0 ? (
      <>
        ¥{yearly}
        <span>/年</span>
      </>
    ) : (
      '免费'
    )
  const sub =
    yearly != null && yearly > 0 && monthly != null && monthly > 0
      ? `年付 ¥${yearly.toLocaleString('zh-CN')}`
      : plan.id === 'enterprise' && yearly != null && yearly > 0
        ? `年付 ¥${yearly.toLocaleString('zh-CN')}/席位`
        : ''
  return { main, sub, isFree: false }
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
}

function MembershipPaySheet({ open, plan, role, onClose }: PaySheetProps) {
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly')
  const [channel, setChannel] = useState<'wechat' | 'alipay' | ''>('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [doneMsg, setDoneMsg] = useState('')

  useEffect(() => {
    if (open) {
      setBilling('monthly')
      setChannel('')
      setErr('')
      setDoneMsg('')
      setBusy(false)
    }
  }, [open, plan?.id])

  if (!open || !plan) return null

  const amountYuan =
    billing === 'yearly' ? plan.priceYearlyYuan : plan.priceMonthlyYuan
  const canYearly = plan.priceYearlyYuan != null && plan.priceYearlyYuan > 0

  async function onSubmit() {
    if (!channel) {
      setErr('请选择支付方式')
      return
    }
    if (billing === 'yearly' && !canYearly) {
      setErr('该档位不提供年付')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const out = await submitMembershipPlanCheckout({
        workRole: role,
        planId: plan!.id,
        billing,
        channel,
        displayName: resolveShellDisplayName(),
      })
      setDoneMsg(out.message)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

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
            <button type="button" className="xx-membership-cta xx-membership-cta--primary mt-4" onClick={onClose}>
              知道了
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
              <button
                type="button"
                className={channel === 'wechat' ? 'is-active' : ''}
                onClick={() => setChannel('wechat')}
              >
                <img src="/subscription/wechat-pay-qr.png" alt="" />
                微信支付
              </button>
              <button
                type="button"
                className={channel === 'alipay' ? 'is-active' : ''}
                onClick={() => setChannel('alipay')}
              >
                <img src="/subscription/alipay-qr.png" alt="" />
                支付宝
              </button>
            </div>
            <p className="text-xs text-[var(--shell-muted)]">
              扫码支付后请在此选择对应渠道并提交；运营核对后将开通会员，与电脑端约 20 秒内同步。
            </p>
            {err ? <p className="text-sm text-red-600">{err}</p> : null}
            <button
              type="button"
              className="xx-membership-cta xx-membership-cta--primary w-full"
              disabled={busy}
              onClick={() => void onSubmit()}
            >
              {busy ? '提交中…' : '提交支付申报'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function XingxuanMembershipPage() {
  const workId = getWorkIdentity()
  const role = workRoleFromIdentity(workId)
  const meta = MP_PLAN_PAGE_META[role]
  const permissionDefs = MP_PERMISSION_DEFS[role]

  const [versions, setVersions] = useState<MpMembershipPlanVersion[]>([])
  const [currentPlan, setCurrentPlan] = useState('basic')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [payPlan, setPayPlan] = useState<MpMembershipPlanVersion | null>(null)

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
        const activeRole = getActiveRole()
        const plan =
          activeRole === 'pr'
            ? String(profile.prProfile?.mpMembershipPlan || profile.mpMembershipPlan || 'basic')
            : String(
                profile.talentMember?.mpMembershipPlan || profile.mpMembershipPlan || 'basic',
              )
        setCurrentPlan(plan.trim() || 'basic')
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
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-[var(--shell-muted)] py-8 text-center">加载会员方案…</p>
      ) : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      {!loading && !err ? (
        <>
          <div className="xx-membership-grid">
            {versions.map((plan) => {
              const tier = normalizeMpMembershipTier(plan.id)
              const tagline = MP_PLAN_TIER_TAGLINE[role][tier]
              const price = formatPriceBlock(plan)
              const isCurrent = plan.id === currentPlan
              const isRecommended = tier === 'pro'
              const headClass = TIER_HEAD_CLASS[tier] || TIER_HEAD_CLASS.basic

              return (
                <article
                  key={plan.id}
                  className={`xx-membership-card surface-card ${isRecommended ? 'xx-membership-card--rec' : ''}`}
                >
                  <div className={`xx-membership-card__head ${headClass}`}>
                    {isRecommended ? <span className="xx-membership-card__badge">推荐</span> : null}
                    <h2 className="xx-membership-card__name">{plan.name}</h2>
                    <p className="xx-membership-card__audience">{tagline}</p>
                    <div className={`xx-membership-card__price ${price.isFree ? 'is-free' : ''}`}>
                      {price.main}
                    </div>
                    {price.sub ? <p className="xx-membership-card__year">{price.sub}</p> : null}
                  </div>
                  <div className="xx-membership-card__body">
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
      />
    </div>
  )
}
