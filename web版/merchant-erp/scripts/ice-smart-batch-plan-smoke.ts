#!/usr/bin/env npx tsx
/** 智能成片：段数/素材映射/时长分配 单元自检 */
import assert from 'node:assert/strict'
import {
  buildSmartBatchSubmitPayload,
  pickSmartBatchMaterialIndices,
  pickSmartBatchSegmentCount,
} from '../src/lib/iceSmartBatchPlan.js'

assert.equal(pickSmartBatchSegmentCount([], 32, 30), 6, '30s → 6 segments')

const indices = pickSmartBatchMaterialIndices(32, [2, 5, 8, 15, 22], 6)
assert.equal(indices.length, 6, 'must pad to 6 segments')
assert.equal(indices[0], 2)
assert.equal(indices[1], 5)
assert.equal(indices[4], 22)

const payload = buildSmartBatchSubmitPayload({
  materials: Array.from({ length: 32 }, (_, i) => ({
    kind: 'video' as const,
    mediaUrl: `https://example.com/v${i}.mp4`,
    label: `v${i}`,
  })),
  scriptRows: [
    { timeRange: '0-5秒', visual: '门头展示', dialogue: '欢迎光临' },
    { timeRange: '5-10秒', visual: '招牌菜', dialogue: '招牌必点' },
    { timeRange: '10-15秒', visual: '制作过程', dialogue: '现做现卖' },
    { timeRange: '15-20秒', visual: '顾客试吃', dialogue: '口感绝佳' },
    { timeRange: '20-25秒', visual: '环境氛围', dialogue: '环境舒适' },
  ],
  materialSlots: [2, 5, 8, 15, 22],
  targetTotalSec: 30,
})
assert.equal(payload.segmentCount, 6, 'payload segment count')
assert.equal(payload.scriptRows.length, 6, 'rows padded to 6')
assert.equal(payload.materials.length, 6, 'materials picked')
assert.equal(payload.scriptRows[5]?.timeRange, '25-30秒', 'last row covers 25-30s')

console.log('OK: ice-smart-batch-plan-smoke')
