/**
 * 体验版/正式版：config.release.js
 * 本机调试：config.local.js（gitignore，打包时忽略）
 */
const mpRuntime = require('./mpRuntime.js')

const core = {
  MERCHANT_API_BASE_URL: '',
  MP_BUILD_ID: '',
  MP_TEST_TALENT_ON_RECOMMEND: false,
}

let out = { ...core }
try {
  Object.assign(out, require('./config.release.js'))
} catch (_) {}
try {
  Object.assign(out, require('./config.local.js'))
} catch (_) {}

module.exports = out
module.exports.applyDevtoolsOverrides = () => mpRuntime.applyRuntimeConfig(out)
module.exports.isDevtools = () => mpRuntime.isDevtoolsEnv()
module.exports.isLocalDevRuntime = () => mpRuntime.isLocalDevRuntime()
