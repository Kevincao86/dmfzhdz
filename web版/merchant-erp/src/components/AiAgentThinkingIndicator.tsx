import { Loader2 } from 'lucide-react'

/** AI 正在生成回复时的占位提示（参考 ChatGPT「正在思考」） */
export function AiAgentThinkingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-2 px-1 py-1 text-xs text-slate-400">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
        <span>思考中，请稍后</span>
      </div>
    </div>
  )
}
