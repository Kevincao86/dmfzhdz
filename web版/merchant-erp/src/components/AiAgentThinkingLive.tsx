import { Brain } from 'lucide-react'
import { cn } from '../cn'

/** 流式生成中的思考过程（有正文后由父级隐藏） */
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
      <div className="max-w-[min(100%,42rem)] rounded-2xl border border-violet-200/80 bg-violet-50/90 px-3.5 py-2.5 text-[12px] leading-relaxed text-violet-950/90 shadow-sm ring-1 ring-violet-100/60">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-violet-800">
          <Brain className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
          <span>思考中</span>
        </div>
        <p className="whitespace-pre-wrap text-violet-900/85">{text}</p>
      </div>
    </div>
  )
}
