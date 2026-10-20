import { createRequire } from 'node:module'

const require = createRequire(new URL('../package.json', import.meta.url))
if (typeof globalThis.WebSocket !== 'function') {
  globalThis.WebSocket = require('ws')
}
