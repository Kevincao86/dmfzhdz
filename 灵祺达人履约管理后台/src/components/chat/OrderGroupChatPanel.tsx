import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AtSign,
  Image as ImageIcon,
  MoreHorizontal,
  Paperclip,
  Search,
  Send,
  Smile,
  UserPlus,
  X,
} from 'lucide-react'
import { getAccount } from '../../lib/mpSession'
import { buildChatImageMessage, CHAT_EMOJIS } from '../../lib/mpSync/chatMessageMedia'
import {
  canOrderGroupChat,
  fileToGroupMediaUrl,
  formatTime,
  getGroup,
  GROUP_POLL_MS,
  mapAllMembers,
  mapMentionMembers,
  mapMessages,
  myParticipantKey,
  resolveMentionKeys,
  sendGroupMessage,
  type GroupMember,
  type OrderGroupMessage,
  type OrderGroupPayload,
} from '../../lib/mpSync/orderGroupChat'
import { formatChatError } from '../../lib/mpSync/talentChat'

const SCROLL_STICK_THRESHOLD_PX = 96

function isNearBottom(el: HTMLElement, threshold = SCROLL_STICK_THRESHOLD_PX) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
}

function GroupMessageBody({ msg }: { msg: OrderGroupMessage }) {
  if (msg.type === 'image' && msg.mediaUrl) {
    return (
      <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="chat-panel-v2__img-link">
        <img src={msg.mediaUrl} alt="图片" className="chat-panel-v2__bubble-img" />
      </a>
    )
  }
  if (msg.type === 'video' && msg.mediaUrl) {
    return <video src={msg.mediaUrl} controls className="chat-panel-v2__bubble-img max-w-[240px]" />
  }
  if (msg.type === 'audio' && msg.mediaUrl) {
    return <audio src={msg.mediaUrl} controls className="max-w-[220px]" />
  }
  if (msg.type === 'location') {
    return <span>📍 {msg.locationName || `${msg.latitude}, ${msg.longitude}`}</span>
  }
  if (msg.type === 'file' && msg.mediaUrl) {
    return (
      <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">
        📎 {msg.fileName || '文件'}
      </a>
    )
  }
  const text = msg.text || msg.previewLabel
  const parts = String(text).split(/(@[^\s@]+)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('@') ? (
          <span key={i} className="chat-panel-v2__mention">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  )
}

type Props = {
  mpOrderId: string
  orderDetailHref?: string
}

export default function OrderGroupChatPanel({ mpOrderId, orderDetailHref }: Props) {
  const [title, setTitle] = useState('商单群')
  const [memberCount, setMemberCount] = useState(0)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [mentionMembers, setMentionMembers] = useState<{ key: string; name: string }[]>([])
  const [messages, setMessages] = useState<OrderGroupMessage[]>([])
  const [input, setInput] = useState('')
  const [ready, setReady] = useState(false)
  const [canSend, setCanSend] = useState(true)
  const [statusSub, setStatusSub] = useState('连接中…')
  const [sendErr, setSendErr] = useState('')
  const [sending, setSending] = useState(false)
  const [attachBusy, setAttachBusy] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [pendingMentionKeys, setPendingMentionKeys] = useState<string[]>([])
  const sinceTsRef = useRef(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const myKey = useMemo(() => myParticipantKey(), [])
  const myAvatar = String(getAccount()?.wxAvatarUrl || '').trim()

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = bodyRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  const applyGroup = useCallback(
    (body: Record<string, unknown>) => {
      const group = body.group as OrderGroupPayload | undefined
      if (!group) return
      const ui = mapMessages(group, myKey)
      if (ui.length) {
        sinceTsRef.current = Math.max(sinceTsRef.current, ...ui.map((m) => m.ts || 0))
      }
      const closed = group.status === 'closed' || body.canSend === false
      setTitle(String(group.title || '商单群'))
      const count = (group.memberParticipantKeys || []).length
      setMemberCount(count)
      setMembers(mapAllMembers(group, myKey))
      setMentionMembers(mapMentionMembers(group, myKey))
      setMessages(ui)
      setCanSend(!closed)
      setStatusSub(closed ? '已关闭' : `${count} 人 · 商单协作群`)
    },
    [myKey],
  )

  const syncGroup = useCallback(
    async (forceScroll?: boolean) => {
      if (!mpOrderId || !canOrderGroupChat()) return
      try {
        const body = await getGroup(mpOrderId)
        applyGroup(body)
        setSendErr('')
        if (forceScroll && stickToBottomRef.current) {
          requestAnimationFrame(() => scrollToBottom('auto'))
        }
      } catch (e) {
        if (!ready) throw e
      }
    },
    [mpOrderId, applyGroup, ready, scrollToBottom],
  )

  useEffect(() => {
    let cancelled = false
    sinceTsRef.current = 0
    setMessages([])
    setReady(false)
    setStatusSub('连接中…')
    ;(async () => {
      if (!mpOrderId) {
        setSendErr('缺少商单号')
        return
      }
      if (!canOrderGroupChat()) {
        setSendErr('未配置消息 API')
        return
      }
      try {
        await syncGroup(true)
        if (!cancelled) setReady(true)
      } catch (e) {
        if (!cancelled) {
          setReady(false)
          setSendErr(formatChatError(e))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mpOrderId, syncGroup])

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const onScroll = () => {
      stickToBottomRef.current = isNearBottom(el)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [mpOrderId, ready])

  useEffect(() => {
    if (!ready || !mpOrderId) return
    pollRef.current = setInterval(() => void syncGroup(), GROUP_POLL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [ready, mpOrderId, syncGroup])

  const visibleMessages = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    if (!q) return messages
    return messages.filter((m) => {
      const blob = [m.text, m.fromName, m.previewLabel, m.locationName, m.fileName].join(' ').toLowerCase()
      return blob.includes(q)
    })
  }, [messages, searchQ])

  const searchHitCount = searchQ.trim() ? visibleMessages.length : 0
  const canSendNow = ready && canSend && input.trim().length > 0 && !sending

  async function deliverText(text: string, mentionKeys?: string[]) {
    const body = text.trim()
    if (!body || !mpOrderId || !ready || !canSend) return
    setSendErr('')
    setSending(true)
    try {
      const keys = mentionKeys || resolveMentionKeys(body, mentionMembers, pendingMentionKeys)
      await sendGroupMessage(mpOrderId, { type: 'text', text: body, mentionKeys: keys })
      setPendingMentionKeys([])
      await syncGroup(true)
    } catch (e) {
      setSendErr(formatChatError(e))
    } finally {
      setSending(false)
    }
  }

  async function onSend() {
    const text = input.trim()
    if (!text) return
    setInput('')
    await deliverText(text)
  }

  async function onPickImage(file: File | undefined | null) {
    if (!file || attachBusy || !canSend) return
    setAttachBusy(true)
    setEmojiOpen(false)
    setMentionOpen(false)
    try {
      const mediaUrl = await fileToGroupMediaUrl(file)
      setSending(true)
      await sendGroupMessage(mpOrderId, { type: 'image', mediaUrl })
      await syncGroup(true)
    } catch (e) {
      setSendErr(formatChatError(e))
    } finally {
      setAttachBusy(false)
      setSending(false)
    }
  }

  async function onPickFile(file: File | undefined | null) {
    if (!file || attachBusy) return
    if (file.type.startsWith('image/')) {
      await onPickImage(file)
      return
    }
    const name = file.name || '附件'
    if (!window.confirm(`将发送文件说明「${name}」，是否继续？`)) return
    await deliverText(`[文件] ${name}`)
  }

  function insertAtCursor(text: string) {
    const el = inputRef.current
    if (!el) {
      setInput((prev) => `${prev}${text}`)
      return
    }
    const start = el.selectionStart ?? input.length
    const end = el.selectionEnd ?? input.length
    const next = input.slice(0, start) + text + input.slice(end)
    setInput(next)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + text.length
      el.setSelectionRange(pos, pos)
    })
  }

  function insertEmoji(emoji: string) {
    insertAtCursor(emoji)
  }

  function pickMention(member: { key: string; name: string } | 'all') {
    if (member === 'all') {
      insertAtCursor('@全体成员 ')
      setPendingMentionKeys(mentionMembers.map((m) => m.key))
    } else {
      insertAtCursor(`@${member.name} `)
      setPendingMentionKeys((prev) => (prev.includes(member.key) ? prev : [...prev, member.key]))
    }
    setMentionOpen(false)
    inputRef.current?.focus()
  }

  let lastDate = ''

  return (
    <div className="chat-panel-v2">
      <header className="chat-panel-v2__head">
        <div className="chat-panel-v2__peer">
          <div className="chat-panel-v2__avatar chat-panel-v2__avatar--ph">群</div>
          <div className="chat-panel-v2__peer-meta">
            <p className="chat-panel-v2__peer-name">{title}</p>
            <p className="chat-panel-v2__peer-sub">{statusSub || `${memberCount} 人`}</p>
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
              setMembersOpen(false)
            }}
          >
            <Search size={17} strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label="查看群成员"
            className={membersOpen ? 'is-on' : ''}
            onClick={() => {
              setMembersOpen((v) => !v)
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
              setMembersOpen(false)
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
          {searchQ ? <span className="chat-panel-v2__search-count">{searchHitCount} 条</span> : null}
          <button type="button" aria-label="关闭搜索" onClick={() => { setSearchOpen(false); setSearchQ('') }}>
            <X size={16} />
          </button>
        </div>
      ) : null}

      {membersOpen ? (
        <div className="chat-panel-v2__peer-sheet">
          <div className="chat-panel-v2__peer-sheet-main">
            <div>
              <p className="chat-panel-v2__peer-sheet-name">群成员 · {memberCount} 人</p>
              <p className="chat-panel-v2__peer-sheet-sub">点击 @ 可提醒指定成员或全体成员</p>
            </div>
          </div>
          <ul className="chat-panel-v2__member-list">
            {members.map((m) => (
              <li key={m.key}>
                <div className="chat-panel-v2__member-row">
                  <div className="chat-panel-v2__msg-avatar chat-panel-v2__msg-avatar--ph">{m.name.slice(0, 1)}</div>
                  <div>
                    <p className="chat-panel-v2__member-name">
                      {m.name}
                      {m.mine ? <span className="chat-panel-v2__member-tag">我</span> : null}
                    </p>
                  </div>
                  {!m.mine && canSend ? (
                    <button type="button" className="chat-panel-v2__mention-btn" onClick={() => pickMention({ key: m.key, name: m.name })}>
                      @
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {canSend && mentionMembers.length ? (
            <div className="chat-panel-v2__peer-sheet-actions">
              <button type="button" onClick={() => pickMention('all')}>
                @全体成员
              </button>
              {orderDetailHref ? (
                <Link to={orderDetailHref} className="chat-panel-v2__order-link">
                  查看商单详情
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {moreOpen ? (
        <div className="chat-panel-v2__menu">
          <button type="button" onClick={() => { setMoreOpen(false); void syncGroup(true) }}>
            刷新消息
          </button>
          {orderDetailHref ? (
            <Link to={orderDetailHref} onClick={() => setMoreOpen(false)}>
              查看商单详情
            </Link>
          ) : null}
          <button type="button" onClick={() => { setInput(''); setMoreOpen(false) }}>
            清空输入框
          </button>
        </div>
      ) : null}

      <div className="chat-panel-v2__body" ref={bodyRef}>
        {!ready && !sendErr ? <p className="chat-panel-v2__empty">加载中…</p> : null}
        {ready && messages.length === 0 ? (
          <p className="chat-panel-v2__empty">暂无消息，发送第一条吧</p>
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
            dateSep = (
              <div className="chat-panel-v2__date">
                今天 {d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </div>
            )
          }
          return (
            <div key={m.id}>
              {dateSep}
              <div className={`chat-panel-v2__row ${m.mine ? 'chat-panel-v2__row--mine' : ''}`}>
                {!m.mine ? (
                  <div className="chat-panel-v2__msg-avatar chat-panel-v2__msg-avatar--ph">{m.fromName.slice(0, 1)}</div>
                ) : null}
                <div className="chat-panel-v2__bubble-wrap">
                  {!m.mine ? <span className="chat-panel-v2__sender">{m.fromName}</span> : null}
                  <div className={`chat-panel-v2__bubble ${m.mine ? 'chat-panel-v2__bubble--mine' : ''}`}>
                    <GroupMessageBody msg={m} />
                  </div>
                  {m.mine ? (
                    <span className="chat-panel-v2__read">已读</span>
                  ) : (
                    <span className="chat-panel-v2__time">{m.at || formatTime(m.ts)}</span>
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
        {!canSend && ready ? <p className="chat-panel-v2__warn">商单群已关闭，无法发送新消息</p> : null}
        {sendErr ? <p className="chat-panel-v2__err">{sendErr}</p> : null}
        <textarea
          ref={inputRef}
          className="chat-panel-v2__input"
          placeholder={canSend ? '输入消息，Enter 发送，Ctrl + Enter 换行' : '群已关闭'}
          value={input}
          disabled={!ready || !canSend || sending}
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
              disabled={!canSend}
              onClick={() => {
                setEmojiOpen((v) => !v)
                setMentionOpen(false)
              }}
            >
              <Smile size={18} strokeWidth={2} />
            </button>
            <button
              type="button"
              aria-label="@ 提醒成员"
              className={mentionOpen ? 'is-on' : ''}
              disabled={!canSend || !mentionMembers.length}
              onClick={() => {
                setMentionOpen((v) => !v)
                setEmojiOpen(false)
              }}
            >
              <AtSign size={18} strokeWidth={2} />
            </button>
            <button
              type="button"
              aria-label="附件"
              disabled={attachBusy || !ready || !canSend}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip size={18} strokeWidth={2} />
            </button>
            <button
              type="button"
              aria-label="发送图片"
              disabled={attachBusy || !ready || !canSend}
              onClick={() => imageRef.current?.click()}
            >
              <ImageIcon size={18} strokeWidth={2} />
            </button>
          </div>
          <button type="button" className="chat-panel-v2__send" disabled={!canSendNow} onClick={() => void onSend()}>
            <Send size={16} strokeWidth={2.5} aria-hidden />
            发送
          </button>
        </div>
        {mentionOpen ? (
          <div className="chat-panel-v2__mention-panel" role="listbox" aria-label="选择 @ 对象">
            <button type="button" className="chat-panel-v2__mention-item" onClick={() => pickMention('all')}>
              @全体成员
            </button>
            {mentionMembers.map((m) => (
              <button key={m.key} type="button" className="chat-panel-v2__mention-item" onClick={() => pickMention(m)}>
                @{m.name}
              </button>
            ))}
          </div>
        ) : null}
        {emojiOpen ? (
          <div className="chat-panel-v2__emoji-panel" role="listbox" aria-label="选择表情">
            {CHAT_EMOJIS.map((emoji) => (
              <button key={emoji} type="button" className="chat-panel-v2__emoji-btn" onClick={() => insertEmoji(emoji)}>
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
