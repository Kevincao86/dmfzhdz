/**
 * 校验 sk-api- 国内 Key 优先走 api.minimaxi.com（避免 MINIMAX_REGION=intl 误打国际端点 2049）
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(path.join(root, 'src/lib/digitalHumanTtsCore.ts'), 'utf8')

if (!src.includes('domesticKey') || !src.includes('speech-2.8-hd')) {
  console.error('FAIL: digitalHumanTtsCore missing domesticKey or speech-2.8-hd')
  process.exit(1)
}

if (!/intlFirst = \(region === 'intl' \|\| region === 'io'\) && !domesticKey/.test(src)) {
  console.error('FAIL: intlFirst must be gated by !domesticKey')
  process.exit(1)
}

if (!/国内 sk-api- Key 勿打 api.minimax.io/.test(src)) {
  console.error('FAIL: domestic sk-api- must not fallback to api.minimax.io')
  process.exit(1)
}

console.log('OK: MiniMax TTS domestic sk-api- routing guard present')
