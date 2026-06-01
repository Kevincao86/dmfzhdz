import { Brain } from 'lucide-react'
import { cn } from '../cn'

/** 流式生成中的思考过程（有正文时仍保留，与回答气泡并列展示） */
export function AiAgentThinkingLive({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  if (!text.trim()) return null
  return (
    <div className={cn('flex justify-start', className)}>
      <div className="max-w-[min(100%,42rem)] overflow-hidden rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50/95 via-indigo-50/80 to-violet-100/90 px-3.5 py-2.5 text-[12px] leading-relaxed text-violet-950/90 shadow-sm ring-1 ring-violet-100/60">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-violet-800">
          <Brain className="h-3.5 w-3.5 shrink-0 animate-pulse opacity-80" aria-hidden />
          <span>思考中</span>
          <span className="inline-flex gap-0.5" aria-hidden>
            <span className="h-1 w-1 animate-bounce rounded-full bg-violet-500 [animation-delay:0ms]" />
            <span className="h-1 w-1 animate-bounce rounded-full bg-violet-500 [animation-delay:120ms]" />
            <span className="h-1 w-1 animate-bounce rounded-full bg-violet-500 [animation-delay:240ms]" />
          </span>
        </div>
        <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-violet-900/85">{text}</p>
      </div>
    </div>
  )
}
