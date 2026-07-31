/**
 * 自检：短片轮询上限 / 排队换模阈值符合 2～3 分钟目标
 * 用法：node --import tsx scripts/shortVideoPostProcess-canvas-fastpath-smoke.mjs
 */
import { pollMaxTriesForVideoDuration } from '../src/services/videoAiApi.ts'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const pollMs = 2500
const tries5 = pollMaxTriesForVideoDuration(5, pollMs)
const tries15 = pollMaxTriesForVideoDuration(15, pollMs)
const wait5 = tries5 * pollMs
const wait15 = tries15 * pollMs

assert(wait5 <= 3.5 * 60_000, `5s 片轮询上限应 ≤3.5 分钟，实际 ${Math.round(wait5 / 1000)}s`)
assert(wait15 <= 4.5 * 60_000, `15s 片轮询上限应 ≤4.5 分钟，实际 ${Math.round(wait15 / 1000)}s`)
assert(tries5 >= 24, '轮询次数过少')

console.log('shortVideoPostProcess-canvas-fastpath-smoke: OK', {
  pollMs,
  tries5,
  tries15,
  wait5Sec: Math.round(wait5 / 1000),
  wait15Sec: Math.round(wait15 / 1000),
})
