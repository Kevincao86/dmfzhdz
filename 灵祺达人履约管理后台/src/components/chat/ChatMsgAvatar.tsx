import { useState } from 'react'

type Props = {
  url?: string
  initial: string
  className?: string
}

export default function ChatMsgAvatar({ url, initial, className = 'chat-panel-v2__msg-avatar' }: Props) {
  const src = String(url || '').trim()
  const [broken, setBroken] = useState(false)
  const letter = String(initial || '我').trim().slice(0, 1) || '我'

  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        className={className}
        onError={() => setBroken(true)}
      />
    )
  }

  return <div className={`${className} chat-panel-v2__msg-avatar--ph`}>{letter}</div>
}
