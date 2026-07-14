#!/usr/bin/env npx tsx
/** 智能成片：段数/素材映射/时长分配 单元自检 */
import assert from 'node:assert/strict'
import {
  buildSmartBatchSubmitPayload,
  dedupeSmartBatchMaterialPool,
  pickSmartBatchMaterialIndices,
  pickSmartBatchSegmentCount,
  prepareSmartBatchSubmitPayload,
} from '../src/lib/iceSmartBatchPlan.js'

assert.equal(pickSmartBatchSegmentCount([], 32, 30), 6, '30s → 6 segments')
assert.equal(pickSmartBatchSegmentCount([], 2, 30), 6, '30s with 2 materials still → 6 segments')

const twoMatIndices = pickSmartBatchMaterialIndices(2, [], 6)
assert.deepEqual(twoMatIndices, [0, 1, 0, 1, 0, 1], '2 materials cycle for 6 segments')

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
assert.equal(payload.materials.length, 32, 'keep full material pool')
assert.equal(payload.materialSlots.length, 6, 'slots map segments to pool indices')
assert.equal(payload.materialSlots[0], 2)
assert.equal(payload.materialSlots[4], 22)
assert.equal(payload.scriptRows[5]?.timeRange, '25-30秒', 'last row covers 25-30s')

const expanded = prepareSmartBatchSubmitPayload({
  materials: [
    { kind: 'video', mediaUrl: 'https://example.com/a.mp4' },
    { kind: 'video', mediaUrl: 'https://example.com/b.mp4' },
    { kind: 'video', mediaUrl: 'https://example.com/a.mp4' },
    { kind: 'video', mediaUrl: 'https://example.com/b.mp4' },
  ],
  scriptRows: [{ dialogue: 'a' }, { dialogue: 'b' }, { dialogue: 'c' }, { dialogue: 'd' }],
  materialSlots: [0, 1, 2, 3],
  targetTotalSec: 20,
})
assert.equal(expanded.materials.length, 2, 'dedupe expanded pool')
assert.deepEqual(expanded.materialSlots, [0, 1, 0, 1], 'remap expanded slots')

const { pool, remapMaterialIndex } = dedupeSmartBatchMaterialPool(expanded.materials)
assert.equal(pool.length, 2)
assert.equal(remapMaterialIndex(0), 0)

console.log('OK: ice-smart-batch-plan-smoke')
