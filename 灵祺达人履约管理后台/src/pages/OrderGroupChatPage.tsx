import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Image as ImageIcon, Send } from 'lucide-react'
import {
  canOrderGroupChat,
  fileToGroupMediaUrl,
  formatTime,
  getGroup,
  GROUP_POLL_MS,
  mapMessages,
  myParticipantKey,
  sendGroupMessage,
  type OrderGroupMessage,
} from '../lib/mpSync/orderGroupChat'
import { formatChatError } from '../lib/mpSync/talentChat'

function GroupMessageBody({ msg }: { msg: OrderGroupMessage }) {
  if (msg.type === 'image' && msg.mediaUrl) {
    return (
      <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="chat-panel-v2__img-link">
        <img src={msg.mediaUrl} alt="图片" className="chat-panel-v2__bubble-img" />
      </a>
    )
  }
  if (msg.type === 'video' && msg.mediaUrl) {
    return (
      <video src={msg.mediaUrl} controls className="chat-panel-v2__bubble-img max-w-[240px]" />
    )
  }
  if (msg.type === 'audio' && msg.mediaUrl) {
    return <audio src={msg.mediaUrl} controls className="max-w-[220px]" />
  }
  if (msg.type === 'location') {
    return (
      <span>
        📍 {msg.locationName || `${msg.latitude}, ${msg.longitude}`}
      </span>
    )
  }
  if (msg.type === 'file' && msg.mediaUrl) {
    return (
      <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">
        📎 {msg.fileName || '文件'}
      </a>
    )
  }
  return <>{msg.text || msg.previewLabel}</>
}

