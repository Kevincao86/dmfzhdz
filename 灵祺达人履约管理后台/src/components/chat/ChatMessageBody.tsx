import { chatImageDataUrl, isChatImageMessage } from '../../lib/mpSync/chatMessageMedia'

type Props = {
  text: string
  highlight?: string
}

function highlightText(text: string, q: string) {
  const query = q.trim()
  if (!query) return text
  const lower = text.toLowerCase()
  const needle = query.toLowerCase()
  const idx = lower.indexOf(needle)
  if (idx < 0) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="chat-panel-v2__hl">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export default function ChatMessageBody({ text, highlight = '' }: Props) {
  if (isChatImageMessage(text)) {
    const src = chatImageDataUrl(text)
    if (src) {
      return (
        <a href={src} target="_blank" rel="noreferrer" className="chat-panel-v2__img-link">
          <img src={src} alt="聊天图片" className="chat-panel-v2__bubble-img" />
        </a>
      )
    }
  }
  return <>{highlightText(text, highlight)}</>
}
