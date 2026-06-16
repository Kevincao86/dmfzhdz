#!/usr/bin/env node
/**
 * 转发工具 / 群码发单 append 冒烟：连续 20 遍（含大群码 data URL）
 * 用法：node scripts/mp-recruitment-append-smoke.mjs [erp-api-base]
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const root = path.dirname(fileURLToPath(import.meta.url))
const merchantRoot = path.resolve(root, '..')
const { buildFormRelayOrder } = require(path.join(merchantRoot, 'src/lib/formRelayOrder.ts'))

const BASE = (process.argv[2] || 'http://139.196.42.5/erp-api').replace(/\/$/, '')
const PASSES = 20
const qr = `data:image/jpeg;base64,${'A'.repeat(47000)}`

async function appendOnce(pass) {
  const now = Date.now()
  const order = buildFormRelayOrder({
    sourceUrl: '',
    sourcePlatform: 'group_qr',
    title: `smoke append ${pass} 🔥测试`,
    relayMode: 'group_qr',
    groupQrImage: qr,
    prMeta: { prParticipantKey: 'smoke-pr', prDisplayName: 'Smoke PR' },
    parsed: {
      taskDetail: '达人权益 Lv6\nLv5',
      merchantRequirements: '要求'.repeat(80),
      recruitPlatform: '抖音',
    },
  })
  order.id = `MP-RO-SMOKE-${now}-${pass}`
  order.sourceMerchantOrderId = `USER-SMOKE-${now}-${pass}`

  const res = await fetch(`${BASE}/meoo-ops-mp-recruitment-orders-append`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order }),
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`pass ${pass}: non-json ${res.status} ${text.slice(0, 200)}`)
  }
  if (!res.ok || data.ok === false) {
    throw new Error(`pass ${pass}: http ${res.status} ${text.slice(0, 400)}`)
  }
  if (!data.id) throw new Error(`pass ${pass}: missing id`)
  return data
}

async function main() {
  const health = await fetch(`${BASE}/meoo-erp-api-health`).then((r) => r.json())
  console.log('[append-smoke] health', health.revision || health)

  for (let i = 1; i <= PASSES; i++) {
    const data = await appendOnce(i)
    console.log(`[append-smoke] PASS ${i}/${PASSES} id=${data.id} via=${data.via || 'unknown'}`)
  }
  console.log(`[append-smoke] ALL ${PASSES} PASSES OK`)
}

main().catch((e) => {
  console.error('[append-smoke] FAIL', e instanceof Error ? e.message : e)
  process.exit(1)
})
