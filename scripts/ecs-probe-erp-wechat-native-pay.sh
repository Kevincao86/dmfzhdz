#!/usr/bin/env bash
# 轻量：验证 ERP 租户微信支付可用路径（默认支付 AppID Native 下单成功）
# 本机: bash scripts/ecs-probe-erp-wechat-native-pay.sh --remote
# 轻量: bash ~/app/scripts/ecs-probe-erp-wechat-native-pay.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIGHT_HOST="${LIGHT_HOST:-admin@139.196.42.5}"

run_probe() {
  node <<'EOF'
const { readFileSync } = require('fs')
const { createSign, randomBytes } = require('crypto')

function loadEnv(p) {
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2]
  }
}
loadEnv(require('path').join(process.env.HOME, 'stack/auth-api.env'))

const mchId = process.env.WECHAT_PAY_MCH_ID
const payAppId = process.env.WECHAT_PAY_APP_ID || process.env.MP_WECHAT_APPID
const erpAppId = process.env.ERP_MP_WECHAT_APPID || ''
const serial = process.env.WECHAT_PAY_MERCHANT_SERIAL
const jsapiOn = /^(1|true|yes)$/i.test(String(process.env.WECHAT_PAY_ERP_JSAPI || ''))
const keyPath = String(process.env.WECHAT_PAY_PRIVATE_KEY_FILE || '').replace(/^~/, process.env.HOME)
const pem = keyPath
  ? readFileSync(keyPath, 'utf8')
  : String(process.env.WECHAT_PAY_PRIVATE_KEY || '').replace(/\\n/g, '\n')
const notify =
  process.env.WECHAT_PAY_NOTIFY_URL || 'https://mofangdianai.com/erp-api/meoo-wechat-pay-notify'

if (!mchId || !payAppId || !serial || !pem) {
  console.error('FAIL missing pay env', { mchId: !!mchId, payAppId: !!payAppId, serial: !!serial, pem: !!pem })
  process.exit(1)
}

async function tryNative(appId, label) {
  const outTradeNo = 'PROBE' + Date.now() + randomBytes(2).toString('hex')
  const bodyObj = {
    appid: appId,
    mchid: mchId,
    description: 'erp-native-probe',
    out_trade_no: outTradeNo,
    notify_url: notify,
    amount: { total: 1, currency: 'CNY' },
  }
  const body = JSON.stringify(bodyObj)
  const urlPath = '/v3/pay/transactions/native'
  const ts = Math.floor(Date.now() / 1000).toString()
  const nonce = randomBytes(8).toString('hex')
  const message = `POST\n${urlPath}\n${ts}\n${nonce}\n${body}\n`
  const signature = createSign('RSA-SHA256').update(message).sign(pem, 'base64')
  const auth = `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${ts}",serial_no="${serial}"`
  const res = await fetch('https://api.mch.weixin.qq.com' + urlPath, {
    method: 'POST',
    headers: { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' },
    body,
  })
  const text = await res.text()
  let ok = res.status === 200
  let codeUrl = ''
  try {
    const j = JSON.parse(text)
    codeUrl = j.code_url || ''
    if (j.code) ok = false
  } catch (_) {}
  return { label, appId, status: res.status, ok, codeUrl: codeUrl.slice(0, 48), err: ok ? '' : text.slice(0, 160) }
}

;(async () => {
  const pay = await tryNative(payAppId, 'default_pay_appid')
  const erp = erpAppId ? await tryNative(erpAppId, 'erp_appid') : { label: 'erp_appid', skip: true }
  const summary = {
    mchId,
    payAppId,
    erpAppId,
    erpJsapiEnabled: jsapiOn,
    defaultNativeOk: pay.ok,
    erpNativeOk: erp.ok === true,
    pay,
    erp,
  }
  console.log(JSON.stringify(summary, null, 2))
  if (!pay.ok) {
    console.error('FAIL: 默认支付 AppID Native 下单失败（ERP 扫码不可用）')
    process.exit(1)
  }
  if (jsapiOn && !erp.ok) {
    console.error('FAIL: 已开 WECHAT_PAY_ERP_JSAPI 但 ERP AppID 未关联商户号')
    process.exit(1)
  }
  if (!jsapiOn && erp.ok === false) {
    console.log('OK: 默认 Native 可用；ERP AppID 未关联（符合预期，走扫码）')
  } else {
    console.log('OK: Native probe passed')
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
EOF
}

if [[ "${1:-}" == "--remote" ]]; then
  ssh -o ConnectTimeout=15 "$LIGHT_HOST" "bash -s" <"$0"
  exit 0
fi

run_probe
