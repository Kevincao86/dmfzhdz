import { Headphones, Minimize2, Send, User } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { cn } from '../cn'
import {
  formatSupportRelayTime,
  getOrCreateSupportRelayGuestFingerprint,
  getOrCreateSupportRelaySessionId,
  getSupportRelayWsUrl,
  type SupportRelayChatLine,
} from '../lib/supportRelay'
import {
  type ChatMessage,
  type ChatRole,
  mergeRelayChatMessages,
  relayFromToRole,
  rowToChatMessage,
} from '../lib/supportRelayChatMerge'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'

const DEFAULT_BOT: ChatMessage = {
  id: 'm0',
  role: 'bot',
  text: '您好，我是店魔方智能助手，可解答常见问题。如需人工协助，请点击下方「转人工服务」。',
  at: '',
  ts: 0,
}

function nowTime(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const SUPPORT_RELAY_POLL_MS = 4000

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
  const relaySyncRef = useRef<(() => void) | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const customerIdRef = useRef(customerId)
  const enterpriseNameRef = useRef(enterpriseName)
  const [open, setOpen] = useState(false)
  const [humanMode, setHumanMode] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [relayReady, setRelayReady] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { ...DEFAULT_BOT, at: nowTime(), ts: 0 },
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

  const emitRelayLine = useCallback(
    async (
      from: SupportRelayChatLine['from'],
      text: string,
      id: string,
    ): Promise<{ ok: boolean; detail?: string }> => {
      const wsUrl = getSupportRelayWsUrl()
      if (wsUrl) {
        const ws = wsRef.current
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          return { ok: false, detail: '客服 WebSocket 未连接。' }
        }
        const payload: SupportRelayChatLine = {
          type: 'chat',
          sessionId: sessionIdRef.current,
          from,
          text,
          ts: Date.now(),
          id,
        }
        ws.send(JSON.stringify(payload))
        return { ok: true }
      }
      if (supabaseConfigured && supabase) {
        const { data: auth } = await supabase.auth.getUser()
        const uid = auth.user?.id ?? null
        const row: Record<string, unknown> = {
          session_id: sessionIdRef.current,
          customer_id: customerIdRef.current.trim() || null,
          enterprise_name: enterpriseNameRef.current.trim() || null,
          from_role: from,
          text,
          ts: Date.now(),
          client_msg_id: id,
        }
        if (uid) {
          row.author_user_id = uid
        } else {
          row.author_user_id = null
          row.guest_fingerprint = getOrCreateSupportRelayGuestFingerprint()
        }
        const { error } = await supabase.from('support_relay_messages').insert(row as never)
        if (error) {
          console.warn('[support_relay_messages]', error.message, error.code ?? '')
          const hint =
            error.code === '42P01' || /relation|does not exist/i.test(error.message)
              ? '数据库缺少表：请在 Supabase SQL Editor 执行迁移文件 supabase/migrations/20260511120000_support_relay_messages.sql（或运行合并脚本 cloud_apply_all.sql 中的对应段落）。'
              : error.code === '42501' || /row-level security|RLS/i.test(error.message)
                ? '无写入权限（RLS）：请确认已执行客服相关迁移（含登录页访客策略），且当前网络可访问 Supabase。'
                : /guest_fingerprint|support_relay_guest_fetch_session|PGRST202/i.test(error.message)
                  ? '请执行迁移 supabase/migrations/20260514100000_support_relay_guest_login_page.sql 以启用登录页在线客服同步。'
                  : ''
          return {
            ok: false,
            detail: [error.message, error.code ? `code=${error.code}` : '', hint].filter(Boolean).join(' '),
          }
        }
        return { ok: true }
      }
      return { ok: true }
    },
    [],
  )

  useEffect(() => {
    const base = getSupportRelayWsUrl()
    if (!base) return

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
              ts: line.ts,
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

  /** 生产环境：无 WS 时经 Supabase 表同步（须已执行迁移 support_relay_messages） */
  useEffect(() => {
    if (getSupportRelayWsUrl()) return
    if (!supabaseConfigured || !supabase) {
      setRelayReady(true)
      return
    }

    const client = supabase
    const sid = sessionIdRef.current
    let cancelled = false
    let ch: ReturnType<typeof client.channel> | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null

    type RelayRow = { from_role: string; text: string; ts: number; client_msg_id: string }

    const fetchSessionRows = async (): Promise<RelayRow[] | null> => {
      const { data: auth } = await client.auth.getUser()
      const uid = auth.user?.id ?? null

      if (!uid) {
        const fp = getOrCreateSupportRelayGuestFingerprint()
        const { data, error } = await client.rpc('support_relay_guest_fetch_session', {
          p_session_id: sid,
          p_guest_fingerprint: fp,
        })
        if (error) {
          console.warn('[support_relay_guest_fetch_session]', error.message, error.code ?? '')
          return null
        }
        const raw = Array.isArray(data) ? data : []
        return raw.map((r): RelayRow => {
          const row = r as Record<string, unknown>
          return {
            from_role: String(row.from_role ?? ''),
            text: String(row.text ?? ''),
            ts: Number(row.ts ?? 0),
            client_msg_id: String(row.client_msg_id ?? ''),
          }
        })
      }

      const { data: rows, error } = await client
        .from('support_relay_messages')
        .select('from_role,text,ts,client_msg_id')
        .eq('session_id', sid)
        .order('ts', { ascending: true })
        .limit(200)
      if (error) {
        console.warn('[support_relay_messages] select', error.message, error.code ?? '')
        return null
      }
      return (rows ?? []) as RelayRow[]
    }

    const runPollMerge = () => {
      if (cancelled) return
      void (async () => {
        const next = await fetchSessionRows()
        if (cancelled || !next) return
        setMessages((prev) => mergeRelayChatMessages(prev, next))
      })()
    }

    relaySyncRef.current = runPollMerge

    let authSub: { unsubscribe: () => void } | null = null

    const bindRealtimeJwt = async () => {
      const {
        data: { session },
      } = await client.auth.getSession()
      await client.realtime.setAuth(session?.access_token ?? '')
    }

    void (async () => {
      try {
        await client.auth.getSession()
        await bindRealtimeJwt()

        const rows = await fetchSessionRows()
        if (cancelled) return

        if (rows && rows.length > 0) {
          setMessages(rows.map((r) => rowToChatMessage(r)))
        }

        pollTimer = window.setInterval(runPollMerge, SUPPORT_RELAY_POLL_MS)
        runPollMerge()

        const { data } = client.auth.onAuthStateChange(async (_event, session) => {
          await client.realtime.setAuth(session?.access_token ?? '')
          runPollMerge()
        })
        authSub = data.subscription

        ch = client
          .channel(`meoo-support:${sid}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'support_relay_messages',
            },
            (payload) => {
              const row = payload.new as RelayRow & { session_id?: string }
              if (row.session_id !== sid || !row.client_msg_id) return
              setMessages((prev) => {
                if (prev.some((m) => m.id === row.client_msg_id)) return prev
                return [...prev, rowToChatMessage(row)].sort((a, b) =>
                  a.ts !== b.ts ? a.ts - b.ts : a.id.localeCompare(b.id),
                )
              })
            },
          )
          .subscribe((status) => {
            if (
              status === 'SUBSCRIBED' ||
              status === 'CHANNEL_ERROR' ||
              status === 'TIMED_OUT'
            ) {
              setRelayReady(true)
            }
          })
      } catch {
        if (!cancelled) {
          pollTimer = window.setInterval(runPollMerge, SUPPORT_RELAY_POLL_MS)
          runPollMerge()
          const { data } = client.auth.onAuthStateChange(async (_event, session) => {
            await client.realtime.setAuth(session?.access_token ?? '')
            runPollMerge()
          })
          authSub = data.subscription
          setRelayReady(true)
        }
      }
    })()

    return () => {
      cancelled = true
      relaySyncRef.current = null
      authSub?.unsubscribe()
      if (pollTimer) window.clearInterval(pollTimer)
      void ch?.unsubscribe()
    }
  }, [])

  /** 打开面板或回到前台时立即对齐云端（不依赖 Realtime） */
  useEffect(() => {
    if (!open) return
    if (getSupportRelayWsUrl()) return
    if (!supabaseConfigured || !supabase) return
    queueMicrotask(() => relaySyncRef.current?.())
  }, [open])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') queueMicrotask(() => relaySyncRef.current?.())
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  /** 登录信息变更后补发 identify（WebSocket）；云端模式写入随每条消息携带 customerId */
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
    const ts = Date.now()
    setMessages((prev) => [...prev, { id: mid, role, text, at: nowTime(), ts }])
    return mid
  }, [])

  const requestHuman = () => {
    if (humanMode || connecting) return
    setConnecting(true)
    const sysText =
      '已为您接入店魔方人工客服，请在下方直接描述问题，客服同事将在此会话中回复'
    const bid = pushMessage('system', sysText)
    void emitRelayLine('system', sysText, bid).then((r) => {
      setConnecting(false)
      const wsUrl = getSupportRelayWsUrl()
      const cloud = !wsUrl && supabaseConfigured && supabase
      if (!wsUrl && !cloud) {
        setHumanMode(true)
        return
      }
      if (r.ok) {
        setHumanMode(true)
      } else {
        pushMessage(
          'system',
          wsUrl
            ? `暂无法连接到人工客服会话：${r.detail ?? 'WebSocket 不可用'}。请稍后重试或通过其他渠道联系客户经理。`
            : `消息未能写入云端会话表。${r.detail ?? ''} 详见控制台 [support_relay_messages]。`,
        )
      }
    })
  }

  const send = () => {
    const wsUrl = getSupportRelayWsUrl()
    const cloud = !wsUrl && supabaseConfigured && supabase
    if ((wsUrl || cloud) && !relayReady) return
    const t = input.trim()
    if (!t) return
    setInput('')
    const uid = pushMessage('user', t)
    void emitRelayLine('user', t, uid).then((r) => {
      if (!r.ok && (wsUrl || cloud)) {
        pushMessage(
          'system',
          `消息尚未送达客服通道。${r.detail ?? ''}`.trim(),
        )
      }
      if (!humanMode) {
        window.setTimeout(() => {
          const botText =
            '已收到您的问题。若需人工深度处理（如账号异常、合同与开票），请点击「转人工服务」。'
          const bid = pushMessage('bot', botText)
          void emitRelayLine('bot', botText, bid)
        }, 500)
      }
    })
  }

  const relayBase = getSupportRelayWsUrl()
  const relayBlocked = Boolean((relayBase && !relayReady) || (!relayBase && supabaseConfigured && supabase && !relayReady))

  const statusExtra = relayBase
    ? relayReady
      ? ' · 运营台直连已接通'
      : customSupportWsUrl
        ? ' · 正在连接自定义 ws…'
        : ' · 正在连接管理后台…'
    : supabaseConfigured && supabase
      ? relayReady
        ? ' · 云端会话已同步'
        : ' · 正在连接云端会话…'
      : null

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
