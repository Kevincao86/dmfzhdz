import { Headphones, Minimize2, Send, User } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { cn } from '../cn'
import {
  formatSupportRelayTime,
  getOrCreateSupportRelaySessionId,
  getSupportRelayWsUrl,
  type SupportRelayChatLine,
} from '../lib/supportRelay'

type ChatRole = 'user' | 'bot' | 'agent' | 'ops' | 'system'

type ChatMessage = {
  id: string
  role: ChatRole
  text: string
  at: string
}

function nowTime(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function relayFromToRole(from: SupportRelayChatLine['from']): ChatRole {
  if (from === 'ops') return 'ops'
  if (from === 'system') return 'system'
  if (from === 'agent') return 'agent'
  if (from === 'bot') return 'bot'
  return 'user'
}

type FloatingOnlineSupportProps = {
  /** 登录账户编号（如 DMF001），运营台展示为「客户ID」 */
  customerId?: string
  /** 租户企业名称（tenants.name），运营台展示在顶部「企业名称」 */
  enterpriseName?: string
}

export default function FloatingOnlineSupport({
  customerId = '',
  enterpriseName = '',
}: FloatingOnlineSupportProps) {
  const panelId = useId()
  const sessionIdRef = useRef(getOrCreateSupportRelaySessionId())
  const wsRef = useRef<WebSocket | null>(null)
  const customerIdRef = useRef(customerId)
  const enterpriseNameRef = useRef(enterpriseName)
  const [open, setOpen] = useState(false)
  const [humanMode, setHumanMode] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [relayReady, setRelayReady] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'm0',
      role: 'bot',
      text: '您好，我是店魔方智能助手，可解答常见问题。如需人工协助，请点击下方「转人工服务」。',
      at: nowTime(),
    },
  ])
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    customerIdRef.current = customerId
  }, [customerId])
  useEffect(() => {
    enterpriseNameRef.current = enterpriseName
  }, [enterpriseName])

  const customSupportWsUrl =
    typeof import.meta.env.VITE_SUPPORT_RELAY_WS === 'string' && import.meta.env.VITE_SUPPORT_RELAY_WS.trim().length > 0

  const scrollBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = listRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [])

  useEffect(() => {
    scrollBottom()
  }, [messages, open, scrollBottom])

  /** 未配置 ws 地址时视为「仅本地」成功；已配置管理后台直连但未连上则为 false（避免界面已发、运营台收不到） */
  const relayEmit = useCallback((from: SupportRelayChatLine['from'], text: string, id: string): boolean => {
    const base = getSupportRelayWsUrl()
    if (!base) return true
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    const payload: SupportRelayChatLine = {
      type: 'chat',
      sessionId: sessionIdRef.current,
      from,
      text,
      ts: Date.now(),
      id,
    }
    ws.send(JSON.stringify(payload))
    return true
  }, [])

  useEffect(() => {
    const base = getSupportRelayWsUrl()
    if (!base) {
      setRelayReady(false)
      return
    }

    let disposed = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let attempt = 0
    let activeWs: WebSocket | null = null

    const connect = () => {
      if (disposed) return
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      try {
        activeWs?.close()
      } catch {
        /* ignore */
      }
      const ws = new WebSocket(base)
      activeWs = ws
      wsRef.current = ws

      ws.onopen = () => {
        if (disposed) {
          try {
            ws.close()
          } catch {
            /* ignore */
          }
          return
        }
        attempt = 0
        const cid = customerIdRef.current.trim()
        const en = enterpriseNameRef.current.trim()
        ws.send(
          JSON.stringify({
            type: 'identify',
            role: 'merchant',
            sessionId: sessionIdRef.current,
            ...(cid ? { customerId: cid } : {}),
            ...(en ? { enterpriseName: en } : {}),
          }),
        )
        setRelayReady(true)
      }

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null
        setRelayReady(false)
        if (disposed || ws !== activeWs) return
        const delay = Math.min(20_000, 500 + attempt * 800)
        attempt += 1
        reconnectTimer = window.setTimeout(connect, delay)
      }

      ws.onerror = () => {
        setRelayReady(false)
      }

      ws.onmessage = (ev) => {
        let data: unknown
        try {
          data = JSON.parse(String(ev.data))
        } catch {
          return
        }
        if (!data || typeof data !== 'object' || (data as { type?: string }).type !== 'chat') return
        const line = data as SupportRelayChatLine
        if (line.sessionId !== sessionIdRef.current) return
        setMessages((prev) => {
          if (prev.some((m) => m.id === line.id)) return prev
          return [
            ...prev,
            {
              id: line.id,
              role: relayFromToRole(line.from),
              text: line.text,
              at: formatSupportRelayTime(line.ts),
            },
          ]
        })
      }
    }

    connect()

    return () => {
      disposed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (wsRef.current === activeWs) wsRef.current = null
      try {
        activeWs?.close()
      } catch {
        /* ignore */
      }
      activeWs = null
    }
  }, [])

  /** 登录信息变更后补发 identify，便于运营台更新企业名称 / 客户ID（不重连 WS） */
  useEffect(() => {
    const ws = wsRef.current
    const base = getSupportRelayWsUrl()
    if (!base || !ws || ws.readyState !== WebSocket.OPEN) return
    const cid = customerId.trim()
    const en = enterpriseName.trim()
    ws.send(
      JSON.stringify({
        type: 'identify',
        role: 'merchant',
        sessionId: sessionIdRef.current,
        ...(cid ? { customerId: cid } : {}),
        ...(en ? { enterpriseName: en } : {}),
      }),
    )
  }, [customerId, enterpriseName])

  const pushMessage = useCallback((role: ChatRole, text: string, id?: string) => {
    const mid = id ?? `m_${Date.now()}_${Math.random().toString(36).slice(2)}`
    setMessages((prev) => [...prev, { id: mid, role, text, at: nowTime() }])
    return mid
  }, [])

  const requestHuman = () => {
    if (humanMode || connecting) return
    setConnecting(true)
    const sysText =
      '已为您接入店魔方人工客服，请在下方直接描述问题，客服同事将在此会话中回复'
    const bid = pushMessage('system', sysText)
    const synced = relayEmit('system', sysText, bid)
    window.setTimeout(() => {
      setConnecting(false)
      if (!getSupportRelayWsUrl() || synced) {
        setHumanMode(true)
      } else {
        pushMessage(
          'system',
          '暂无法连接到人工客服会话。请稍后重试，或通过电话 / 工单联系您的客户经理；若为贵司私有化环境，请联系管理员确认客服通道已启用。',
        )
      }
    }, 400)
  }

  const send = () => {
    if (getSupportRelayWsUrl() && !relayReady) return
    const t = input.trim()
    if (!t) return
    setInput('')
    const uid = pushMessage('user', t)
    const synced = relayEmit('user', t, uid)
    if (!synced && getSupportRelayWsUrl()) {
      pushMessage(
        'system',
        '消息尚未送达人工客服，请稍后重试或换一种联系方式。若长时间无法连接，请联系管理员。',
      )
    }
    if (!humanMode) {
      window.setTimeout(() => {
        const botText =
          '已收到您的问题。若需人工深度处理（如账号异常、合同与开票），请点击「转人工服务」。'
        const bid = pushMessage('bot', botText)
        relayEmit('bot', botText, bid)
      }, 500)
    }
  }

  const relayBase = getSupportRelayWsUrl()
  const relayBlocked = Boolean(relayBase && !relayReady)
  const statusExtra =
    !relayBase
      ? null
      : relayReady
        ? ' · 运营台直连已接通'
        : customSupportWsUrl
          ? ' · 正在连接自定义 ws…'
          : ' · 正在连接管理后台…'

  return (
    <>
      <div className="pointer-events-none fixed bottom-0 right-0 z-[60] flex flex-col items-end p-4 sm:p-6">
        {open ? (
          <div
            className="pointer-events-auto mb-3 flex max-h-[min(32rem,calc(100vh-8rem))] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby={panelId}
          >
            <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-white">
              <div className="flex min-w-0 items-center gap-2">
                <Headphones className="h-5 w-5 shrink-0 opacity-95" aria-hidden />
                <div className="min-w-0">
                  <h2 id={panelId} className="truncate text-sm font-semibold">
                    在线客服
                  </h2>
                  <p className="truncate text-[11px] text-blue-100/90">
                    {humanMode ? '人工客服已接入' : connecting ? '接入中…' : '智能助手 · 可转人工'}
                    {statusExtra}
                  </p>
                    {relayBlocked ? (
                    <p className="mt-0.5 line-clamp-2 text-[10px] text-amber-200">
                      会话通道暂时中断，系统将自动重试。请稍候片刻；若长时间未恢复，请联系管理员或服务提供方排查网络与客服通道配置。
                    </p>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-white/90 hover:bg-white/15"
                aria-label="收起客服窗口"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            </div>

            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-gray-50/80 p-3">
              {messages.map((m) => (
                <div key={m.id} className={cn('flex gap-2', m.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                  <div
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white',
                      m.role === 'user'
                        ? 'bg-gray-400'
                        : m.role === 'agent'
                          ? 'bg-emerald-600'
                          : m.role === 'ops'
                            ? 'bg-violet-600'
                            : m.role === 'system'
                              ? 'bg-slate-500'
                              : 'bg-blue-500',
                    )}
                    aria-hidden
                  >
                    {m.role === 'user' ? (
                      '我'
                    ) : m.role === 'agent' ? (
                      <User className="h-4 w-4" />
                    ) : m.role === 'ops' ? (
                      <span className="text-[10px] leading-none">客服</span>
                    ) : m.role === 'system' ? (
                      '!'
                    ) : (
                      'AI'
                    )}
                  </div>
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                      m.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-800 ring-1 ring-gray-100',
                    )}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                    <p
                      className={cn(
                        'mt-1 text-[10px]',
                        m.role === 'user' ? 'text-blue-100' : 'text-gray-400',
                      )}
                    >
                      {m.at}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {!humanMode && !connecting ? (
              <div className="border-t border-gray-100 bg-white px-3 py-2">
                <button
                  type="button"
                  onClick={requestHuman}
                  disabled={relayBlocked}
                  className="w-full rounded-lg border border-amber-200 bg-amber-50 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  转人工服务
                </button>
              </div>
            ) : null}

            <div className="flex gap-2 border-t border-gray-100 bg-white p-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
                placeholder={humanMode ? '向人工客服描述问题…' : '输入问题…'}
                className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={send}
                disabled={relayBlocked}
                className="inline-flex shrink-0 items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="发送"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
            open ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-blue-600 text-white hover:bg-blue-700',
          )}
          aria-label={open ? '关闭在线客服' : '打开在线客服'}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
        >
          <Headphones className="h-6 w-6" />
        </button>
      </div>
    </>
  )
}
