#!/usr/bin/env npx tsx
import {
  clampSeedanceVideoDuration,
  clampSeedanceV2Duration,
  parseSeedanceCliFlags,
  stripSeedanceDurFlag,
} from '../src/lib/arkVideoEndpointsConfig.ts'

const flags = parseSeedanceCliFlags('--dur 10 --fps 24 --ratio 9:16 --wm false')
const clamped15 = clampSeedanceVideoDuration('doubao-seedance-1-5-pro-251215', flags.duration ?? 10)
if (clamped15 !== 10) {
  console.error(`FAIL: expected 1.5 pro clamp 10 -> 10, got ${clamped15}`)
  process.exit(1)
}
const clamped20 = clampSeedanceVideoDuration('doubao-seedance-2-0-pro', 10)
if (clamped20 !== 10) {
  console.error(`FAIL: expected 2.0 clamp 10 -> 10, got ${clamped20}`)
  process.exit(1)
}
if (stripSeedanceDurFlag('--dur 4 --fps 24 --ratio 9:16') !== '--fps 24 --ratio 9:16') {
  console.error('FAIL: stripSeedanceDurFlag')
  process.exit(1)
}
if (clampSeedanceV2Duration(4) !== 4) {
  console.error('FAIL: legacy clamp 4 should stay 4')
  process.exit(1)
}
if (clampSeedanceVideoDuration('doubao-seedance-1-5-pro', 2) !== 4) {
  console.error('FAIL: 2 should clamp to min 4 on 1.5 pro')
  process.exit(1)
}

console.log('OK: Seedance duration clamp')
