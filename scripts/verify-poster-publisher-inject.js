#!/usr/bin/env node
/** 分享海报发单方名称：20 轮注入 + 解析 */
const path = require('path')
const prRecruitQr = require(path.join(__dirname, '../灵祺达人撮合小程序/utils/prRecruitQr.js'))

const baseOrder = {
  id: 'MP-RO-178099398735',
  title: '餐饮门店第一视角视频剪辑整理 · 温州市',
  customerName: '餐饮门店第一视角视频剪辑整理',
  mpPublishMeta: {
    lingqiPrId: 'LQ-P-000015',
    registryPrId: 'MPR-1780993742501',
    prDisplayName: '旧名称',
    prProfileSnapshot: { companyName: '旧名称', accountType: 'company' },
  },
}

const apiPayload = {
  displayName: '文长',
  prUser: {
    id: 'MPR-1780993742501',
    accountType: 'company',
    companyName: '文长',
    contactName: '文长',
  },
}

let failed = 0
for (let i = 0; i < 20; i += 1) {
  const bare = prRecruitQr.stripPublisherSnapshotFromOrder(baseOrder)
  const injected = prRecruitQr.injectPublisherDisplayIntoOrder(bare, apiPayload)
  const name = prRecruitQr.resolveOrderPublisherDisplayName(injected)
  const snap = injected.mpPublishMeta && injected.mpPublishMeta.prProfileSnapshot
  if (name !== '文长') {
    failed += 1
    console.log(`FAIL round ${i + 1}: name="${name}"`)
  }
  if (!snap || snap.companyName !== '文长') {
    failed += 1
    console.log(`FAIL round ${i + 1}: snapshot missing`)
  }
  if (bare.mpPublishMeta && bare.mpPublishMeta.prDisplayName) {
    failed += 1
    console.log(`FAIL round ${i + 1}: strip did not clear old name`)
  }
}

console.log(`${failed ? 'FAIL' : 'OK'} poster publisher inject x20 (${failed} issues)`)
process.exit(failed ? 1 : 0)
