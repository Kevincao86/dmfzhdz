import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import ChatPanel from '../components/chat/ChatPanel'

export default function ChatPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const sessionId = params.get('sessionId') || ''
  const peerName = useMemo(() => decodeURIComponent(params.get('peerName') || '会话'), [params])
  const peerAvatar = useMemo(() => decodeURIComponent(params.get('peerAvatar') || ''), [params])
  const peerId = useMemo(() => decodeURIComponent(params.get('peerId') || ''), [params])
  const peerTalentId = useMemo(() => decodeURIComponent(params.get('peerTalentId') || ''), [params])

  return (
    <div className="page-content-shell page-content-shell--wide flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center gap-2 mb-2 text-sm text-[var(--shell-muted)]">
        <button type="button" className="hover:text-violet-600" onClick={() => navigate(-1)}>
          ← 返回
        </button>
        <span>·</span>
        <Link to="/messages" className="hover:text-violet-600">
          消息列表
        </Link>
      </div>
      <div className="flex-1 min-h-0 rounded-xl border border-[#d6d6d6] overflow-hidden shadow-sm">
        {sessionId ? (
          <ChatPanel
            sessionId={sessionId}
            peerName={peerName}
            peerAvatar={peerAvatar}
            peerId={peerId || undefined}
            peerTalentId={peerTalentId || undefined}
          />
        ) : (
          <p className="p-8 text-center text-[var(--shell-muted)]">缺少会话 ID</p>
        )}
      </div>
    </div>
  )
}
