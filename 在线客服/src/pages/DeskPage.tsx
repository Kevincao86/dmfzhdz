import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, Send, Wifi, WifiOff } from 'lucide-react'
import { cn } from '../lib/cn'
import {
  isMpSession,
  pollSupport,
  readToken,
  sendOpsReply,
  writeToken,
  type ChatLine,
  type SupportChannel,
} from '../lib/api'

type SessionRow = { lastText: string; lastTs: number; unread: number }
type Profile = { customerId?: string; enterpriseName?: string }

function needsOpsReply(lines: ChatLine[] | undefined): boolean {
  if (!lines || lines.length === 0) return false
  return lines[lines.length - 1]!.from !== 'ops'
}

function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 10)}…` : id
}

function senderLabel(from: ChatLine['from']): string {
  if (from === 'user') return '客户'
  if (from === 'ops' || from === 'agent') return '客服'
  if (from === 'bot') return '助手'
  return from
}

export default function DeskPage() {
  const token = readToken()
  const [channel, setChannel] = useState<SupportChannel>('erp')
  const [sessions, setSessions] = useState<Record<string, SessionRow>>({})
  const [msgs, setMsgs] = useState<Record<string, ChatLine[]>>({})
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const [reply, setReply] = useState('')
  const [listFilter, setListFilter] = useState<'all' | 'unreplied'>('all')
  const [ready, setReady] = useState(false)
  const [pollError, setPollError] = useState<string | null>(null)
  const [sendBusy, setSendBusy] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const maxTsRef = useRef(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  const applyLine = useCallback((line: ChatLine) => {
    const sid = line.sessionId
    const active = selectedIdRef.current === sid || selectedIdRef.current === null
    if (line.customerId || line.enterpriseName) {
      setProfiles((prev) => ({
        ...prev,
        [sid]: {
          customerId: line.customerId?.trim() || prev[sid]?.customerId,
          enterpriseName: line.enterpriseName?.trim() || prev[sid]?.enterpriseName,
        },
      }))
    }
    setSessions((prev) => {
      const cur = prev[sid]
      return {
        ...prev,
        [sid]: {
          lastText: line.text,
          lastTs: line.ts,
          unread: active ? 0 : (cur?.unread ?? 0) + 1,
        },
      }
    })
    setMsgs((prev) => {
      const list = prev[sid] ?? []
      if (list.some((x) => x.id === line.id)) return prev
      return { ...prev, [sid]: [...list, line] }
    })
    setSelectedId((prev) => prev ?? sid)
  }, [])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    const tick = async () => {
      if (cancelled) return
      const r = await pollSupport(token, maxTsRef.current)
      if (r.ok === false) {
        setPollError(r.error)
        return
      }
      setPollError(null)
      setReady(true)
      const since = maxTsRef.current
      for (const line of r.messages) {
        if (!line.sessionId || !line.id) continue
        applyLine(line)
        maxTsRef.current = Math.max(maxTsRef.current, line.ts)
      }
      if (since === 0 && maxTsRef.current === 0) maxTsRef.current = Date.now()
    }
    void tick()
    const id = window.setInterval(() => void tick(), 2000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [token, applyLine])

  useEffect(() => {
    requestAnimationFrame(() => {
      const el = listRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [selectedId, msgs])

  const sessionIds = useMemo(
    () =>
      Object.keys(sessions)
        .filter((id) => (channel === 'mp' ? isMpSession(id) : !isMpSession(id)))
        .sort((a, b) => sessions[b]!.lastTs - sessions[a]!.lastTs),
    [sessions, channel],
  )

  const filteredIds = useMemo(() => {
    if (listFilter !== 'unreplied') return sessionIds
    return sessionIds.filter((id) => needsOpsReply(msgs[id]))
  }, [sessionIds, listFilter, msgs])

  const unreplied = useMemo(
    () => sessionIds.filter((id) => needsOpsReply(msgs[id])).length,
    [sessionIds, msgs],
  )

  const activeMsgs = selectedId ? (msgs[selectedId] ?? []) : []
  const activeProfile = selectedId ? profiles[selectedId] : undefined

  const onSend = async () => {
    if (!token || !selectedId) return
    const text = reply.trim()
    if (!text) return
    setSendBusy(true)
    setSendError(null)
    const id = `web_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    const r = await sendOpsReply(token, { sessionId: selectedId, text, id })
    setSendBusy(false)
    if (r.ok === false) {
      setSendError(r.error)
      return
    }
    setReply('')
    applyLine({
      type: 'chat',
      sessionId: selectedId,
      from: 'ops',
      text,
      ts: Date.now(),
      id,
    })
  }

  const logout = () => {
    writeToken(null)
    window.location.href = '/login'
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-black/20 px-4 py-3">
        <MessageCircle className="h-5 w-5 text-[var(--accent)]" />
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold">灵祺在线客服</h1>
          <p className="text-xs text-[var(--muted)]">Web 台与飞书双通道 · 同一 support_relay</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {ready && !pollError ? (
            <span className="inline-flex items-center gap-1 text-[var(--good)]">
              <Wifi className="h-3.5 w-3.5" /> 已连接
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[var(--warn)]">
              <WifiOff className="h-3.5 w-3.5" /> {pollError || '连接中…'}
            </span>
          )}
          <button type="button" onClick={logout} className="rounded-lg border border-[var(--line)] px-2 py-1 text-[var(--muted)]">
            退出
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-72 shrink-0 flex-col border-r border-[var(--line)] bg-[var(--panel)]/80">
          <div className="flex gap-1 border-b border-[var(--line)] p-2">
            {(['erp', 'mp'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                className={cn(
                  'flex-1 rounded-lg py-1.5 text-xs font-medium',
                  channel === c ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:bg-white/5',
                )}
              >
                {c === 'erp' ? '商家 ERP' : '小程序'}
              </button>
            ))}
          </div>
          <div className="flex gap-1 border-b border-[var(--line)] p-2">
            <button
              type="button"
              onClick={() => setListFilter('all')}
              className={cn('flex-1 rounded-lg py-1 text-xs', listFilter === 'all' ? 'bg-white/10' : 'text-[var(--muted)]')}
            >
              全部
            </button>
            <button
              type="button"
              onClick={() => setListFilter('unreplied')}
              className={cn(
                'flex-1 rounded-lg py-1 text-xs',
                listFilter === 'unreplied' ? 'bg-white/10' : 'text-[var(--muted)]',
              )}
            >
              待回复 {unreplied > 0 ? `(${unreplied})` : ''}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredIds.length === 0 ? (
              <p className="p-4 text-xs text-[var(--muted)]">暂无会话</p>
            ) : (
              filteredIds.map((id) => {
                const row = sessions[id]!
                const prof = profiles[id]
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setSelectedId(id)
                      setSessions((prev) => ({
                        ...prev,
                        [id]: { ...prev[id]!, unread: 0 },
                      }))
                    }}
                    className={cn(
                      'w-full border-b border-[var(--line)]/60 px-3 py-2.5 text-left hover:bg-white/5',
                      selectedId === id && 'bg-[var(--accent)]/15',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {prof?.enterpriseName?.trim() || shortId(id)}
                      </span>
                      {row.unread > 0 ? (
                        <span className="rounded-full bg-[var(--accent)] px-1.5 text-[10px] text-white">{row.unread}</span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{row.lastText || '—'}</p>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {!selectedId ? (
            <div className="flex flex-1 items-center justify-center text-sm text-[var(--muted)]">选择左侧会话开始回复</div>
          ) : (
            <>
              <div className="border-b border-[var(--line)] px-4 py-2">
                <p className="text-sm font-medium">{activeProfile?.enterpriseName || shortId(selectedId)}</p>
                <p className="text-xs text-[var(--muted)]">
                  会话 {selectedId}
                  {activeProfile?.customerId ? ` · 客户 ${activeProfile.customerId}` : ''}
                </p>
              </div>
              <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {activeMsgs.map((m) => (
                  <div
                    key={m.id}
                    className={cn('max-w-[85%] rounded-2xl px-3 py-2 text-sm', m.from === 'ops' || m.from === 'agent' ? 'ml-auto bg-[var(--accent)]/25' : 'bg-white/5')}
                  >
                    <p className="mb-1 text-[10px] text-[var(--muted)]">
                      {senderLabel(m.from)} · {new Date(m.ts).toLocaleString('zh-CN', { hour12: false })}
                    </p>
                    <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-[var(--line)] p-3">
                {sendError ? <p className="mb-2 text-xs text-red-300">{sendError}</p> : null}
                <div className="flex gap-2">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={2}
                    placeholder="输入回复…（飞书坐席也可直接回复卡片）"
                    className="min-h-[64px] flex-1 resize-none rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void onSend()
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={sendBusy || !reply.trim()}
                    onClick={() => void onSend()}
                    className="inline-flex items-center gap-1 self-end rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    发送
                  </button>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
