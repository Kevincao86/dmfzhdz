import { CheckCircle2, ClipboardList } from 'lucide-react'
import { cn } from '../cn'
import type { AiAgentMessage } from '../lib/aiAgentTypes'

export function AiAgentMessageBubble({ m }: { m: AiAgentMessage }) {
  if (m.role === 'task_preview' && m.preview) {
    return (
      <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/90 to-indigo-50/80 p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2 text-violet-900">
          <ClipboardList className="h-4 w-4 shrink-0" />
          <span className="text-sm font-semibold">执行预览 · 需确认</span>
        </div>
        <p className="text-sm text-slate-700">{m.content}</p>
        <p className="mt-2 text-xs font-medium text-violet-900">{m.preview.title}</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
          {m.preview.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-slate-500">
          类型：<span className="font-mono">{m.preview.taskType}</span>
        </p>
      </div>
    )
  }

  if (m.role === 'task_result') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[95%] rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-950">
          <div className="mb-1 flex items-center gap-1.5 font-medium text-emerald-900">
            <CheckCircle2 className="h-4 w-4" />
            任务结果
          </div>
          <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
        </div>
      </div>
    )
  }

  const isUser = m.role === 'user'
  const isSystem = m.role === 'system'
  const imgs = m.imageUrls?.filter(Boolean) ?? []

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[92%] rounded-2xl px-4 py-2.5 text-sm shadow-sm',
          isUser
            ? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white'
            : isSystem
              ? 'border border-slate-200 bg-slate-100 text-slate-700'
              : 'border border-slate-100 bg-white text-slate-800',
        )}
      >
        {imgs.length > 0 ? (
          <div className={cn('mb-2 flex flex-wrap gap-2', isUser ? '' : '')}>
            {imgs.map((src, i) => (
              <img
                key={i}
                src={src}
                alt=""
                className="max-h-40 max-w-[min(100%,12rem)] rounded-lg border border-white/20 object-contain"
              />
            ))}
          </div>
        ) : null}
        {m.content ? <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p> : null}
      </div>
    </div>
  )
}
