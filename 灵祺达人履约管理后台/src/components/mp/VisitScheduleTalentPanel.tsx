import { useState } from 'react'
import { clearMpRegistryCache } from '../../lib/mpApi'
import { confirmVisitSchedule, visitCheckIn } from '../../lib/mpSync/visitScheduleRuntime'
import type { ApplicationDisplayStatus } from '../../lib/mpRecruitment/talentApplicationStatus'
import { BtnOutline, BtnPrimary, FormSection } from '../ui/MockupLayouts'

type Props = {
  mpOrderId: string
  applicantId: string
  display: ApplicationDisplayStatus
  onRefresh: () => void
}

export default function VisitScheduleTalentPanel({ mpOrderId, applicantId, display, onRefresh }: Props) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function run(action: 'accept_selection' | 'confirm_assignment' | 'decline_assignment' | 'checkin') {
    if (!mpOrderId || !applicantId) return
    setBusy(true)
    setErr('')
    try {
      if (action === 'checkin') {
        await visitCheckIn(mpOrderId, applicantId)
      } else if (action === 'decline_assignment') {
        const reason = window.prompt('请简要说明档期冲突原因（选填）') || ''
        await confirmVisitSchedule(mpOrderId, applicantId, 'decline_assignment', reason)
      } else {
        await confirmVisitSchedule(mpOrderId, applicantId, action)
      }
      clearMpRegistryCache()
      onRefresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  if (!display.showConfirmBtn && !display.showAssignConfirmBtn && !display.showCheckInBtn && !display.visitHint) {
    return null
  }

  return (
    <FormSection title="探店排期">
      {display.visitHint ? <p className="text-sm text-[var(--shell-muted)]">{display.visitHint}</p> : null}
      {display.showConfirmBtn ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 space-y-3">
          <p className="text-sm text-amber-900">您已通过 PR 审核，请确认愿意配合本次探店档期安排。</p>
          <BtnPrimary disabled={busy} onClick={() => void run('accept_selection')}>
            {busy ? '提交中…' : '确认档期'}
          </BtnPrimary>
        </div>
      ) : null}
      {display.showAssignConfirmBtn ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-4 space-y-3">
          <p className="text-sm text-blue-900">PR 已安排探店时间，请确认是否可以按时到店。</p>
          <div className="flex flex-wrap gap-2">
            <BtnPrimary disabled={busy} onClick={() => void run('confirm_assignment')}>
              确认排期
            </BtnPrimary>
            <BtnOutline disabled={busy} onClick={() => void run('decline_assignment')}>
              我有冲突
            </BtnOutline>
          </div>
        </div>
      ) : null}
      {display.showCheckInBtn ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 space-y-3">
          <p className="text-sm text-emerald-900 font-medium">今日为探店日，到店后请点击签到。</p>
          <BtnPrimary disabled={busy} onClick={() => void run('checkin')}>
            {busy ? '签到中…' : '到店签到'}
          </BtnPrimary>
        </div>
      ) : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
    </FormSection>
  )
}
