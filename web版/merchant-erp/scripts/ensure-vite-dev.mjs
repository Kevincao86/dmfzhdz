/**
 * 从任意工作目录用 `node …/ensure-vite-dev.mjs` 启动时，仍切到 merchant-erp 根目录并调用本地 Vite；
 * 若未安装依赖则给出明确中文提示（避免浏览器 ERR_CONNECTION_REFUSED 却不知原因）。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(root)

const viteJs = join(root, 'node_modules', 'vite', 'bin', 'vite.js')
if (!existsSync(viteJs)) {
  console.error(
    '\n[merchant-erp] 未找到 node_modules/vite。请先在本目录安装依赖：\n  cd ' +
      JSON.stringify(root) +
      '\n  npm install\n',
  )
  process.exit(1)
}

const extra = process.argv.slice(2)
const child = spawn(process.execPath, [viteJs, ...extra], {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
})

child.on('error', (err) => {
  console.error('[merchant-erp] 无法启动 Vite：', err.message)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) process.exit(1)
  process.exit(code ?? 0)
})
