#!/usr/bin/env npx tsx
import {
  clampSeedanceV2Duration,
  parseSeedanceCliFlags,
} from '../src/lib/arkVideoEndpointsConfig.ts'

const flags = parseSeedanceCliFlags('--dur 10 --fps 24 --ratio 9:16 --wm false')
const clamped = clampSeedanceV2Duration(flags.duration ?? 10)
if (clamped !== 4.5) {
  console.error(`FAIL: expected clamp 10 -> 4.5, got ${clamped}`)
  process.exit(1)
}
if (clampSeedanceV2Duration(4) !== 4) {
  console.error('FAIL: 4 should stay 4')
  process.exit(1)
}
if (clampSeedanceV2Duration(2) !== 3) {
  console.error('FAIL: 2 should clamp to 3')
  process.exit(1)
}

console.log('OK: Seedance v2 duration clamp')