export default function OrderGroupChatPage() {
  const { id: mpOrderId = '' } = useParams()
  const navigate = useNavigate()
  const [title, setTitle] = useState('商单群')
  const [memberCount, setMemberCount] = useState(0)
  const [messages, setMessages] = useState<OrderGroupMessage[]>([])
  const [input, setInput] = useState('')
  const [ready, setReady] = useState(false)
  const [canSend, setCanSend] = useState(true)
  const [statusSub, setStatusSub] = useState('连接中…')
  const [err, setErr] = useState('')
  const [sending, setSending] = useState(false)
  const [attachBusy, setAttachBusy] = useState(false)
  const sinceTsRef = useRef(0)
  const bodyRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = useCallback(() => {
    const el = bodyRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [])

  const applyGroup = useCallback(
    (body: Record<string, unknown>) => {
      const group = body.group as Record<string, unknown> | undefined
      if (!group) return
      const myKey = myParticipantKey()
      const ui = mapMessages(group as Parameters<typeof mapMessages>[0], myKey)
      if (ui.length) {
        sinceTsRef.current = Math.max(sinceTsRef.current, ...ui.map((m) => m.ts || 0))
      }
      const closed = group.status === 'closed' || body.canSend === false
      setTitle(String(group.title || '商单群'))
      setMemberCount((group.memberParticipantKeys as string[] | undefined)?.length || 0)
      setMessages(ui)
      setCanSend(!closed)
      setStatusSub(closed ? '已关闭' : `${(group.memberParticipantKeys as string[] | undefined)?.length || 0} 人`)
    },
    [],
  )

  const syncGroup = useCallback(async () => {
    if (!mpOrderId || !canOrderGroupChat()) return
    try {
      const body = await getGroup(mpOrderId)
      applyGroup(body)
      setErr('')
    } catch (e) {
      if (!ready) throw e
    }
  }, [mpOrderId, applyGroup, ready])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!mpOrderId) {
        setErr('缺少商单号')
        return
      }
      if (!canOrderGroupChat()) {
        setErr('未配置消息 API')
        return
      }
      try {
        await syncGroup()
        if (!cancelled) {
          setReady(true)
          requestAnimationFrame(scrollToBottom)
        }
      } catch (e) {
        if (!cancelled) {
          setReady(false)
          setErr(formatChatError(e))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mpOrderId, syncGroup, scrollToBottom])

  useEffect(() => {
    if (!ready || !mpOrderId) return
    const timer = setInterval(() => void syncGroup(), GROUP_POLL_MS)
    return () => clearInterval(timer)
  }, [ready, mpOrderId, syncGroup])

  useEffect(() => {
    requestAnimationFrame(scrollToBottom)
  }, [messages.length, scrollToBottom])

  async function onSendText() {
    const text = input.trim()
    if (!text || !canSend || sending || !mpOrderId) return
    setSending(true)
    try {
      await sendGroupMessage(mpOrderId, { type: 'text', text })
      setInput('')
      await syncGroup()
    } catch (e) {
      setErr(formatChatError(e))
    } finally {
      setSending(false)
    }
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !canSend || attachBusy || !mpOrderId) return
    setAttachBusy(true)
    try {
      const mediaUrl = await fileToGroupMediaUrl(file)
      await sendGroupMessage(mpOrderId, { type: 'image', mediaUrl })
      await syncGroup()
    } catch (err) {
      setErr(formatChatError(err))
    } finally {
      setAttachBusy(false)
    }
  }

  return (
    <div className="page-content-shell page-content-shell--wide">
      <header className="flex items-center gap-3 mb-4">
        <button
          type="button"
          className="messages-page__tool-btn"
          aria-label="返回"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate">{title}</h1>
          <p className="text-xs text-[var(--shell-muted)]">{statusSub || `${memberCount} 人`}</p>
        </div>
        <Link to={`/recruitment/${encodeURIComponent(mpOrderId)}`} className="text-sm text-blue-600 hover:underline">
          商单详情
        </Link>
      </header>

      {err ? <p className="text-sm text-red-600 mb-3">{err}</p> : null}

      <div className="chat-panel-v2 flex flex-col h-[calc(100vh-220px)] min-h-[420px] rounded-xl border bg-white">
        <div ref={bodyRef} className="chat-panel-v2__body flex-1 overflow-y-auto p-4 space-y-3">
          {!ready && !err ? <p className="text-sm text-[var(--shell-muted)]">加载中…</p> : null}
          {ready && !messages.length ? (
            <p className="text-sm text-[var(--shell-muted)] text-center py-8">暂无消息，发送第一条吧</p>
          ) : null}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-2 ${m.mine ? 'flex-row-reverse' : ''}`}
            >
              <div className={`max-w-[75%] ${m.mine ? 'items-end' : 'items-start'} flex flex-col`}>
                {!m.mine ? (
                  <span className="text-[11px] text-[var(--shell-muted)] mb-0.5">{m.fromName}</span>
                ) : null}
                <div
                  className={`rounded-2xl px-3 py-2 text-sm ${
                    m.mine ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-900'
                  }`}
                >
                  <GroupMessageBody msg={m} />
                </div>
                <span className="text-[10px] text-[var(--shell-muted)] mt-0.5">{m.at || formatTime(m.ts)}</span>
              </div>
            </div>
          ))}
        </div>

        <footer className="border-t p-3 flex items-end gap-2">
          <button
            type="button"
            className="messages-page__tool-btn shrink-0"
            disabled={!canSend || attachBusy}
            aria-label="发送图片"
            onClick={() => fileRef.current?.click()}
          >
            <ImageIcon size={20} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onPickImage(e)} />
          <textarea
            className="flex-1 min-h-[40px] max-h-[120px] rounded-lg border px-3 py-2 text-sm resize-none"
            placeholder={canSend ? '输入消息…' : '群已关闭'}
            value={input}
            disabled={!canSend || sending}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void onSendText()
              }
            }}
          />
          <button
            type="button"
            className="messages-page__tool-btn shrink-0 text-blue-600"
            disabled={!canSend || sending || !input.trim()}
            aria-label="发送"
            onClick={() => void onSendText()}
          >
            <Send size={20} />
          </button>
        </footer>
      </div>
    </div>
  )
}
