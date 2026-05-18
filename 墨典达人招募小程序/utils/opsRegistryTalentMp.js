const { merchantRequest } = require('./merchantApi.js')

async function fetchRegistry() {
  return merchantRequest('GET', '/api/ops-sync/registry')
}

async function applyToMpOrder(mpOrderId, applicant) {
  return merchantRequest('POST', '/api/ops-sync/mp-recruitment-orders/apply', {
    mpOrderId,
    applicant,
  })
}

module.exports = { fetchRegistry, applyToMpOrder }
