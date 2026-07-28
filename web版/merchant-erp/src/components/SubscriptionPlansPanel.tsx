import { Check, Crown, Sparkles, Star, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '../cn'
import {
  ERP_MONTHLY_GIFT_POINTS,
  ERP_RECHARGE_POINTS_PER_YUAN,
  formatErpPointsEquivalentsLine,
} from '../lib/erpPointsEconomics'
import {
  MEMBERSHIP_MONTHLY_YUAN,
  MEMBERSHIP_PLAN_LABELS,
  type MembershipPlan,
} from '../lib/membershipPlan'
import { SUBSCRIPTION_TIERS } from '../lib/meooPaymentTiers'
import {
  fetchEffectiveSubscriptionTiers,
  type EffectiveSubscriptionTier,
} from '../services/tenantBillingClient'

export type SubscriptionPlanCard = {
  plan: MembershipPlan
  tierIndex: number
  label: string
  priceYuan: number
  period: string
  badge?: string
  highlight?: boolean
  features: string[]
  giftPoints: number
  regionalMarkup?: boolean
}

function monthlyGiftFeature(plan: MembershipPlan): string {
  const pts = ERP_MONTHLY_GIFT_POINTS[plan]
  return `每月 ${pts.toLocaleString('zh-CN')} 积分（套餐桶）`
}

const PLAN_FEATURES: Record<MembershipPlan, string[]> = {
  free: [
    '商品 / 店铺 / 招募基础',
    '每平台绑定 1 个账号',
    '直连 AI 50 次/月（四厂商）',
    '注册赠 100 积分',
  ],
  member: [
    'GEO 优化 · 竞对分析 · 报税管理',
    '每平台绑定 5 个账号',
    '直连 AI 不限（四厂商）',
    '本地推优化 + 线索跟进 AI',
    monthlyGiftFeature('member'),
  ],
  member_plus: [
    '全部 AI 模型（含 OpenAI / Claude）',
    '每平台绑定 50 个账号',
    '一键报税 AI · 代运营多店',
    monthlyGiftFeature('member_plus'),
    '短视频 / 云剪 / 数字人可用',
  ],
}

function buildCardsFromTiers(tiers: EffectiveSubscriptionTier[]): SubscriptionPlanCard[] {
  const find = (plan: MembershipPlan, periodDays: number) =>
    tiers.find((t) => t.plan === plan && t.periodDays === periodDays) ??
    tiers.find((t) => t.plan === plan && (periodDays === 30 ? t.cents < 40000 : t.cents >= 40000))

  const memberMonthly = find('member', 30)
  const memberQuarter = find('member', 90)
  const plusMonthly = find('member_plus', 30)
  const plusQuarter = find('member_plus', 90)

  const idx = (t: EffectiveSubscriptionTier | undefined) =>
    t ? Math.max(0, tiers.findIndex((x) => x.cents === t.cents && x.plan === t.plan)) : -1

  return [
    {
      plan: 'free',
      tierIndex: -1,
      label: MEMBERSHIP_PLAN_LABELS.free,
      priceYuan: 0,
      period: '永久',
      features: PLAN_FEATURES.free,
      giftPoints: ERP_MONTHLY_GIFT_POINTS.free,
    },
    {
      plan: 'member',
      tierIndex: idx(memberMonthly),
      label: '会员版',
      priceYuan: memberMonthly?.yuan ?? 168,
      period: '月付',
      badge: '热销',
      features: PLAN_FEATURES.member,
      giftPoints: ERP_MONTHLY_GIFT_POINTS.member,
      regionalMarkup: memberMonthly?.regionalMarkup,
    },
    {
      plan: 'member',
      tierIndex: idx(memberQuarter),
      label: '会员版 · 季付',
      priceYuan: memberQuarter?.yuan ?? 468,
      period: '90 天',
      features: [...PLAN_FEATURES.member, '季付约 93 折'],
      giftPoints: ERP_MONTHLY_GIFT_POINTS.member,
      regionalMarkup: memberQuarter?.regionalMarkup,
    },
    {
      plan: 'member_plus',
      tierIndex: idx(plusMonthly),
      label: '会员 Plus',
      priceYuan: plusMonthly?.yuan ?? 598,
      period: '月付',
      badge: '旗舰',
      highlight: true,
      features: PLAN_FEATURES.member_plus,
      giftPoints: ERP_MONTHLY_GIFT_POINTS.member_plus,
      regionalMarkup: plusMonthly?.regionalMarkup,
    },
    {
      plan: 'member_plus',
      tierIndex: idx(plusQuarter),
      label: '会员 Plus · 季付',
      priceYuan: plusQuarter?.yuan ?? 1688,
      period: '90 天',
      features: [...PLAN_FEATURES.member_plus, '季付约 94 折'],
      giftPoints: ERP_MONTHLY_GIFT_POINTS.member_plus,
      regionalMarkup: plusQuarter?.regionalMarkup,
    },
  ]
}

/** 兼容旧导出：平台默认静态卡片（未拉到动态价前的占位） */
export const SUBSCRIPTION_PLAN_CARDS = buildCardsFromTiers(
  SUBSCRIPTION_TIERS.map((t) => ({
    label: t.label,
    yuan: t.yuan,
    cents: t.cents,
    plan: t.plan,
    periodDays: t.cents === 46800 || t.cents === 168800 ? 90 : 30,
  })),
)

export type SubscriptionPlansPanelProps = {
  currentPlan: MembershipPlan
  onSelectPlan: (tierIndex: number) => void
  compact?: boolean
}

export default function SubscriptionPlansPanel({
  currentPlan,
  onSelectPlan,
  compact = false,
}: SubscriptionPlansPanelProps) {
  const [tiers, setTiers] = useState<EffectiveSubscriptionTier[] | null>(null)
  const [source, setSource] = useState<'platform' | 'regional'>('platform')
  const [pricingCity, setPricingCity] = useState<string | null>(null)

  useEffect(() => {
    void fetchEffectiveSubscriptionTiers()
      .then((r) => {
        setTiers(r.tiers)
        setSource(r.source)
        setPricingCity(r.pricingCity)
      })
      .catch(() => {
        setTiers(
          SUBSCRIPTION_TIERS.map((t) => ({
            label: t.label,
            yuan: t.yuan,
            cents: t.cents,
            plan: t.plan,
            periodDays: t.cents === 46800 || t.cents === 168800 ? 90 : 30,
          })),
        )
      })
  }, [])

  const cards = useMemo(() => {
    const list =
      tiers ??
      SUBSCRIPTION_TIERS.map((t) => ({
        label: t.label,
        yuan: t.yuan,
        cents: t.cents,
        plan: t.plan,
        periodDays: (t.cents === 46800 || t.cents === 168800 ? 90 : 30) as 30 | 90,
      }))
    return buildCardsFromTiers(list)
  }, [tiers])

  const paidCards = useMemo(() => cards.filter((c) => c.plan !== 'free'), [cards])

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6 text-white shadow-xl sm:p-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(99,102,241,0.45), transparent 45%), radial-gradient(circle at 80% 0%, rgba(34,211,238,0.35), transparent 40%)',
          }}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/90">
              <Sparkles className="h-4 w-4" />
              灵祺 ERP 会员
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              升级解锁全功能 + AI 积分
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
              订阅含 ERP 全功能权益；付费档位每月赠送 AI 积分（套餐桶，自然月刷新）。
              积分可用于视频检核、Brief、云剪等 AI 能力。
              {source === 'regional' && pricingCity ? (
                <span className="mt-1 block text-amber-200/90">
                  当前按区域价展示（{pricingCity}）
                </span>
              ) : null}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
            <p className="text-xs text-slate-400">当前版本</p>
            <p className="mt-1 flex items-center gap-2 text-lg font-semibold">
              <Crown className="h-5 w-5 text-amber-400" />
              {MEMBERSHIP_PLAN_LABELS[currentPlan]}
            </p>
            {MEMBERSHIP_MONTHLY_YUAN[currentPlan] != null ? (
              <p className="mt-0.5 text-xs text-slate-400">¥{MEMBERSHIP_MONTHLY_YUAN[currentPlan]}/月起</p>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className={cn(
          'grid gap-4',
          compact ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3',
        )}
      >
        {paidCards.map((card) => {
          const isCurrent = currentPlan === card.plan && card.period.includes('月付') === (currentPlan !== 'free')
          const isActiveTier = currentPlan === card.plan
          return (
            <article
              key={`${card.plan}-${card.period}-${card.priceYuan}`}
              className={cn(
                'relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md',
                card.highlight
                  ? 'border-violet-300 ring-2 ring-violet-500/20'
                  : 'border-slate-200',
              )}
            >
              {card.badge ? (
                <span
                  className={cn(
                    'absolute right-4 top-4 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                    card.highlight ? 'bg-violet-600 text-white' : 'bg-amber-100 text-amber-800',
                  )}
                >
                  {card.badge}
                </span>
              ) : null}
              <div className="border-b border-slate-100 p-5">
                <h3 className="text-lg font-bold text-slate-900">{card.label}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {card.period}
                  {card.regionalMarkup ? (
                    <span className="ml-2 text-amber-600">区域价</span>
                  ) : null}
                </p>
                <div className="mt-4 flex items-end gap-1">
                  <span className="text-3xl font-bold tabular-nums text-slate-900">¥{card.priceYuan}</span>
                  {card.period === '月付' ? (
                    <span className="mb-1 text-sm text-slate-500">/月</span>
                  ) : (
                    <span className="mb-1 text-sm text-slate-500">/季</span>
                  )}
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-violet-700">
                  <Zap className="h-3.5 w-3.5" />
                  月赠 {card.giftPoints.toLocaleString('zh-CN')} 积分
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {formatErpPointsEquivalentsLine(card.giftPoints)}
                </p>
              </div>
              <ul className="flex-1 space-y-2 p-5 text-sm text-slate-600">
                {card.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="p-5 pt-0">
                <button
                  type="button"
                  disabled={isCurrent && isActiveTier || card.tierIndex < 0}
                  onClick={() => onSelectPlan(card.tierIndex)}
                  className={cn(
                    'w-full rounded-xl py-2.5 text-sm font-semibold transition',
                    card.highlight
                      ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-900/20 hover:brightness-105'
                      : 'bg-slate-900 text-white hover:bg-slate-800',
                    isCurrent && isActiveTier && 'cursor-default opacity-60',
                  )}
                >
                  {isCurrent && isActiveTier ? '当前档位' : '立即订阅'}
                </button>
              </div>
            </article>
          )
        })}
      </div>

      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-3 text-xs leading-relaxed text-slate-600">
        <p className="flex items-center gap-1.5 font-medium text-slate-800">
          <Star className="h-3.5 w-3.5 text-amber-500" />
          免费版说明
        </p>
        <p className="mt-1">
          新注册默认为免费版；含基础 ERP 与注册赠 100 积分。升级后积分按自然月发放至套餐桶，充值积分单独计入充值桶且不过期。
          积分充值按 ¥1 = {ERP_RECHARGE_POINTS_PER_YUAN} 积分换算。
        </p>
      </div>
    </div>
  )
}
