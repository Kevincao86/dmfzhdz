import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Image as ImageIcon, MoreHorizontal, Paperclip, Search, Send, Smile, UserPlus, X } from 'lucide-react'
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
import { buildChatImageMessage, CHAT_EMOJIS } from '../../lib/mpSync/chatMessageMedia'
import ChatMessageBody from './ChatMessageBody'

type Props = {
  sessionId: string
  peerName: string
  peerAvatar: string
  peerId?: string
  peerTalentId?: string
  sessionRow?: { talent_key?: string; pr_key?: string }
  groupMeta?: string
}

const SCROLL_STICK_THRESHOLD_PX = 96

function isNearBottom(el: HTMLElement, threshold = SCROLL_STICK_THRESHOLD_PX) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
}

export default function ChatPanel({
  sessionId,
  peerName,
  peerAvatar,
  peerId,
  peerTalentId,
  sessionRow,
  groupMeta,
}: Props) {
  const navigate = useNavigate()
  const [messages, setMessages] = useState<UiChatMessage[]>([])
  const [input, setInput] = useState('')
  const [ready, setReady] = useState(false)
  const [statusSub, setStatusSub] = useState('连接中…')
  const [sendErr, setSendErr] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [peerOpen, setPeerOpen] = useState(false)
  const [attachBusy, setAttachBusy] = useState(false)
  const sinceTsRef = useRef(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const me = useMemo(
    () => (sessionRow ? participantForSession(sessionRow) : getCurrentParticipant()),
    [sessionRow?.talent_key, sessionRow?.pr_key],
  )
  const myAvatar = String(me.avatarUrl || getAccount()?.wxAvatarUrl || '').trim() || ''

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = bodyRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  const applyMessages = useCallback((list: UiChatMessage[]) => {
    if (list.length) {
      sinceTsRef.current = Math.max(sinceTsRef.current, ...list.map((m) => m.ts || 0))
    }
    setMessages(list)
  }, [])

  useEffect(() => {
    stickToBottomRef.current = true
    sinceTsRef.current = 0
    setMessages([])
    setReady(false)
    setStatusSub('连接中…')
  }, [sessionId])

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const onScroll = () => {
      stickToBottomRef.current = isNearBottom(el)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [sessionId, ready])

  const bootstrap = useCallback(async () => {
    if (!sessionId) {
      setReady(false)
      setStatusSub('未配置会话')
      return
    }
    try {
      await syncProfile(me)
      const rows = await fetchMessages(sessionId, 0, me)
      const merged = mergeMessages([], rows, me.role)
      applyMessages(merged)
      await markRead(sessionId, me)
      setReady(true)
      setStatusSub('在线')
      stickToBottomRef.current = true
      requestAnimationFrame(() => scrollToBottom('auto'))
    } catch (e) {
      setReady(false)
      setStatusSub(formatChatError(e).slice(0, 48))
    }
  }, [sessionId, me, applyMessages, scrollToBottom])

  const syncCloud = useCallback(async () => {
    if (!sessionId || !ready) return
    try {
      const rows = await fetchMessages(sessionId, sinceTsRef.current, me)
      if (!rows.length) return
      let shouldScroll = false
      setMessages((prev) => {
        const prevIds = new Set(prev.map((m) => m.id))
        const merged = mergeMessages(prev, rows, me.role)
        shouldScroll = merged.some((m) => !prevIds.has(m.id))
        sinceTsRef.current = Math.max(sinceTsRef.current, ...merged.map((m) => m.ts || 0))
        return merged
      })
      await markRead(sessionId, me)
      if (shouldScroll && stickToBottomRef.current) {
        requestAnimationFrame(() => scrollToBottom('auto'))
      }
    } catch {
      /* 轮询静默 */
    }
  }, [sessionId, ready, me, scrollToBottom])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (cancelled) return
      await bootstrap()
    })()
    return () => {
      cancelled = true
    }
  }, [bootstrap])

  useEffect(() => {
    pollRef.current = setInterval(() => void syncCloud(), POLL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [syncCloud])

  const sendGate = canSendNextMessage(messages, me.role)
  const canSend = ready && sendGate.ok && input.trim().length > 0

  const visibleMessages = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    if (!q) return messages
    return messages.filter((m) => String(m.text || '').toLowerCase().includes(q))
  }, [messages, searchQ])

  const searchHitCount = searchQ.trim() ? visibleMessages.length : 0

  async function deliverText(text: string) {
    const body = text.trim()
    if (!body || !sessionId || !ready) return
    if (!sendGate.ok) {
      setSendErr(sendGate.hint)
      return
    }
    setSendErr('')
    const mid = newMsgId()
    const optimistic: UiChatMessage = {
      id: mid,
      fromRole: me.role,
      text: body,
      at: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      ts: Date.now(),
      mine: true,
    }
    setMessages((prev) => [...prev, optimistic])
    sinceTsRef.current = Math.max(sinceTsRef.current, optimistic.ts)
    stickToBottomRef.current = true
    requestAnimationFrame(() => scrollToBottom('smooth'))
    try {
      await sendMessage(sessionId, body, mid, me)
      void syncCloud()
    } catch (e) {
      setSendErr(formatChatError(e))
    }
  }

  async function onSend() {
    const text = input.trim()
    if (!text) return
    setInput('')
    await deliverText(text)
  }

  async function onPickImage(file: File | undefined | null) {
    if (!file || attachBusy) return
    setAttachBusy(true)
    setEmojiOpen(false)
    try {
      const payload = await buildChatImageMessage(file)
      await deliverText(payload)
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : '图片发送失败')
    } finally {
      setAttachBusy(false)
    }
  }

  async function onPickFile(file: File | undefined | null) {
    if (!file || attachBusy) return
    if (file.type.startsWith('image/')) {
      await onPickImage(file)
      return
    }
    const name = file.name || '附件'
    if (!window.confirm(`将发送文件说明「${name}」，对方需通过其他方式获取文件，是否继续？`)) return
    await deliverText(`[文件] ${name}`)
  }

  function insertEmoji(emoji: string) {
    const el = inputRef.current
    if (!el) {
      setInput((prev) => prev + emoji)
      return
    }
    const start = el.selectionStart ?? input.length
    const end = el.selectionEnd ?? input.length
    const next = input.slice(0, start) + emoji + input.slice(end)
    setInput(next)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + emoji.length
      el.setSelectionRange(pos, pos)
    })
  }

  function copyText(label: string, value: string) {
    const v = String(value || '').trim()
    if (!v) {
      window.alert(`暂无${label}`)
      return
    }
    void navigator.clipboard.writeText(v).then(
      () => window.alert(`已复制${label}`),
      () => window.alert(`复制失败，请手动复制：${v}`),
    )
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
          <button
            type="button"
            aria-label="搜索聊天记录"
            className={searchOpen ? 'is-on' : ''}
            onClick={() => {
              setSearchOpen((v) => !v)
              setMoreOpen(false)
              setPeerOpen(false)
            }}
          >
            <Search size={17} strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label={groupMeta ? '查看会话' : '查看对方资料'}
            className={peerOpen ? 'is-on' : ''}
            onClick={() => {
              setPeerOpen((v) => !v)
              setMoreOpen(false)
              setSearchOpen(false)
            }}
          >
            <UserPlus size={17} strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label="更多操作"
            className={moreOpen ? 'is-on' : ''}
            onClick={() => {
              setMoreOpen((v) => !v)
              setPeerOpen(false)
              setSearchOpen(false)
            }}
          >
            <MoreHorizontal size={17} strokeWidth={2} />
          </button>
        </div>
      </header>

      {searchOpen ? (
        <div className="chat-panel-v2__search-bar">
          <Search size={15} aria-hidden />
          <input
            type="search"
            placeholder="搜索聊天记录"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
          />
          {searchQ ? (
            <span className="chat-panel-v2__search-count">{searchHitCount} 条</span>
          ) : null}
          <button type="button" aria-label="关闭搜索" onClick={() => { setSearchOpen(false); setSearchQ('') }}>
            <X size={16} />
          </button>
        </div>
      ) : null}

      {peerOpen ? (
        <div className="chat-panel-v2__peer-sheet">
          <div className="chat-panel-v2__peer-sheet-main">
            {peerAvatar ? (
              <img src={peerAvatar} alt="" className="chat-panel-v2__peer-sheet-avatar" />
            ) : (
              <div className="chat-panel-v2__peer-sheet-avatar chat-panel-v2__peer-sheet-avatar--ph">
                {peerName.slice(0, 1)}
              </div>
            )}
            <div>
              <p className="chat-panel-v2__peer-sheet-name">{peerName}</p>
              <p className="chat-panel-v2__peer-sheet-sub">
                {groupMeta ? '群组会话' : peerId ? `ID ${peerId}` : '私信会话'}
              </p>
            </div>
          </div>
          <div className="chat-panel-v2__peer-sheet-actions">
            <button type="button" onClick={() => copyText('昵称', peerName)}>
              复制昵称
            </button>
            {peerId ? (
              <button type="button" onClick={() => copyText('对方 ID', peerId)}>
                复制 ID
              </button>
            ) : null}
            {!groupMeta && (peerTalentId || peerId) ? (
              <button type="button" onClick={() => navigate('/hall?tab=recommend')}>
                在推荐大厅查看
              </button>
            ) : null}
            {groupMeta ? (
              <p className="chat-panel-v2__peer-sheet-hint">群组暂不支持邀请新成员，请通过招募单沟通。</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {moreOpen ? (
        <div className="chat-panel-v2__menu">
          <button type="button" onClick={() => { setMoreOpen(false); void bootstrap() }}>
            刷新消息
          </button>
          <button type="button" onClick={() => copyText('会话 ID', sessionId)}>
            复制会话 ID
          </button>
          <button type="button" onClick={() => { setInput(''); setMoreOpen(false) }}>
            清空输入框
          </button>
          <button type="button" onClick={() => navigate('/messages')}>
            返回消息列表
          </button>
        </div>
      ) : null}

      <div className="chat-panel-v2__body" ref={bodyRef}>
        {messages.length === 0 ? (
          <p className="chat-panel-v2__empty">{CHAT_TURN_HINT}</p>
        ) : null}
        {searchQ.trim() && !visibleMessages.length ? (
          <p className="chat-panel-v2__empty">未找到包含「{searchQ.trim()}」的消息</p>
        ) : null}
        {visibleMessages.map((m) => {
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
                    <ChatMessageBody text={m.text} highlight={searchQ} />
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
      </div>

      <footer className="chat-panel-v2__footer">
        {!sendGate.ok && ready ? (
          <p className="chat-panel-v2__warn">{sendGate.hint}</p>
        ) : null}
        {sendErr ? <p className="chat-panel-v2__err">{sendErr}</p> : null}
        <textarea
          ref={inputRef}
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
            <button
              type="button"
              aria-label="表情"
              className={emojiOpen ? 'is-on' : ''}
              onClick={() => setEmojiOpen((v) => !v)}
            >
              <Smile size={18} strokeWidth={2} />
            </button>
            <button
              type="button"
              aria-label="附件"
              disabled={attachBusy || !ready || !sendGate.ok}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip size={18} strokeWidth={2} />
            </button>
            <button
              type="button"
              aria-label="发送图片"
              disabled={attachBusy || !ready || !sendGate.ok}
              onClick={() => imageRef.current?.click()}
            >
              <ImageIcon size={18} strokeWidth={2} />
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
        {emojiOpen ? (
          <div className="chat-panel-v2__emoji-panel" role="listbox" aria-label="选择表情">
            {CHAT_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="chat-panel-v2__emoji-btn"
                onClick={() => insertEmoji(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          className="chat-panel-v2__file-input"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar"
          onChange={(e) => {
            void onPickFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <input
          ref={imageRef}
          type="file"
          className="chat-panel-v2__file-input"
          accept="image/*"
          onChange={(e) => {
            void onPickImage(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </footer>
    </div>
  )
}
