const ecs = require('./ecs.js')
const auth = require('./auth.js')
const billing = require('./mpBillingRoleHint.js')

function post(body) {
  const token = auth.readSessionToken()
  return ecs.post(
    '/api/meoo-ops-mp-auth',
    Object.assign(
      {
        action: 'talent_account_check',
        sessionToken: token,
        token,
      },
      billing.billingRolePayload(),
      body || {},
    ),
  )
}

function status() {
  return post({ mode: 'status' })
}

function parseSheet(payload) {
  return post(Object.assign({ mode: 'parse_sheet' }, payload))
}

function quote(queries) {
  return post({ mode: 'quote', queries })
}

function check(query) {
  return post({ mode: 'check', query })
}

module.exports = { post, status, parseSheet, quote, check }
