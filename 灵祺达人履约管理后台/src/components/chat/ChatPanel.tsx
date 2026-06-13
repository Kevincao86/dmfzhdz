import { useCallback, useEffect, useRef, useState } from 'react'
import { MoreHorizontal, Paperclip, Search, Send, Smile, UserPlus } from 'lucide-react'
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
import { getAccount } from '../../lib/mpSession'
import { getCurrentParticipant } from '../../lib/mpSync/participant'

type Props = {
  sessionId: string
  peerName: string
  peerAvatar: string
  peerId?: string
  sessionRow?: { talent_key?: string; pr_key?: string }
  groupMeta?: string
}

export default function ChatPanel({
  sessionId,
  peerName,
  peerAvatar,
  peerId,
  sessionRow,
  groupMeta,
}: Props) {
  const [messages, setMessages] = useState<UiChatMessage[]>([])
  const [input, setInput] = useState('')
  const [ready, setReady] = useState(false)
  const [statusSub, setStatusSub] = useState('连接中…')
  const [sendErr, setSendErr] = useState('')
  const sinceTsRef = useRef(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const me = sessionRow ? participantForSession(sessionRow) : getCurrentParticipant()
  const myAvatar = String(me.avatarUrl || getAccount()?.wxAvatarUrl || '').trim() || ''

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
        setStatusSub('在线')
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

  let lastDate = ''

  return (
    <div className="chat-panel-v2">
      <header className="chat-panel-v2__head">
        <div className="chat-panel-v2__peer">
          {peerAvatar ? (
            <img src={peerAvatar} alt="" className="chat-panel-v2__avatar" />
          ) : (
            <div className="chat-panel-v2__avatar chat-panel-v2__avatar--ph">{peerName.slice(0, 1)}</div>
          )}
          <div className="chat-panel-v2__peer-meta">
            <p className="chat-panel-v2__peer-name">{peerName}</p>
            <p className="chat-panel-v2__peer-sub">
              {groupMeta ? `${groupMeta} · 成员在线` : peerId || statusSub}
            </p>
          </div>
        </div>
        <div className="chat-panel-v2__head-actions">
          <button type="button" aria-label="搜索">
            <Search size={17} strokeWidth={2} />
          </button>
          <button type="button" aria-label="添加成员">
            <UserPlus size={17} strokeWidth={2} />
          </button>
          <button type="button" aria-label="更多">
            <MoreHorizontal size={17} strokeWidth={2} />
          </button>
        </div>
      </header>

      <div className="chat-panel-v2__body">
        {messages.length === 0 ? (
          <p className="chat-panel-v2__empty">{CHAT_TURN_HINT}</p>
        ) : null}
        {messages.map((m) => {
          const d = new Date(m.ts || Date.now())
          const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
          let dateSep = null
          if (dateKey !== lastDate) {
            lastDate = dateKey
            const label = `今天 ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
            dateSep = <div className="chat-panel-v2__date">{label}</div>
          }
          return (
            <div key={m.id}>
              {dateSep}
              <div className={`chat-panel-v2__row ${m.mine ? 'chat-panel-v2__row--mine' : ''}`}>
                {!m.mine ? (
                  peerAvatar ? (
                    <img src={peerAvatar} alt="" className="chat-panel-v2__msg-avatar" />
                  ) : (
                    <div className="chat-panel-v2__msg-avatar chat-panel-v2__msg-avatar--ph" />
                  )
                ) : null}
                <div className="chat-panel-v2__bubble-wrap">
                  {!m.mine ? <span className="chat-panel-v2__sender">{peerName}</span> : null}
                  <div className={`chat-panel-v2__bubble ${m.mine ? 'chat-panel-v2__bubble--mine' : ''}`}>
                    {m.text}
                  </div>
                  {m.mine ? (
                    <span className="chat-panel-v2__read">已读</span>
                  ) : (
                    <span className="chat-panel-v2__time">{m.at}</span>
                  )}
                </div>
                {m.mine ? (
                  myAvatar ? (
                    <img src={myAvatar} alt="" className="chat-panel-v2__msg-avatar" />
                  ) : (
                    <div className="chat-panel-v2__msg-avatar chat-panel-v2__msg-avatar--ph" />
                  )
                ) : null}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <footer className="chat-panel-v2__footer">
        {!sendGate.ok && ready ? (
          <p className="chat-panel-v2__warn">{sendGate.hint}</p>
        ) : null}
        {sendErr ? <p className="chat-panel-v2__err">{sendErr}</p> : null}
        <textarea
          className="chat-panel-v2__input"
          placeholder="输入消息，Enter 发送，Ctrl + Enter 换行"
          value={input}
          disabled={!ready || !sendGate.ok}
          rows={3}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
              e.preventDefault()
              void onSend()
            }
          }}
        />
        <div className="chat-panel-v2__toolbar">
          <div className="chat-panel-v2__tools">
            <button type="button" aria-label="表情">
              <Smile size={18} strokeWidth={2} />
            </button>
            <button type="button" aria-label="图片">
              <Paperclip size={18} strokeWidth={2} />
            </button>
          </div>
          <button
            type="button"
            className="chat-panel-v2__send"
            disabled={!canSend}
            onClick={() => void onSend()}
          >
            <Send size={16} strokeWidth={2.5} aria-hidden />
            发送
          </button>
        </div>
      </footer>
    </div>
  )
}
