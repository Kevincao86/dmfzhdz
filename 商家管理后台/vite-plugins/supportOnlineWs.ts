/**
 * 开发环境：在线客服 WebSocket（商家 ERP 浮窗 ↔ 本控制台「在线客服」页直连，不经 ERP 中继）。
 * 挂载在本应用 Vite dev 的 HTTP upgrade：`/__meoo_support_online`
 * 依赖 `ws`：未安装时跳过（请在本目录 npm install）。
 *
 * 注意：须在 configureServer **返回的 post 钩子**里挂载（Vite 8 在首段同步调用时 httpServer 可能尚未就绪）。
 */
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { Plugin } from 'vite'

export const SUPPORT_ONLINE_WS_PATH = '/__meoo_support_online'

const WS_OPEN = 1

type ClientMeta = { role: 'merchant' | 'ops'; sessionId: string | null }

type ChatLine = {
  type: 'chat'
  sessionId: string
  from: 'user' | 'bot' | 'agent' | 'system' | 'ops'
  text: string
  ts: number
  id: string
}

type SessionMetaLine = {
  type: 'session_meta'
  sessionId: string
  customerId?: string
  enterpriseName?: string
}

type ClientSocket = {
  readyState: number
  send(data: string): void
  on(event: string, fn: (...args: unknown[]) => void): void
}

function safeJson(raw: unknown): Record<string, unknown> | null {
  try {
    if (typeof raw === 'string') return JSON.parse(raw) as Record<string, unknown>
    if (Buffer.isBuffer(raw)) return JSON.parse(raw.toString('utf8')) as Record<string, unknown>
    return null
  } catch {
    return null
  }
}

