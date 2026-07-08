const config = require('./config.js')

/** 与 web版 merchant-erp src/lib/tenantAuthEmail.ts 逻辑一致 */
function loginNameToTenantEmail(loginName) {
  const domain = config.TENANT_EMAIL_DOMAIN || 'users.meoo.test'
  const slug = String(loginName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `${slug || 'user'}@${domain}`
}

module.exports = { loginNameToTenantEmail }
