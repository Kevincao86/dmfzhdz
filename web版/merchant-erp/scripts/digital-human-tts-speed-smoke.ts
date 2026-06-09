/**
 * 校验 MiniMax speed 整型映射（0.5–2.0 → 1–45），避免 duration must be in [1, 45]。
 */
import { toMinimaxSpeedInt } from '../src/lib/digitalHumanTtsCore.js'

const cases: Array<{ rate: number; min: number; max: number }> = [
  { rate: 0.5, min: 1, max: 1 },
  { rate: 0.72, min: 1, max: 15 },
  { rate: 0.94, min: 10, max: 20 },
  { rate: 1.0, min: 14, max: 18 },
  { rate: 1.35, min: 24, max: 28 },
  { rate: 2.0, min: 45, max: 45 },
]

for (const { rate, min, max } of cases) {
  const out = toMinimaxSpeedInt(rate)
  if (!Number.isInteger(out) || out < 1 || out > 45) {
    console.error('FAIL:', rate, '→', out, 'not integer in [1,45]')
    process.exit(1)
  }
  if (out < min || out > max) {
    console.error('FAIL:', rate, '→', out, `expected ~${min}-${max}`)
    process.exit(1)
  }
}

console.log('OK: toMinimaxSpeedInt maps browser rates to MiniMax integer speed [1,45]')
