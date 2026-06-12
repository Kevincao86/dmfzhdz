#!/usr/bin/env node
/** 本地校验 PR 用户库名称映射（个人/机构）+ 海报注入 */
const path = require('path')
const prPub = require(path.join(__dirname, '../灵祺达人撮合小程序/utils/prRegistryPublisherName.js'))
const prRecruitQr = require(path.join(__dirname, '../灵祺达人撮合小程序/utils/prRecruitQr.js'))

const order = {
  title: '餐饮门店第一视角视频剪辑整理',
  customerName: '餐饮门店第一视角视频剪辑整理',
  mpPublishMeta: {
    lingqiPrId: 'LQ-P-000015',
    registryPrId: 'MPR-TEST-015',
    prParticipantKey: 'pr_13800138000',
  },
}

const cases = [
  {
    label: '机构 companyName',
    user: {
      accountType: 'company',
      companyName: '文长',
      personalName: '',
      lingqiPrId: 'LQ-P-000015',
      id: 'MPR-TEST-015',
    },
    expect: '文长',
  },
  {
    label: '个人 personalName',
    user: {
      accountType: 'personal',
      companyName: '',
      personalName: '墨典网络',
      lingqiPrId: 'LQ-P-000004',
      id: 'MPR-TEST-004',
    },
    expect: '墨典网络',
  },
  {
    label: 'registryPrId 交叉匹配 lingqiPrId',
    user: {
      accountType: 'company',
      companyName: '抖音经理曹',
      lingqiPrId: 'LQ-P-000003',
      id: 'MPR-OTHER',
    },
    order: {
      title: '测试',
      mpPublishMeta: { registryPrId: 'LQ-P-000003' },
    },
    expect: '抖音经理曹',
  },
]

let failed = 0
for (const c of cases) {
  const mp = c.order || order
  const hit = prPub.matchRegistryPrUserForOrder(mp, [c.user])
  const name = hit ? prPub.resolvePublisherDisplayNameFromUser(hit, mp) : ''
  const ok = name === c.expect
  if (!ok) failed += 1
  console.log(`${ok ? 'OK' : 'FAIL'} ${c.label}: got "${name}" expect "${c.expect}"`)
}

const posterOrder = {
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
const bare = prRecruitQr.stripPublisherSnapshotFromOrder(posterOrder)
const injected = prRecruitQr.injectPublisherDisplayIntoOrder(bare, {
  displayName: '文长',
  prUser: {
    id: 'MPR-1780993742501',
    accountType: 'company',
    companyName: '文长',
    contactName: '文长',
  },
})
const posterName = prRecruitQr.resolveOrderPublisherDisplayName(injected)
const injectOk = posterName === '文长'
if (!injectOk) failed += 1
console.log(`${injectOk ? 'OK' : 'FAIL'} API 注入后 resolveOrderPublisherDisplayName: got "${posterName}" expect "文长"`)

process.exit(failed ? 1 : 0)
