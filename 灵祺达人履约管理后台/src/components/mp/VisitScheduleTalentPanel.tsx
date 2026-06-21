import { useState } from 'react'
import { clearMpRegistryCache } from '../../lib/mpApi'
import {
  buildVisitTimeRange,
  confirmVisitSchedule,
  defaultVisitPlanDate,
  isValidVisitTimeRange,
  readVisitPlanDates,
  updateVisitPlan,
  visitCheckIn,
} from '../../lib/mpSync/visitScheduleRuntime'
import type { ApplicationDisplayStatus } from '../../lib/mpRecruitment/talentApplicationStatus'
import { BtnOutline, BtnPrimary, FormSection } from '../ui/MockupLayouts'

type Props = {
  mpOrderId: string
  applicantId: string
  display: ApplicationDisplayStatus
  mpOrder?: Record<string, unknown> | null
  onRefresh: () => void
}

export default function VisitScheduleTalentPanel({
  mpOrderId,
  applicantId,
  display,
  mpOrder,
  onRefresh,
}: Props) {
  const planDates = readVisitPlanDates(mpOrder)
  const hasPlanDates = planDates.length > 0
  const [planDateIdx, setPlanDateIdx] = useState(0)
  const [planSlotIdx, setPlanSlotIdx] = useState(0)
  const activePlan = hasPlanDates ? planDates[Math.min(planDateIdx, planDates.length - 1)] : null
  const activeSlots = activePlan?.slots || []
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [visitDate, setVisitDate] = useState(defaultVisitPlanDate())
  const [visitStartTime, setVisitStartTime] = useState('09:00')
  const [visitEndTime, setVisitEndTime] = useState('12:00')

  function buildSlot(): string {
    if (hasPlanDates && activeSlots.length) {
      return String(activeSlots[Math.min(planSlotIdx, activeSlots.length - 1)] || '').trim()
    }
    if (!isValidVisitTimeRange(visitStartTime, visitEndTime)) return ''
    return buildVisitTimeRange(visitStartTime, visitEndTime)
  }

  function resolveVisitDateForSubmit(): string {
    if (hasPlanDates && activePlan?.date) return activePlan.date
    return visitDate.trim()
  }

  function onStartTimeChange(value: string) {
    if (visitEndTime && !isValidVisitTimeRange(value, visitEndTime)) {
      setErr('结束时间须晚于开始时间')
      return
    }
    setErr('')
    setVisitStartTime(value)
  }

  function onEndTimeChange(value: string) {
    if (visitStartTime && !isValidVisitTimeRange(visitStartTime, value)) {
      setErr('结束时间须晚于开始时间')
      return
    }
    setErr('')
    setVisitEndTime(value)
  }

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
      } else if (action === 'accept_selection') {
        const submitDate = resolveVisitDateForSubmit()
        if (!submitDate) {
          setErr('请选择探店日期')
          return
        }
        const visitTimeSlot = buildSlot()
        if (!visitTimeSlot) {
          setErr(hasPlanDates ? '请选择探店时段' : '请选择有效的开始与结束时间')
          return
        }
        await confirmVisitSchedule(mpOrderId, applicantId, 'accept_selection', '', {
          visitDate: submitDate,
          visitTimeSlot,
        })
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

  async function saveVisitEdit() {
    if (!mpOrderId || !applicantId) return
    const submitDate = resolveVisitDateForSubmit()
    if (!submitDate) {
      setErr('请选择探店日期')
      return
    }
    const visitTimeSlot = buildSlot()
    if (!visitTimeSlot) {
      setErr(hasPlanDates ? '请选择探店时段' : '请选择有效的开始与结束时间')
      return
    }
    setBusy(true)
    setErr('')
    try {
      if (display.editVisitMode === 'preference') {
        await confirmVisitSchedule(mpOrderId, applicantId, 'accept_selection', '', {
          visitDate: submitDate,
          visitTimeSlot,
        })
      } else {
        await updateVisitPlan(mpOrderId, applicantId, submitDate, visitTimeSlot)
      }
      clearMpRegistryCache()
      onRefresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '更新失败')
    } finally {
      setBusy(false)
    }
  }

  if (
    !display.showConfirmBtn &&
    !display.showAssignConfirmBtn &&
    !display.showCheckInBtn &&
    !display.showEditVisitBtn &&
    !display.visitHint
  ) {
    return null
  }

  const scheduleSubmitted = display.editVisitMode === 'preference'

  function planDatePicker(className = '') {
    if (!hasPlanDates) return null
    return (
      <div className={`space-y-3 ${className}`}>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">探店日期</span>
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
            value={planDateIdx}
            onChange={(e) => {
              setPlanDateIdx(Number(e.target.value))
              setPlanSlotIdx(0)
            }}
          >
            {planDates.map((row, i) => (
              <option key={row.date} value={i}>
                {row.date}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">探店时段</span>
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
            value={planSlotIdx}
            onChange={(e) => setPlanSlotIdx(Number(e.target.value))}
          >
            {activeSlots.map((slot, i) => (
              <option key={`${activePlan?.date}-${slot}`} value={i}>
                {slot}
              </option>
            ))}
          </select>
        </label>
      </div>
    )
  }

  return (
    <FormSection title="探店排期">
      {scheduleSubmitted ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 space-y-1">
          <p className="text-sm font-semibold text-emerald-800">✓ 档期已提交</p>
          {display.visitHint ? <p className="text-sm text-emerald-700">{display.visitHint.replace(/^已提交[：:]\s*/, '')}</p> : null}
        </div>
      ) : display.visitHint ? (
        <p className="text-sm text-[var(--shell-muted)]">{display.visitHint}</p>
      ) : null}
      {display.showConfirmBtn ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 space-y-3">
          <p className="text-sm text-amber-900">
            {hasPlanDates
              ? 'PR 已开放可探店日期，请从下列选项中选择并提交探店意向。'
              : '您已通过 PR 审核，请填写计划探店日期与时段，提交后等待 PR 排期确认。'}
          </p>
          {planDatePicker()}
          {!hasPlanDates ? (
          <>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">探店日期</span>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={visitDate}
              min={defaultVisitPlanDate()}
              onChange={(e) => setVisitDate(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">开始时间</span>
              <input
                type="time"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                value={visitStartTime}
                onChange={(e) => onStartTimeChange(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">结束时间</span>
              <input
                type="time"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                value={visitEndTime}
                onChange={(e) => onEndTimeChange(e.target.value)}
              />
            </label>
          </div>
          </>
          ) : null}
          <BtnPrimary disabled={busy} onClick={() => void run('accept_selection')}>
            {busy ? '提交中…' : '提交探店意向'}
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
          <p className="text-sm text-emerald-900 font-medium">
            {display.checkInReady
              ? '今日为探店日，到店后请点击签到。'
              : display.visitHint || '探店日当天可签到，签到后进入待传视频。'}
          </p>
          <BtnPrimary disabled={busy || !display.checkInReady} onClick={() => void run('checkin')}>
            {busy ? '签到中…' : display.checkInReady ? '探店签到' : '探店日当天可签到'}
          </BtnPrimary>
        </div>
      ) : null}
      {display.showEditVisitBtn ? (
        <div className="rounded-lg border border-violet-200 bg-violet-50/70 p-4 space-y-3">
          <p className="text-sm text-violet-900">
            {display.editVisitMode === 'preference'
              ? '可修改已提交的探店意向，修改后等待 PR 重新排期确认。'
              : '可修改已生效排期，修改将同步 PR 端并自动重排。'}
          </p>
          {planDatePicker()}
          {!hasPlanDates ? (
          <>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">探店日期</span>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={visitDate}
              min={defaultVisitPlanDate()}
              onChange={(e) => setVisitDate(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">开始时间</span>
              <input
                type="time"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                value={visitStartTime}
                onChange={(e) => onStartTimeChange(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">结束时间</span>
              <input
                type="time"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                value={visitEndTime}
                onChange={(e) => onEndTimeChange(e.target.value)}
              />
            </label>
          </div>
          </>
          ) : null}
          <BtnPrimary disabled={busy} onClick={() => void saveVisitEdit()}>
            {busy ? '保存中…' : display.editVisitMode === 'preference' ? '保存意向修改' : '保存排期修改'}
          </BtnPrimary>
        </div>
      ) : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
    </FormSection>
  )
}
