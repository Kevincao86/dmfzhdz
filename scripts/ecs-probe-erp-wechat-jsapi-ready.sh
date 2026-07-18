#!/usr/bin/env bash
# 轻量：检测 ERP 小程序 JSAPI 前置条件（商户号是否已关联 ERP AppID）
# 本机: bash scripts/ecs-probe-erp-wechat-jsapi-ready.sh --remote

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIGHT_HOST="${LIGHT_HOST:-admin@139.196.42.5}"

run_probe() {
  node <<'EOF'
const { readFileSync } = require('fs')
const { createSign, randomBytes } = require('crypto')
const path = require('path')

function loadEnv(p) {
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2]
  }
}
loadEnv(path.join(process.env.HOME, 'stack/auth-api.env'))

const mchId = process.env.WECHAT_PAY_MCH_ID
const erpAppId = process.env.ERP_MP_WECHAT_APPID || ''
const xingxuanAppId = process.env.WECHAT_PAY_APP_ID || process.env.MP_WECHAT_APPID || ''
const serial = process.env.WECHAT_PAY_MERCHANT_SERIAL
const keyPath = String(process.env.WECHAT_PAY_PRIVATE_KEY_FILE || '').replace(/^~/, process.env.HOME)
const pem = keyPath
  ? readFileSync(keyPath, 'utf8')
  : String(process.env.WECHAT_PAY_PRIVATE_KEY || '').replace(/\\n/g, '\n')
const notify =
  process.env.WECHAT_PAY_NOTIFY_URL || 'https://mofangdianai.com/erp-api/meoo-wechat-pay-notify'

async function tryNative(appId) {
  const outTradeNo = 'JSPROBE' + Date.now() + randomBytes(2).toString('hex')
  const body = JSON.stringify({
    appid: appId,
    mchid: mchId,
    description: 'erp-jsapi-ready-probe',
    out_trade_no: outTradeNo,
    notify_url: notify,
    amount: { total: 1, currency: 'CNY' },
  })
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
  try {
    const j = JSON.parse(text)
    if (j.code) ok = false
  } catch (_) {}
  return { status: res.status, ok, body: text.slice(0, 180) }
}

;(async () => {
  const erp = await tryNative(erpAppId)
  const xx = await tryNative(xingxuanAppId)
  const ready = erp.ok === true
  console.log(
    JSON.stringify(
      {
        mchId,
        erpAppId,
        xingxuanAppId,
        erpAppIdBoundToMch: ready,
        xingxuanBoundToMch: xx.ok === true,
        erpProbe: erp,
        note: ready
          ? 'ERP AppID 已关联商户号，JSAPI 可下单'
          : 'ERP AppID 未关联商户号——与达人小程序差异在此。请在 pay.weixin.qq.com 关联后再测',
      },
      null,
      2,
    ),
  )
  process.exit(ready ? 0 : 2)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
EOF
}

if [[ "${1:-}" == "--remote" ]]; then
  ssh -o ConnectTimeout=15 "$LIGHT_HOST" "bash -s" <"$0"
  exit $?
fi

run_probe
