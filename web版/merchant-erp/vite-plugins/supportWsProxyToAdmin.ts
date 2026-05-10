/**
 * 开发环境：把浏览器连到 ERP 同源的 /__meoo_support_online 透明转发到商家管理后台的同名 ws。
 *
 * 注意：configureServer 的「返回值」会被 Vite 在 dev server 启动后立刻调用（post hook），
 * 不能用来当 teardown；若在里面 removeListener + cancelled，会导致代理从未生效或立刻被拆掉。
 *
 * `ws` 使用 createRequire 可选加载：未安装时仅跳过转发并打印警告，避免 Vite 直接起不来。
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { Plugin } from 'vite'

/** 用项目根 package.json 定位 node_modules，避免 Vite 把配置编译到 .vite-temp 后 import.meta.url 导致 require('ws') 失败 */
const require = createRequire(join(process.cwd(), 'package.json'))

const PATH = '/__meoo_support_online'

function normalizeWsRaw(data: import('ws').RawData): Buffer | ArrayBuffer | Blob {
  if (Array.isArray(data)) return Buffer.concat(data as Buffer[])
  return data as Buffer | ArrayBuffer
}

function tryLoadWs():
  | {
      WebSocket: typeof import('ws').WebSocket
      WebSocketServer: typeof import('ws').WebSocketServer
    }
  | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('ws') as {
      WebSocket: typeof import('ws').WebSocket
      WebSocketServer: typeof import('ws').WebSocketServer
    }
  } catch {
    return null
  }
}

function adminWsBaseFromHttpOrigin(httpOrigin: string): string {
  const raw = httpOrigin.trim().replace(/\/$/, '')
  try {
    const u = new URL(raw.startsWith('http') ? raw : `http://${raw}`)
    const proto = u.protocol === 'https:' ? 'wss' : 'ws'
    const port = u.port || (u.protocol === 'https:' ? '443' : '80')
    return `${proto}://${u.hostname}:${port}`
  } catch {
    return 'ws://127.0.0.1:5174'
  }
}

function upgradePathOnly(req: IncomingMessage): string {
  const raw = (req.url ?? '').split('?')[0] ?? ''
  return raw.replace(/\/+$/, '') || '/'
}

export function supportWsProxyToAdminPlugin(options: { adminHttpOrigin: string }): Plugin {
  const adminWsBase = adminWsBaseFromHttpOrigin(options.adminHttpOrigin)
  const upstreamUrl = `${adminWsBase}${PATH}`

  return {
    name: 'support-ws-proxy-to-admin',
    configureServer(server) {
      let cancelled = false
      let mounted = false
      let upgradeListener: ((req: IncomingMessage, socket: Duplex, head: Buffer) => void) | null = null
      let wss: InstanceType<typeof import('ws').WebSocketServer> | null = null

      const teardown = () => {
        cancelled = true
        const httpServer = server.httpServer
        if (upgradeListener && httpServer) {
          httpServer.removeListener('upgrade', upgradeListener)
          upgradeListener = null
        }
        try {
          wss?.close()
        } catch {
          /* ignore */
        }
        wss = null
        mounted = false
      }

      const mount = () => {
        if (cancelled || mounted) return
        const httpServer = server.httpServer
        if (!httpServer) {
          // eslint-disable-next-line no-console
          console.warn('[support-ws-proxy] 无 httpServer，跳过')
          return
        }

        const wsMod = tryLoadWs()
        if (!wsMod) {
          // eslint-disable-next-line no-console
          console.warn(
            '[support-ws-proxy] 未找到依赖 ws，在线客服转发已禁用。请在 web版/merchant-erp 执行 npm install 后重启 dev。',
          )
          return
        }

        const { WebSocket, WebSocketServer } = wsMod
        wss = new WebSocketServer({ noServer: true })

        upgradeListener = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
          const pathOnly = upgradePathOnly(req)
          if (pathOnly !== PATH) return

          wss!.handleUpgrade(req, socket, head, (client) => {
            const upstream = new WebSocket(upstreamUrl)
            let cleaned = false
            const cleanup = () => {
              if (cleaned) return
              cleaned = true
              try {
                upstream.close()
              } catch {
                /* ignore */
              }
              try {
                client.close()
              } catch {
                /* ignore */
              }
            }

            /** 上游未 open 前浏览器会先发 identify，需排队避免丢包 */
            const pendingToUpstream: { data: Buffer | ArrayBuffer | Blob; isBinary: boolean }[] = []

            const flushPending = () => {
              while (pendingToUpstream.length > 0 && upstream.readyState === WebSocket.OPEN) {
                const q = pendingToUpstream.shift()!
                upstream.send(q.data, { binary: q.isBinary })
              }
            }

            client.on('message', (data, isBinary) => {
              const payload = normalizeWsRaw(data)
              if (upstream.readyState === WebSocket.OPEN) {
                upstream.send(payload, { binary: Boolean(isBinary) })
              } else {
                pendingToUpstream.push({ data: payload, isBinary: Boolean(isBinary) })
              }
            })

            upstream.on('open', () => {
              flushPending()
              upstream.on('message', (data, isBinary) => {
                const payload = normalizeWsRaw(data)
                if (client.readyState === WebSocket.OPEN) client.send(payload, { binary: Boolean(isBinary) })
              })
            })

            upstream.on('error', cleanup)
            client.on('error', cleanup)
            upstream.on('close', cleanup)
            client.on('close', cleanup)
          })
        }

        /** 先于 Vite 内部 upgrade，仅消费本路径 */
        httpServer.prependListener('upgrade', upgradeListener)
        mounted = true

        // eslint-disable-next-line no-console
        console.log(`[support-ws-proxy] 浏览器 ${PATH} → 转发至 ${upstreamUrl}`)
      }

      /** Vite：返回值在 server 就绪后调用，在此处挂载；close 时再 teardown */
      return () => {
        const httpServer = server.httpServer
        if (!httpServer) {
          // eslint-disable-next-line no-console
          console.warn('[support-ws-proxy] 无 httpServer，跳过')
          return
        }
        const run = () => mount()
        if (httpServer.listening) run()
        else httpServer.once('listening', run)
        httpServer.once('close', teardown)
      }
    },
  }
}
