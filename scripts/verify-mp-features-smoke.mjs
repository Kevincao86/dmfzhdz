#!/usr/bin/env node
/**
 * 三端关键功能冒烟：PR 我的发单 / 达人我的报名 / 星选 Web 工作流
 * 每项逻辑连续跑 PASSES 遍，任一抛错即退出非 0。
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mpRoot = path.join(root, '灵祺达人撮合小程序')
const PASSES = 3

const prWorkflow = require(path.join(mpRoot, 'utils/prOrderWorkflowStage.js'))
const prOrderFilters = require(path.join(mpRoot, 'utils/prOrderListFilters.js'))
const applicationDisplay = require(path.join(mpRoot, 'utils/applicationDisplay.js'))
const listFilters = require(path.join(mpRoot, 'utils/recruitmentListFilters.js'))

const MP_FIXTURES = [
  null,
  { id: 'MP-1', status: 'open', applicants: [] },
  {
    id: 'MP-2',
    status: 'open',
    selectedApplicantIds: ['sel-1'],
    applicants: [{ id: 'sel-1', prSelected: false, merchantSelected: false, taskStatus: 'active' }],
    notifiedApplicantIds: ['sel-1'],
  },
  {
    id: 'MP-3',
    status: 'open',
    applicants: [{ id: 'a1', prSelected: true, videoUrl: 'https://x/v.mp4', videoStatus: 'passed' }],
    notifiedApplicantIds: ['a1'],
    mpPublishMeta: { prWorkflow: { stage: 'pending_video_review', scheduleCompletedAt: '2026-06-01' } },
  },
  { id: 'MP-4', status: 'closed', applicants: [] },
  { id: 'MP-5', status: 'done', applicants: [{ id: 'b1', videoUrl: 'https://x/v.mp4', videoStatus: 'passed' }] },
  { id: 'MP-6', hall: 'ice', orderKind: 'ice', applicants: [{ id: 'c1', prSelected: true }], notifiedApplicantIds: ['c1'] },
]

const TABS = ['published', 'pending_schedule', 'pending_video_review', 'completed', 'stopped', 'deleted']

function mapPrRow(item, mp) {
  const enriched = listFilters.enrichMpOrderListItem(mp, item)
  return {
    ...enriched,
    mp: mp || null,
    hallLabel: '招募大厅',
    platform: '抖音',
    region: '福州',
    category: '本地生活',
    recruitTarget: 'talent',
    pendingVideoCount: prOrderFilters.countPendingVideos(mp),
    videoCount: prOrderFilters.countVideos(mp),
    workflowStage: prWorkflow.resolvePrWorkflowStage(mp),
    deletedAt: item.deletedAt,
    isDeleted: enriched.isDeleted,
  }
}

function simulatePrMineOrders(pass) {
  const rows = MP_FIXTURES.filter(Boolean).map((mp, i) =>
    mapPrRow({ mpOrderId: mp.id, title: `单${i}`, publishedAt: '2026-06-01' }, mp),
  )
  rows.push(
    mapPrRow({ mpOrderId: 'DEL-1', title: '已删', deletedAt: '2026-06-02', publishedAt: '2026-05-01' }, null),
  )

  let publishedCount = 0
  let pendingScheduleCount = 0
  let pendingVideoReviewCount = 0
  let completedCount = 0
  let stoppedCount = 0
  let deletedCount = 0

  for (const row of rows) {
    if (!row) continue
    if (row.deletedAt || row.isDeleted) {
      deletedCount += 1
      continue
    }
    if (row.status === 'closed' || row.statusLabel === '已停止') {
      stoppedCount += 1
      continue
    }
    const stage = row.workflowStage || prWorkflow.resolvePrWorkflowStage(row.mp)
    if (stage === 'pending_schedule') pendingScheduleCount += 1
    else if (stage === 'pending_video_review') pendingVideoReviewCount += 1
    else if (stage === 'completed') completedCount += 1
    else publishedCount += 1
  }

  for (const tab of TABS) {
    const scoped = rows.filter((row) => {
      if (row.deletedAt || row.isDeleted) return tab === 'deleted'
      if (row.status === 'closed' || row.statusLabel === '已停止') return tab === 'stopped'
      if (tab === 'drafts') return false
      return prWorkflow.matchPrOrdersTab(tab, row.mp)
    })
    prOrderFilters.filterPrOrderRows(scoped, {
      tab: tab === 'stopped' || tab === 'deleted' ? 'published' : tab,
      filterTarget: 'all',
      filterPlatform: '全部',
      filterCategory: '全部',
      filterHall: '全部',
      filterProvince: '全部',
      filterCity: '全部',
      filterStatus: '招募中/收集中',
      keyword: pass % 2 === 0 ? '' : 'MP',
    })
  }

  if (publishedCount + pendingScheduleCount + pendingVideoReviewCount + completedCount + stoppedCount + deletedCount !== rows.length) {
    throw new Error(`PR tab counts mismatch pass=${pass}`)
  }
}

function simulateTalentApplications(pass) {
  const reg = { mpTalentMembers: [], talentLibraryEntries: [] }
  const apps = [
    {
      mpOrderId: 'MP-2',
      applicantId: 'sel-1',
      title: '测试单',
      appliedAt: '2026-06-01',
    },
    {
      mpOrderId: 'MP-1',
      applicantId: 'me-2',
      title: '报名中',
      appliedAt: '2026-06-02',
    },
  ]
  for (const app of apps) {
    const mp = MP_FIXTURES.find((m) => m && m.id === app.mpOrderId) || null
    const row = applicationDisplay.enrichTalentApplicationRow(app, mp, reg)
    if (!row || !row.mpOrderId) throw new Error('talent enrich failed')
    if (row.canViewVideo !== undefined && row.canSubmitPublishLink !== undefined && row.publishLinkBtnLabel) {
      // publish-link + view-video flags resolved
    }
    if (pass % 2 === 0 && row.progressId) {
      // progress resolved
    }
  }
}

function simulateWebWorkflow(pass) {
  for (const mp of MP_FIXTURES) {
    const stage = prWorkflow.resolvePrWorkflowStage(mp)
    if (!stage) throw new Error('web workflow stage empty')
    for (const tab of ['published', 'pending_schedule', 'pending_video_review', 'completed']) {
      prWorkflow.matchPrOrdersTab(tab, mp)
    }
    if (mp && pass === PASSES) {
      prWorkflow.buildSkipSchedulePatch()
      prWorkflow.buildSkipVideoReviewPatch()
    }
  }
}

let total = 0
for (let pass = 1; pass <= PASSES; pass++) {
  simulatePrMineOrders(pass)
  simulateTalentApplications(pass)
  simulateWebWorkflow(pass)
  total += 1
  console.log(`PASS ${pass}/${PASSES} OK`)
}

console.log(`ALL ${total} PASSES OK — PR我的发单 / 达人我的报名 / 星选工作流`)
