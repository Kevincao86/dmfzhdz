const api = require('./api.js')

const PATH = '/api/meoo-ops-mp-targeted-recruit'

function post(body) {
  return api.post(PATH, body)
}

function sendInvites(mpOrderId, talentMemberIds, inviteResponseHours) {
  return post({
    action: 'send_invites',
    mpOrderId,
    talentMemberIds,
    inviteResponseHours,
  })
}

function respond(mpOrderId, talentMemberId, response, rejectReason) {
  return post({
    action: 'respond',
    mpOrderId,
    talentMemberId,
    response,
    rejectReason,
  })
}

function cancelInvite(mpOrderId, inviteId) {
  return post({ action: 'cancel_invite', mpOrderId, inviteId })
}

function orderSummary(mpOrderId) {
  return post({ action: 'order_summary', mpOrderId })
}

function finalizeIfNeeded(mpOrderId) {
  return post({ action: 'finalize_if_needed', mpOrderId })
}

function confirmInvitePhase(mpOrderId) {
  return post({ action: 'confirm_invite_phase', mpOrderId })
}

function listForTalent(talentMemberId) {
  return post({ action: 'list_for_talent', talentMemberId })
}

module.exports = {
  sendInvites,
  respond,
  cancelInvite,
  orderSummary,
  listForTalent,
  finalizeIfNeeded,
  confirmInvitePhase,
}
