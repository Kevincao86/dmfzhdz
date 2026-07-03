const talentAppStatus = require('./talentApplicationStatus.js')

function rowDisplayOpts(r) {
  return { selectionNotified: r.selectionNotified, isIce: r.isIce }
}

function resolveRowTab(r) {
  return talentAppStatus.resolveApplicationDisplayStatus(
    r.progressMp || null,
    r.progressMe || null,
    r.mpOrderId,
    rowDisplayOpts(r),
  )
}

function buildApplicationFlowSteps(r) {
  if (r.isIce) return []
  const mp = r.progressMp
  const applicant = r.progressMe
  const st = resolveRowTab(r)
  const tabId = st.tabId
  const prSelected = talentAppStatus.isApplicantPrSelected(mp, applicant)
  const notified = talentAppStatus.isApplicantSelectionNotified(mp, applicant, r.selectionNotified)
  const checkedIn = talentAppStatus.isTalentVisitCheckedIn(mp, applicant)
  const scheduleEffective = talentAppStatus.isPrScheduleEffective(applicant, mp)
  const videoPassed = String((applicant && applicant.videoStatus) || '') === 'passed'
  const deliverLabel = r.isScriptOrder ? '提交文稿' : '提交成片'

  if (tabId === 'registered' || (prSelected && !notified)) {
    return [
      { label: '已报名', state: 'done' },
      { label: 'PR审核', state: 'current' },
      { label: deliverLabel, state: 'pending' },
    ]
  }

  if (tabId === 'completed') {
    return [
      { label: '报名通过', state: 'done' },
      { label: checkedIn ? '探店完成' : '确认排期', state: 'done' },
      { label: deliverLabel, state: 'done' },
    ]
  }

  if (tabId === 'cancelled') return []

  let step2 = 'pending'
  let step3 = 'pending'
  if (tabId === 'approved') {
    step2 = 'current'
  } else if (tabId === 'pending_visit') {
    step2 = checkedIn ? 'done' : scheduleEffective ? 'current' : 'current'
    if (checkedIn) step3 = 'current'
  } else if (tabId === 'pending_video') {
    step2 = 'done'
    step3 = videoPassed ? 'done' : 'current'
  }

  return [
    { label: '报名通过', state: 'done' },
    { label: checkedIn ? '探店完成' : '确认排期', state: step2 },
    { label: deliverLabel, state: step3 },
  ]
}

function enrichRowWithFlowSteps(r) {
  const flowSteps = buildApplicationFlowSteps(r)
  return { ...r, flowSteps, showFlowSteps: flowSteps.length > 0 }
}

module.exports = {
  buildApplicationFlowSteps,
  enrichRowWithFlowSteps,
}
