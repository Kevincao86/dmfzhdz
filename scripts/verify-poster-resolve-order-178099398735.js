#!/usr/bin/env node
/** MP-RO-178099398735：registryPrId → PR 库「文长」，模拟 API 失败时本地兜底 */
const path = require('path')
const prRecruitQr = require(path.join(__dirname, '../灵祺达人撮合小程序/utils/prRecruitQr.js'))
const ops = require(path.join(__dirname, '../灵祺达人撮合小程序/utils/opsRegistryTalentMp.js'))
const core = require(path.join(__dirname, '../灵祺达人撮合小程序/utils/recruitmentSharePosterCore.js'))

const ORDER_ID = 'MP-RO-178099398735'
const PR_USER = {
  id: 'MPR-1780993742501',
  accountType: 'company',
  companyName: '文长',
  contactName: '文长',
  lingqiPrId: 'LQ-P-000015',
}

const order = {
  id: ORDER_ID,
  title: '餐饮门店第一视角视频剪辑整理 · 温州市',
  customerName: '餐饮门店第一视角视频剪辑整理',
  mpPublishMeta: {
    lingqiPrId: 'LQ-P-000015',
    registryPrId: 'MPR-1780993742501',
  },
}

const reg = {
  mpRecruitmentOrders: [order],
  mpPrUsers: [PR_USER],
}

async function main() {
  let failed = 0
  const assert = (ok, msg) => {
    if (!ok) {
      failed += 1
      console.log(`FAIL ${msg}`)
    } else {
      console.log(`OK ${msg}`)
    }
  }

  assert(typeof ops.fetchPublisherDisplayFreshByOrderId === 'function', 'fetchPublisherDisplayFreshByOrderId exported')
  assert(typeof ops.publisherDisplayFromRegistry === 'function', 'publisherDisplayFromRegistry exported')
  assert(typeof ops.mergeRegWithPrUsers === 'function', 'mergeRegWithPrUsers exported')

  const fromReg = ops.publisherDisplayFromRegistry(reg, ORDER_ID, order)
  assert(fromReg && fromReg.displayName === '文长', `registry sync ${fromReg && fromReg.displayName}`)

  const origFresh = ops.fetchPublisherDisplayFreshByOrderId
  const origFetch = ops.fetchPublisherDisplayForOrder
  const origPosterReg = ops.fetchRegistryForPoster
  ops.fetchPublisherDisplayFreshByOrderId = async () => null
  ops.fetchPublisherDisplayForOrder = async () => null
  ops.fetchRegistryForPoster = async () => reg

  try {
    const resolved = await prRecruitQr.resolveOrderForSharePoster(order, { reg: { mpRecruitmentOrders: [order], mpPrUsers: [] } })
    const name = prRecruitQr.resolvePosterInviterName(resolved)
    assert(name === '文长', `resolveOrderForSharePoster fallback ${name}`)
    const fields = core.extractPosterFieldsFromOrder(resolved)
    assert(fields.inviterName === '文长', `extractPosterFields ${fields.inviterName}`)
  } finally {
    ops.fetchPublisherDisplayFreshByOrderId = origFresh
    ops.fetchPublisherDisplayForOrder = origFetch
    ops.fetchRegistryForPoster = origPosterReg
  }

  console.log(failed ? `\n${failed} failed` : '\nMP-RO-178099398735 poster resolve OK')
  process.exit(failed ? 1 : 0)
}

main()
