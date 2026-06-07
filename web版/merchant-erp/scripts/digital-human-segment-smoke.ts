#!/usr/bin/env npx tsx
import { estimateDhSegmentCount } from '../src/lib/digitalHumanVideoRender.ts'
import { looksLikeVideoBytes } from '../src/lib/concatVideoSegments.ts'

const short = '10年就一次，必胜客49块钱的八件套终于回归了。'
if (estimateDhSegmentCount(short) !== 1) {
  console.error('FAIL: short script should be 1 segment')
  process.exit(1)
}

const ftyp = new Uint8Array(2048)
ftyp[4] = 0x66
ftyp[5] = 0x74
ftyp[6] = 0x79
ftyp[7] = 0x70
if (!looksLikeVideoBytes(ftyp)) {
  console.error('FAIL: ftyp sniff')
  process.exit(1)
}

console.log('OK: digital human segment estimate + video sniff')