export function supportOnlineWsPlugin(): Plugin {
  const metaByWs = new Map<ClientSocket, ClientMeta>()
  const room = new Map<string, Set<ClientSocket>>()
  const ops = new Set<ClientSocket>()
  const history = new Map<string, ChatLine[]>()
  /** 会话维度客户资料（由商家 identify 上报） */
  const sessionMeta = new Map<string, { customerId?: string; enterpriseName?: string }>()

  function addToRoom(sid: string, ws: ClientSocket) {
    if (!room.has(sid)) room.set(sid, new Set())
    room.get(sid)!.add(ws)
  }

  function removeFromRoom(sid: string, ws: ClientSocket) {
    const s = room.get(sid)
    if (!s) return
    s.delete(ws)
    if (s.size === 0) room.delete(sid)
  }

  function send(ws: ClientSocket, obj: unknown) {
    if (ws.readyState !== WS_OPEN) return
    ws.send(JSON.stringify(obj))
  }

  function broadcastToRoom(sid: string, line: ChatLine, exclude?: ClientSocket) {
    for (const ws of room.get(sid) ?? []) {
      if (ws !== exclude) send(ws, line)
    }
  }

  function broadcastToOps(line: ChatLine | SessionMetaLine, exclude?: ClientSocket) {
    for (const ws of ops) {
      if (ws !== exclude) send(ws, line)
    }
  }

  function pushHistory(line: ChatLine) {
    const arr = history.get(line.sessionId) ?? []
    arr.push(line)
    while (arr.length > 200) arr.shift()
    history.set(line.sessionId, arr)
  }

  function attachClient(ws: ClientSocket) {
    metaByWs.set(ws, { role: 'merchant', sessionId: null })

    ws.on('message', (raw) => {
      const data = safeJson(raw)
      if (!data) return

      if (data.type === 'identify') {
        const role = data.role === 'ops' ? 'ops' : 'merchant'
        const sessionId = typeof data.sessionId === 'string' ? data.sessionId.trim() : ''
        if (role === 'merchant' && !sessionId) return
        metaByWs.set(ws, { role, sessionId: role === 'ops' ? null : sessionId })
        if (role === 'merchant') {
          addToRoom(sessionId, ws)
          const cid = typeof data.customerId === 'string' ? data.customerId.trim() : ''
          const ename = typeof data.enterpriseName === 'string' ? data.enterpriseName.trim() : ''
          const prevMeta = sessionMeta.get(sessionId) ?? {}
          const profile = {
            ...prevMeta,
            ...(cid ? { customerId: cid } : {}),
            ...(ename ? { enterpriseName: ename } : {}),
          }
          sessionMeta.set(sessionId, profile)
          const metaLine: SessionMetaLine = { type: 'session_meta', sessionId, ...profile }
          broadcastToOps(metaLine)
          const hist = history.get(sessionId) ?? []
          for (const line of hist) send(ws, line)
        } else {
          ops.add(ws)
          for (const [sid, profile] of sessionMeta.entries()) {
            send(ws, { type: 'session_meta', sessionId: sid, ...profile })
          }
          for (const lines of history.values()) {
            for (const line of lines) send(ws, line)
          }
        }
        return
      }

      /** 运营端按时间段拉取内存中的对话（每会话最多保留最近 200 条） */
      if (data.type === 'export_query') {
        const meta = metaByWs.get(ws)
        if (!meta || meta.role !== 'ops') return
        const exportId = typeof data.exportId === 'string' ? data.exportId : ''
        const startTs = typeof data.startTs === 'number' ? data.startTs : 0
        const endTs = typeof data.endTs === 'number' ? data.endTs : Date.now()
        const onlySidRaw = data.sessionId
        const onlySid =
          typeof onlySidRaw === 'string' && onlySidRaw.trim().length > 0 ? onlySidRaw.trim() : null
        const out: ChatLine[] = []
        for (const [sid, arr] of history) {
          if (onlySid && sid !== onlySid) continue
          for (const line of arr) {
            if (line.ts >= startTs && line.ts <= endTs) out.push(line)
          }
        }
        out.sort((a, b) => (a.ts !== b.ts ? a.ts - b.ts : a.id.localeCompare(b.id)))
        send(ws, { type: 'export_result', exportId, lines: out })
        return
      }

      if (data.type !== 'chat') return
      const meta = metaByWs.get(ws)
      if (!meta) return
      const sid = typeof data.sessionId === 'string' ? data.sessionId.trim() : ''
      if (!sid) return

      const id = typeof data.id === 'string' && data.id ? data.id : `srv_${Date.now()}`
      const text = typeof data.text === 'string' ? data.text : ''
      const ts = typeof data.ts === 'number' ? data.ts : Date.now()

      let from: ChatLine['from'] = 'user'
      if (meta.role === 'ops') {
        from = 'ops'
      } else {
        const f = data.from
        if (f === 'bot' || f === 'agent' || f === 'system' || f === 'user') from = f
        else from = 'user'
      }

      const line: ChatLine = { type: 'chat', sessionId: sid, from, text, ts, id }
      pushHistory(line)

      if (meta.role === 'ops') {
        broadcastToRoom(sid, line)
      } else {
        broadcastToRoom(sid, line, ws)
        broadcastToOps(line)
      }
    })

    ws.on('close', () => {
      const m = metaByWs.get(ws)
      metaByWs.delete(ws)
      if (m?.role === 'ops') {
        ops.delete(ws)
      } else if (m?.sessionId) {
        removeFromRoom(m.sessionId, ws)
      }
    })
  }

  return {
    name: 'support-online-ws',
    configureServer(server) {
      let cancelled = false
      let upgradeListener:
        | ((req: IncomingMessage, socket: Duplex, head: Buffer) => void)
        | null = null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let wss: any = null
      let mounted = false

      const teardown = () => {
        cancelled = true
        const httpServer = server.httpServer
        if (upgradeListener && httpServer) {
          httpServer.off('upgrade', upgradeListener)
          upgradeListener = null
        }
        try {
          wss?.close()
        } catch {
          /* ignore */
        }
        wss = null
        metaByWs.clear()
        room.clear()
        ops.clear()
        history.clear()
        sessionMeta.clear()
        mounted = false
      }

      const mount = () => {
        if (mounted || cancelled) return
        const httpServer = server.httpServer
        if (!httpServer) {
          // eslint-disable-next-line no-console
          console.warn('[support-online-ws] 无 httpServer，跳过在线客服 WebSocket')
          return
        }

        void import('ws')
          .then((wsMod) => {
            if (cancelled || mounted) return
            const { WebSocketServer } = wsMod
            wss = new WebSocketServer({ noServer: true })
            wss.on('connection', (socket: ClientSocket) => {
              attachClient(socket)
            })

            upgradeListener = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
              const pathOnly = (req.url ?? '').split('?')[0] ?? ''
              if (pathOnly !== SUPPORT_ONLINE_WS_PATH) return
              wss.handleUpgrade(req, socket, head, (client: ClientSocket) => {
                wss.emit('connection', client, req)
              })
            }
            httpServer.on('upgrade', upgradeListener)
            mounted = true

            // eslint-disable-next-line no-console
            console.log(
              `[support-online-ws] 已挂载 ${SUPPORT_ONLINE_WS_PATH}（商家 ERP 浮窗直连本控制台，无需经 ERP）`,
            )
          })
          .catch(() => {
            // eslint-disable-next-line no-console
            console.warn('[support-online-ws] 未安装依赖 ws，请在本目录执行 npm install')
          })
      }

      /** Post 阶段再挂 upgrade，兼容 Vite 8 初始化顺序 */
      return () => {
        const httpServer = server.httpServer
        if (!httpServer) {
          // eslint-disable-next-line no-console
          console.warn('[support-online-ws] 无 httpServer，跳过在线客服 WebSocket')
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
