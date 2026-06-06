import { useCallback, useEffect, useRef, useState } from 'react'
import {
  canSendNextMessage,
  CHAT_TURN_HINT,
  fetchMessages,
  formatChatError,
  markRead,
  mergeMessages,
  newMsgId,
  participantForSession,
  POLL_MS,
  sendMessage,
  syncProfile,
  type UiChatMessage,
} from '../../lib/mpSync/talentChat'
import { getCurrentParticipant } from '../../lib/mpSync/participant'

type Props = {
  sessionId: string
  peerName: string
  peerAvatar: string
  peerId?: string
  sessionRow?: { talent_key?: string; pr_key?: string }
}

export default function ChatPanel({ sessionId, peerName, peerAvatar, peerId, sessionRow }: Props) {
  const [messages, setMessages] = useState<UiChatMessage[]>([])
  const [input, setInput] = useState('')
  const [ready, setReady] = useState(false)
  const [statusSub, setStatusSub] = useState('连接中…')
  const [sendErr, setSendErr] = useState('')
  const sinceTsRef = useRef(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const me = sessionRow ? participantForSession(sessionRow) : getCurrentParticipant()

  const scrollBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const applyMessages = useCallback(
    (list: UiChatMessage[]) => {
      if (list.length) {
        sinceTsRef.current = Math.max(sinceTsRef.current, ...list.map((m) => m.ts || 0))
      }
      setMessages(list)
      requestAnimationFrame(scrollBottom)
    },
    [scrollBottom],
  )

  const syncCloud = useCallback(async () => {
    if (!sessionId || !ready) return
    try {
      const rows = await fetchMessages(sessionId, sinceTsRef.current, me)
      if (!rows.length) return
      setMessages((prev) => {
        const merged = mergeMessages(prev, rows, me.role)
        sinceTsRef.current = Math.max(sinceTsRef.current, ...merged.map((m) => m.ts || 0))
        return merged
      })
      await markRead(sessionId, me)
      requestAnimationFrame(scrollBottom)
    } catch {
      /* 轮询静默 */
    }
  }, [sessionId, ready, me, scrollBottom])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!sessionId) {
        setReady(false)
        setStatusSub('未配置会话')
        return
      }
      try {
        await syncProfile(me)
        const rows = await fetchMessages(sessionId, 0, me)
        if (cancelled) return
        const merged = mergeMessages([], rows, me.role)
        applyMessages(merged)
        await markRead(sessionId, me)
        setReady(true)
        setStatusSub('消息已同步')
      } catch (e) {
        if (!cancelled) {
          setReady(false)
          setStatusSub(formatChatError(e).slice(0, 48))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId, me, applyMessages])

  useEffect(() => {
    pollRef.current = setInterval(() => void syncCloud(), POLL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [syncCloud])

  const sendGate = canSendNextMessage(messages, me.role)
  const canSend = ready && sendGate.ok && input.trim().length > 0

  async function onSend() {
    const text = input.trim()
    if (!text || !sessionId || !ready) return
    if (!sendGate.ok) {
      setSendErr(sendGate.hint)
      return
    }
    setSendErr('')
    const mid = newMsgId()
    const optimistic: UiChatMessage = {
      id: mid,
      fromRole: me.role,
      text,
      at: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      ts: Date.now(),
      mine: true,
    }
    setMessages((prev) => [...prev, optimistic])
    setInput('')
    sinceTsRef.current = Math.max(sinceTsRef.current, optimistic.ts)
    requestAnimationFrame(scrollBottom)
    try {
      await sendMessage(sessionId, text, mid, me)
      void syncCloud()
    } catch (e) {
      setSendErr(formatChatError(e))
    }
  }

  return (
    <div className="chat-panel flex flex-col h-full min-h-0 bg-[#ededed]">
      <header className="chat-panel-header flex items-center gap-3 px-4 py-3 bg-[#f5f5f5] border-b border-[#d6d6d6] shrink-0">
        {peerAvatar ? (
          <img src={peerAvatar} alt="" className="w-9 h-9 rounded-md object-cover" />
        ) : (
          <div className="w-9 h-9 rounded-md bg-violet-500/20 flex items-center justify-center text-sm font-medium">
            {peerName.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0">
          <p className="font-medium text-[#191919] truncate">{peerName}</p>
          {peerId ? <p className="text-[10px] text-[#9ca3af] truncate">{peerId}</p> : null}
          <p className="text-xs text-[#888] truncate">{statusSub}</p>
        </div>
      </header>

      <div className="chat-panel-body flex-1 overflow-y-auto px-4 py-3 min-h-0">
        {messages.length === 0 ? (
          <p className="text-center text-xs text-[#888] mt-8">{CHAT_TURN_HINT}</p>
        ) : null}
        {messages.map((m) => (
          <div key={m.id} className={`chat-bubble-row flex gap-2 mb-3 ${m.mine ? 'flex-row-reverse' : ''}`}>
            {!m.mine ? (
              peerAvatar ? (
                <img src={peerAvatar} alt="" className="w-8 h-8 rounded-md object-cover shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-md bg-slate-300 shrink-0" />
              )
            ) : null}
            <div className={`max-w-[70%] ${m.mine ? 'items-end' : 'items-start'} flex flex-col`}>
              <div
                className={`chat-bubble px-3 py-2 rounded-md text-sm leading-relaxed ${
                  m.mine ? 'bg-[#95ec69] text-[#191919]' : 'bg-white text-[#191919]'
                }`}
              >
                {m.text}
              </div>
              <span className="text-[10px] text-[#b2b2b2] mt-0.5 px-1">{m.at}</span>
            </div>
            {m.mine ? (
              me.avatarUrl ? (
                <img src={me.avatarUrl} alt="" className="w-8 h-8 rounded-md object-cover shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-md bg-violet-400/30 shrink-0" />
              )
            ) : null}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <footer className="chat-panel-footer shrink-0 border-t border-[#d6d6d6] bg-[#f5f5f5]">
        {!sendGate.ok && ready ? (
          <p className="text-xs text-amber-700 bg-amber-50 px-4 py-2 border-b border-amber-100">{sendGate.hint}</p>
        ) : ready && messages.length === 0 ? (
          <p className="text-xs text-[#888] px-4 py-2 border-b border-[#e8e8e8]">{CHAT_TURN_HINT}</p>
        ) : null}
        {sendErr ? <p className="text-xs text-red-600 px-4 py-1">{sendErr}</p> : null}
        <div className="flex items-center gap-2 px-3 py-2">
          <input
            className="flex-1 rounded-md border border-[#d6d6d6] bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 disabled:bg-[#f0f0f0] disabled:text-[#999]"
            placeholder={ready ? (sendGate.ok ? '输入消息…' : sendGate.hint) : '连接中…'}
            value={input}
            disabled={!ready || !sendGate.ok}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void onSend()
              }
            }}
          />
          <button
            type="button"
            className="px-4 py-2 rounded-md bg-[#07c160] text-white text-sm font-medium disabled:opacity-40 hover:bg-[#06ad56] transition-colors"
            disabled={!canSend}
            onClick={() => void onSend()}
          >
            发送
          </button>
        </div>
      </footer>
    </div>
  )
}
