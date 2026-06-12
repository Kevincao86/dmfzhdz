#!/usr/bin/env node
/**
 * 分享海报发单方名称：100 轮 + 多场景（registry 同步 / 注入 / 误杀防护）
 */
const path = require('path')
const prRecruitQr = require(path.join(__dirname, '../灵祺达人撮合小程序/utils/prRecruitQr.js'))
const ops = require(path.join(__dirname, '../灵祺达人撮合小程序/utils/opsRegistryTalentMp.js'))

const ORDER_ID = 'MP-RO-178099398735'
const PR_USER = {
  id: 'MPR-1780993742501',
  accountType: 'company',
  companyName: '文长',
  contactName: '文长',
  lingqiPrId: 'LQ-P-000015',
}

function baseOrder(extra) {
  return {
    id: ORDER_ID,
    title: '餐饮门店第一视角视频剪辑整理 · 温州市',
    customerName: '餐饮门店第一视角视频剪辑整理',
    region: '温州市',
    mpPublishMeta: {
      lingqiPrId: 'LQ-P-000015',
      registryPrId: 'MPR-1780993742501',
      prDisplayName: '旧名称',
      prProfileSnapshot: { companyName: '旧名称', accountType: 'company' },
      ...(extra && extra.mpPublishMeta ? extra.mpPublishMeta : {}),
    },
    ...extra,
  }
}

function mockReg() {
  return {
    mpRecruitmentOrders: [baseOrder()],
    mpPrUsers: [PR_USER],
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

let failed = 0

function runCase(label, fn) {
  try {
    fn()
    console.log(`OK ${label}`)
  } catch (e) {
    failed += 1
    console.log(`FAIL ${label}: ${e.message}`)
  }
}

runCase('registry 同步解析（零网络）', () => {
  const hit = ops.publisherDisplayFromRegistry(mockReg(), ORDER_ID, baseOrder())
  assert(hit && hit.displayName === '文长', `got ${hit && hit.displayName}`)
})

runCase('inject + resolvePosterInviterName', () => {
  const bare = prRecruitQr.stripPublisherSnapshotFromOrder(baseOrder())
  const injected = prRecruitQr.injectPublisherDisplayIntoOrder(bare, {
    displayName: '文长',
    prUser: PR_USER,
  })
  assert(prRecruitQr.resolvePosterInviterName(injected) === '文长', 'inviter')
  assert(
    prRecruitQr.resolveOrderPublisherDisplayName(injected) === '文长' ||
      prRecruitQr.resolvePosterInviterName(injected) === '文长',
    'fallback path',
  )
})

runCase('customerName 与 PR 名相同仍应出海报', () => {
  const order = baseOrder({ customerName: '文长' })
  const bare = prRecruitQr.stripPublisherSnapshotFromOrder(order)
  const injected = prRecruitQr.injectPublisherDisplayIntoOrder(bare, {
    displayName: '文长',
    prUser: PR_USER,
  })
  assert(
    prRecruitQr.resolvePosterInviterName(injected) === '文长',
    `poster name blocked: ${prRecruitQr.resolveOrderPublisherDisplayName(injected)}`,
  )
})

runCase('标题与 PR 名相同（测试·温州市）仍应出海报', () => {
  const prPub = require(path.join(__dirname, '../灵祺达人撮合小程序/utils/prRegistryPublisherName.js'))
  const TEST_USER = {
    id: 'MPR-1781249000001',
    accountType: 'company',
    companyName: '测试',
    lingqiPrId: 'LQ-P-000099',
  }
  const order = {
    id: 'MP-RO-178124989383',
    title: '测试 · 温州市',
    customerName: '测试',
    mpPublishMeta: { registryPrId: 'MPR-1781249000001', lingqiPrId: 'LQ-P-000099' },
  }
  const reg = { mpRecruitmentOrders: [order], mpPrUsers: [TEST_USER] }
  const hit = ops.publisherDisplayFromRegistry(reg, order.id, order)
  assert(hit && hit.displayName === '测试', `registry ${hit && hit.displayName}`)
  assert(prPub.prUserRegistryDisplayNameForPoster(TEST_USER) === '测试', 'forPoster')
  const bare = prRecruitQr.stripPublisherSnapshotFromOrder(order)
  const injected = prRecruitQr.injectPublisherDisplayIntoOrder(bare, hit)
  assert(prRecruitQr.resolvePosterInviterName(injected) === '测试', 'inviter')
})

runCase('extractPosterFields 模拟（core 路径）', () => {
  const core = require(path.join(__dirname, '../灵祺达人撮合小程序/utils/recruitmentSharePosterCore.js'))
  const bare = prRecruitQr.stripPublisherSnapshotFromOrder(baseOrder())
  const injected = prRecruitQr.injectPublisherDisplayIntoOrder(bare, {
    displayName: '文长',
    prUser: PR_USER,
  })
  const fields = core.extractPosterFieldsFromOrder(injected)
  assert(fields.inviterName === '文长', fields.inviterName)
})

for (let i = 0; i < 100; i += 1) {
  runCase(`round ${i + 1}/100`, () => {
    const reg = mockReg()
    const bare = prRecruitQr.stripPublisherSnapshotFromOrder(baseOrder())
    let hit = ops.publisherDisplayFromRegistry(reg, ORDER_ID, bare)
    assert(hit && hit.displayName === '文长', 'registry')
    const injected = prRecruitQr.injectPublisherDisplayIntoOrder(bare, hit)
    const name = prRecruitQr.resolvePosterInviterName(injected)
    assert(name === '文长', name)
    const core = require(path.join(__dirname, '../灵祺达人撮合小程序/utils/recruitmentSharePosterCore.js'))
    const fields = core.extractPosterFieldsFromOrder(injected)
    assert(fields.inviterName === '文长', fields.inviterName)
    assert(!fields.inviterName.includes('灵祺星选'), 'placeholder')
  })
}

console.log(failed ? `\n${failed} case(s) failed` : '\nAll poster publisher checks passed (100 rounds)')
process.exit(failed ? 1 : 0)
