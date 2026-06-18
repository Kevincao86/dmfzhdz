import { useState } from 'react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import type { RecruitmentCpsLinkage } from '@merchant/lib/opsRegistryTypes'
import { patchMpRecruitmentOrder } from '../../lib/mpApi'

type Props = {
  mpOrderId: string
  cpsLinkage?: RecruitmentCpsLinkage | null
  onUpdated?: () => void
}

export default function PrLinkeSettlementBanner({ mpOrderId, cpsLinkage, onUpdated }: Props) {
  const [marking, setMarking] = useState(false)
  if (!cpsLinkage?.linkeSettlementReminderAt || cpsLinkage.linkeSettlementDone) return null

  const settlements = cpsLinkage.talentSettlements ?? []

  async function onMarkDone() {
    if (marking) return
    setMarking(true)
    try {
      await patchMpRecruitmentOrder({
        id: mpOrderId,
        cpsLinkage: { ...cpsLinkage!, linkeSettlementDone: true },
      })
      onUpdated?.()
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败')
    } finally {
      setMarking(false)
    }
  }

  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-amber-900">请在林客端完成达人结算</h3>
          <p className="text-sm text-amber-800/90 mt-1">
            已选达人已全部回传视频。定向计划 {cpsLinkage.planId || '—'} 已同步，请按下列结算费用在抖音林客后台完成结算。
          </p>
        </div>
      </div>
      {settlements.length ? (
        <ul className="text-sm space-y-1 bg-white/60 rounded-lg p-3">
          {settlements.map((s) => (
            <li key={s.applicantId} className="flex justify-between gap-2">
              <span>
                {s.displayName || s.douyinId} · 佣金 {s.commissionPct}%
              </span>
              <span className="font-medium">¥{s.settlementFeeYuan}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 text-white text-sm disabled:opacity-50"
        disabled={marking}
        onClick={() => void onMarkDone()}
      >
        <CheckCircle2 className="w-4 h-4" />
        {marking ? '处理中…' : '已在林客端完成结算'}
      </button>
    </section>
  )
}
