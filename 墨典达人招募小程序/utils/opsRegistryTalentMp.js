const { merchantRequest } = require('./merchantApi.js')

async function fetchRegistry() {
  const paths = ['/api/meoo-ops-sync-registry', '/api/ops-sync/registry']
  let lastErr
  for (const path of paths) {
    try {
      return await merchantRequest('GET', path)
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('无法拉取招募大厅数据')
}

async function applyToMpOrder(mpOrderId, applicant) {
  const paths = [
    '/api/meoo-ops-mp-recruitment-orders-apply',
    '/api/ops-sync/mp-recruitment-orders/apply',
  ]
  let lastErr
  for (const path of paths) {
    try {
      return await merchantRequest('POST', path, { mpOrderId, applicant })
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('报名接口不可用')
}

async function registerTalentMember(member) {
  const paths = [
    '/api/meoo-ops-mp-talent-member-register',
    '/api/ops-sync/mp-talent-members/register',
  ]
  let lastErr
  for (const path of paths) {
    try {
      return await merchantRequest('POST', path, { member })
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('会员注册接口不可用')
}

async function submitIceDouyin(mpOrderId, applicantId, douyinPublishUrl) {
  const paths = [
    '/api/meoo-ops-mp-recruitment-ice-submit',
    '/api/ops-sync/mp-recruitment-orders/ice-submit',
  ]
  let lastErr
  for (const path of paths) {
    try {
      return await merchantRequest('POST', path, { mpOrderId, applicantId, douyinPublishUrl })
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('云剪回传接口不可用')
}

module.exports = { fetchRegistry, applyToMpOrder, registerTalentMember, submitIceDouyin }
