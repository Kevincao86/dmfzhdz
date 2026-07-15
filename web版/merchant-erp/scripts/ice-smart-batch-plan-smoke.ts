#!/usr/bin/env npx tsx
/** 智能成片：段数/素材映射/时长分配 单元自检 */
import assert from 'node:assert/strict'
import {
  buildSmartBatchSubmitPayload,
  dedupeSmartBatchMaterialPool,
  distributeSmartBatchSegmentDurations,
  pickSmartBatchMaterialIndices,
  pickSmartBatchSegmentCount,
  prepareSmartBatchSubmitPayload,
} from '../src/lib/iceSmartBatchPlan.js'

assert.equal(pickSmartBatchSegmentCount([], 32, 30), 8, '30s → 8 segments (≤4s each, no loop)')
assert.equal(pickSmartBatchSegmentCount([], 32, 27), 7, '27s → 7 segments')
assert.equal(pickSmartBatchSegmentCount([], 2, 30), 2, '2 materials cap segments to pool size')

const dur27 = distributeSmartBatchSegmentDurations(7, 27)
assert.equal(Math.round(dur27.reduce((a, b) => a + b, 0) * 100) / 100, 27, 'durations sum to target')
assert.ok(dur27.every((d) => d <= 4.01), 'each segment ≤4s when 7 segments for 27s')

const twoMatIndices = pickSmartBatchMaterialIndices(2, [], 6)
assert.deepEqual(twoMatIndices, [0, 1], '2 materials: no cycling reuse')
assert.equal(new Set(twoMatIndices).size, twoMatIndices.length, 'all picked indices unique')

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
assert.equal(payload.segmentCount, 8, 'payload segment count for 30s')
assert.equal(payload.scriptRows.length, 8, 'rows padded to 8')
assert.equal(payload.materials.length, 32, 'keep full material pool')
assert.equal(payload.materialSlots.length, 8, 'slots map segments to pool indices')
assert.equal(new Set(payload.materialSlots).size, payload.materialSlots.length, 'no duplicate materials')
const sumDur = distributeSmartBatchSegmentDurations(payload.segmentCount, 30).reduce((a, b) => a + b, 0)
assert.equal(Math.round(sumDur * 100) / 100, 30, 'timeline sums to 30s')

const twoMatPayload = buildSmartBatchSubmitPayload({
  materials: [
    { kind: 'video', mediaUrl: 'https://example.com/a.mp4' },
    { kind: 'video', mediaUrl: 'https://example.com/b.mp4' },
  ],
  scriptRows: [
    { timeRange: '0-5秒', dialogue: 'a' },
    { timeRange: '5-10秒', dialogue: 'b' },
    { timeRange: '10-15秒', dialogue: 'c' },
    { timeRange: '15-20秒', dialogue: 'd' },
    { timeRange: '20-25秒', dialogue: 'e' },
    { timeRange: '25-30秒', dialogue: 'f' },
  ],
  targetTotalSec: 30,
})
assert.equal(twoMatPayload.segmentCount, 2, '2 materials → 2 segments for 30s')
assert.deepEqual(twoMatPayload.materialSlots, [0, 1], 'each material used once')

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
assert.equal(expanded.segmentCount, 2, 'deduped pool caps segment count')
assert.deepEqual(expanded.materialSlots, [0, 1], 'remap expanded slots without reuse')

const { pool, remapMaterialIndex } = dedupeSmartBatchMaterialPool(expanded.materials)
assert.equal(pool.length, 2)
assert.equal(remapMaterialIndex(0), 0)

console.log('OK: ice-smart-batch-plan-smoke')
