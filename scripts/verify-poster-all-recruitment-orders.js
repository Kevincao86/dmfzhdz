#!/usr/bin/env node
/**
 * 每个招募单场景 × 10 轮：分享海报发单方名称（含 PR 名与订单标题相同）
 */
const path = require('path')
const prRecruitQr = require(path.join(__dirname, '../灵祺达人撮合小程序/utils/prRecruitQr.js'))
const ops = require(path.join(__dirname, '../灵祺达人撮合小程序/utils/opsRegistryTalentMp.js'))
const core = require(path.join(__dirname, '../灵祺达人撮合小程序/utils/recruitmentSharePosterCore.js'))

const ROUNDS = 10

const ORDER_FIXTURES = [
  {
    id: 'MP-RO-178099398735',
    label: '文长·公司名',
    prUser: {
      id: 'MPR-1780993742501',
      accountType: 'company',
      companyName: '文长',
      contactName: '文长',
      lingqiPrId: 'LQ-P-000015',
    },
    order: {
      title: '餐饮门店第一视角视频剪辑整理 · 温州市',
      customerName: '餐饮门店第一视角视频剪辑整理',
      mpPublishMeta: {
        lingqiPrId: 'LQ-P-000015',
        registryPrId: 'MPR-1780993742501',
      },
    },
    expectName: '文长',
  },
  {
    id: 'MP-RO-178124989383',
    label: '测试·名称与标题相同',
    prUser: {
      id: 'MPR-1781249000001',
      accountType: 'company',
      companyName: '测试',
      contactName: '测试',
      lingqiPrId: 'LQ-P-000099',
    },
    order: {
      title: '测试 · 温州市',
      customerName: '测试',
      mpPublishMeta: {
        lingqiPrId: 'LQ-P-000099',
        registryPrId: 'MPR-1781249000001',
      },
    },
    expectName: '测试',
  },
  {
    id: 'MP-RO-1781300000001',
    label: '个人 PR·无 mpPrUsers 走 legacy',
    prUser: null,
    order: {
      title: '探店短视频 · 杭州市',
      customerName: '探店短视频',
      mpPublishMeta: {
        prDisplayName: '小林探店',
        prProfileSnapshot: { accountType: 'personal', personalName: '小林探店' },
      },
    },
    expectName: '小林探店',
    emptyRegistry: true,
  },
]

function buildOrder(fixture) {
  return {
    id: fixture.id,
    ...fixture.order,
    mpPublishMeta: { ...(fixture.order.mpPublishMeta || {}) },
  }
}

function mockReg(fixture) {
  const order = buildOrder(fixture)
  if (fixture.emptyRegistry) {
    return { mpRecruitmentOrders: [order], mpPrUsers: [] }
  }
  return {
    mpRecruitmentOrders: [order],
    mpPrUsers: fixture.prUser ? [fixture.prUser] : [],
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

async function runAsyncCase(label, fn) {
  try {
    await fn()
    console.log(`OK ${label}`)
  } catch (e) {
    failed += 1
    console.log(`FAIL ${label}: ${e.message}`)
  }
}

for (const fixture of ORDER_FIXTURES) {
  const order = buildOrder(fixture)
  const reg = mockReg(fixture)

  runCase(`${fixture.label} registry 同步`, () => {
    if (fixture.emptyRegistry) return
    const hit = ops.publisherDisplayFromRegistry(reg, fixture.id, order)
    assert(hit && hit.displayName === fixture.expectName, `got ${hit && hit.displayName}`)
  })

  runCase(`${fixture.label} resolvePublisherDisplaySync`, () => {
    const hit = prRecruitQr.resolvePublisherDisplaySync(order, reg, null)
    assert(hit && hit.displayName === fixture.expectName, `got ${hit && hit.displayName}`)
  })

  for (let i = 0; i < ROUNDS; i += 1) {
    runCase(`${fixture.label} round ${i + 1}/${ROUNDS}`, () => {
      const bare = prRecruitQr.stripPublisherSnapshotFromOrder(order)
      let hit = prRecruitQr.resolvePublisherDisplaySync(order, reg, null)
      if (!hit && !fixture.emptyRegistry) {
        hit = ops.publisherDisplayFromRegistry(reg, fixture.id, order)
      }
      assert(hit && hit.displayName === fixture.expectName, `sync ${hit && hit.displayName}`)
      const injected = prRecruitQr.injectPublisherDisplayIntoOrder(bare, hit)
      const name = prRecruitQr.resolvePosterInviterName(injected)
      assert(name === fixture.expectName, `inviter ${name}`)
      const fields = core.extractPosterFieldsFromOrder(injected)
      assert(fields.inviterName === fixture.expectName, `fields ${fields.inviterName}`)
      assert(!fields.inviterName.includes('灵祺星选'), 'placeholder')
    })
  }

  runAsyncCase(`${fixture.label} resolveOrderForSharePoster`, async () => {
    const cached = prRecruitQr.resolvePublisherDisplaySync(order, reg, null)
    const resolved = await prRecruitQr.resolveOrderForSharePoster(order, {
      reg,
      publisherFromApi: cached,
    })
    const name = prRecruitQr.resolvePosterInviterName(resolved)
    assert(name === fixture.expectName, name)
  })
}

console.log(
  failed
    ? `\n${failed} case(s) failed (${ORDER_FIXTURES.length} orders × ${ROUNDS} rounds)`
    : `\nAll poster checks passed (${ORDER_FIXTURES.length} orders × ${ROUNDS} rounds each)`,
)
process.exit(failed ? 1 : 0)
