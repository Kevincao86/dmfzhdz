import { Crown, Sparkles, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { MEMBERSHIP_UPGRADE_HREF, type MembershipPlan } from '../lib/membershipPlan'

export type MembershipMediaKind = 'image' | 'video'

export function MembershipUpgradeDialog({
  kind,
  planLabel,
  onClose,
}: {
  kind: MembershipMediaKind
  planLabel: string
  onClose: () => void
}) {
  const navigate = useNavigate()
  const title = kind === 'image' ? '升级会员后使用生图' : '升级会员后使用生视频'
  const feature = kind === 'image' ? 'AI 生图' : 'AI 生视频'

  const goUpgrade = () => {
    onClose()
    navigate(MEMBERSHIP_UPGRADE_HREF)
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="membership-upgrade-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-violet-100 bg-white p-6 shadow-2xl shadow-violet-900/15"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="关闭"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
          <Crown className="h-5 w-5" />
        </div>
        <h2 id="membership-upgrade-title" className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          当前为<strong className="font-medium text-slate-800">{planLabel}</strong>。
          {feature}需升级会员版或会员 Plus 后使用。
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          板块可继续浏览；出图、出片需会员版或会员 Plus。
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={goUpgrade}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-105"
          >
            <Sparkles className="h-4 w-4" />
            去升级会员
          </button>
        </div>
      </div>
    </div>
  )
}

export function MembershipMediaLockedBanner({
  kind,
  plan,
  onUpgradeClick,
}: {
  kind: MembershipMediaKind
  plan: MembershipPlan
  onUpgradeClick: () => void
}) {
  if (plan !== 'free') return null
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950"
      role="note"
    >
      <span>
        免费版可预览本功能。
        {kind === 'image' ? '点击出图' : '点击生成成片'}
        时需升级会员。
      </span>
      <button
        type="button"
        onClick={onUpgradeClick}
        className="shrink-0 font-semibold text-violet-700 underline-offset-2 hover:underline"
      >
        去升级
      </button>
    </div>
  )
}
