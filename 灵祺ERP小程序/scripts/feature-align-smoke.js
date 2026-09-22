/**
 * 商家 ERP 小程序：投流/线索/财务展示层与网页字段对齐冒烟（不发网、不写库）
 */
const path = require('path')
const mpRoot = path.join(__dirname, '..')

global.wx = {
  getStorageSync() {
    return ''
  },
  setStorageSync() {},
  removeStorageSync() {},
  request() {},
}

const adsUi = require(path.join(mpRoot, 'utils/adsManageUiMp.js'))
const leadsUi = require(path.join(mpRoot, 'utils/leadsCenterUiMp.js'))
const finUi = require(path.join(mpRoot, 'utils/financeReconcileUiMp.js'))

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const ad = adsUi.enrichAdRow({
  id: 'p1',
  name: '本地推计划',
  status: 'ENABLE',
  budget: '200',
  spend: '12.3',
  exposure: '1000',
  click: '20',
  tags: ['本地推'],
})
assert(ad.id === 'p1', 'ad id')
assert(ad.actionLabel === '暂停', 'running action is pause')
assert(ad.spend === '12.3', 'spend mapped')

const paused = adsUi.enrichAdRow({ id: 'p2', name: '千川', status: '暂停', tags: ['千川'] })
assert(paused.actionLabel === '继续投放', 'paused action')

const tabs = adsUi.tabCounts([ad, paused])
assert(Array.isArray(tabs) && tabs.length >= 2, 'status tabs')

const lead = leadsUi.enrichLeadRow({
  id: 'c1',
  name: '张三',
  phone: '13800138000',
  state: '待分配',
  source: '巨量本地推',
})
assert(lead.phone === '13800138000', 'lead phone kept for call')
assert(lead.phoneMasked.includes('****'), 'phone masked')
assert(lead.primaryAction === '分配', 'pending primary')

const cards = finUi.mapApiRows([
  {
    platformLabel: '抖音',
    date: '2026-09-21',
    orderCount: 3,
    verifyOrderCount: 3,
    salesAmountYuan: 100,
    verifyAmountYuan: 100,
  },
])
assert(cards.length === 1, 'finance row')
assert(cards[0].payable === 100 || cards[0].payable === '100', 'finance payable')

console.log('OK: erp-mp feature-align smoke')
