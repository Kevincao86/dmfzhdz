const api = require('./api.js')

const PATH = '/api/meoo-ops-mp-wechat-oa-bind'

function post(body) {
  return api.post(PATH, body)
}

function getStatus(talentMemberId) {
  return post({ action: 'status', talentMemberId })
}

function createTicket(talentMemberId) {
  return post({ action: 'create_ticket', talentMemberId })
}

module.exports = {
  getStatus,
  createTicket,
}
