import { CheckCircle2, ClipboardList } from 'lucide-react'
import { useAiAgent } from '../context/AiAgentContext'
import { cn } from '../cn'
import type { AiAgentMessage } from '../lib/aiAgentTypes'
import { formatAssistantDisplayText } from '../lib/aiAgentActionParse'
import { listProductPlansFromPreview } from '../lib/aiAgentProductPlans'
import { AiAgentProductVisualPreview } from './AiAgentProductVisualPreview'
import { AiAgentRecruitmentVisualPreview } from './AiAgentRecruitmentVisualPreview'
import { AiAgentRecruitmentOrderDetailCard } from './AiAgentRecruitmentOrderDetail'
import { AiAgentTaxPreview } from './AiAgentTaxPreview'

function formatBubbleTime(ts: number): string {
  try {
    return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(ts))
  } catch {
    return ''
  }
}

export function AiAgentMessageBubble({ m }: { m: AiAgentMessage }) {
  const { quoteMessage } = useAiAgent()
  if (m.role === 'task_preview' && m.preview) {
    return (
      <div className="w-full rounded-2xl border border-violet-200/90 bg-gradient-to-br from-violet-50/95 to-indigo-50/90 p-4 shadow-sm ring-1 ring-violet-100/60">
        <div className="mb-2 flex items-center gap-2 text-violet-900">
          <ClipboardList className="h-4 w-4 shrink-0" />
          <span className="text-sm font-semibold tracking-tight">执行预览 · 需确认</span>
        </div>
        <p className="text-sm leading-relaxed text-slate-700">{m.content}</p>
        {m.preview.taskType === 'create_product' ? (() => {
          const productPlans = listProductPlansFromPreview(m.preview)
          if (!productPlans.length && !m.preview.recruitmentBrief) return null
          const multi = productPlans.length > 1
          return (
            <>
              {productPlans.length > 0 ? (
                <div className={multi ? 'mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3' : 'mt-4'}>
                  {productPlans.map((plan) => (
                    <div
                      key={plan.slotKey ?? plan.slotLabel ?? plan.productName}
                      className={multi ? 'rounded-xl border border-violet-100/90 bg-white/80 p-2 shadow-sm' : ''}
                    >
                      <AiAgentProductVisualPreview plan={plan} slotLabel={plan.slotLabel} />
                    </div>
                  ))}
                </div>
              ) : null}
              {m.preview.recruitmentBrief ? (
                <div className={productPlans.length > 0 ? 'mt-4 border-t border-violet-100/80 pt-4' : 'mt-4'}>
                  <p className="mb-2 text-xs font-semibold text-violet-900">达人招募方案</p>
                  <AiAgentRecruitmentVisualPreview brief={m.preview.recruitmentBrief} />
                </div>
              ) : null}
            </>
          )
        })() : m.preview.taskType === 'recruit_influencer' && m.preview.recruitmentBrief ? (
          <AiAgentRecruitmentVisualPreview brief={m.preview.recruitmentBrief} />
        ) : m.preview.taskType === 'file_tax' && m.preview.taxFiling ? (
          <AiAgentTaxPreview tax={m.preview.taxFiling} />
        ) : (
          <>
            <p className="mt-3 text-xs font-semibold text-violet-900">{m.preview.title}</p>
            <ol className="mt-2 space-y-1.5 border-l-2 border-violet-200/80 pl-3 text-sm leading-relaxed text-slate-700">
              {m.preview.steps.map((s, i) => (
                <li key={i} className="pl-1">
                  {s}
                </li>
              ))}
            </ol>
          </>
        )}
        {m.preview.taskType !== 'create_product' &&
        m.preview.taskType !== 'recruit_influencer' &&
        m.preview.taskType !== 'file_tax' ? (
          <p className="mt-3 text-[11px] text-slate-500">
            类型：<span className="font-mono text-slate-600">{m.preview.taskType}</span>
          </p>
        ) : null}
      </div>
    )
  }

  if (m.role === 'task_result') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[min(100%,42rem)] rounded-2xl border border-emerald-200/90 bg-emerald-50/95 px-4 py-3 text-sm text-emerald-950 shadow-sm ring-1 ring-emerald-100/70">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-emerald-900">
            <CheckCircle2 className="h-4 w-4" />
            任务结果
          </div>
          <p className="whitespace-pre-wrap leading-relaxed">{formatAssistantDisplayText(m.content)}</p>
          {m.recruitmentOrder ? (
            <AiAgentRecruitmentOrderDetailCard order={m.recruitmentOrder} />
          ) : null}
        </div>
      </div>
    )
  }

  const isUser = m.role === 'user'
  const isSystem = m.role === 'system'
  const imgs = m.imageUrls?.filter(Boolean) ?? []
  const videos = m.videoUrls?.filter(Boolean) ?? []
  const timeStr = formatBubbleTime(m.createdAt)

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[min(100%,26rem)]">
          <div className="rounded-2xl rounded-br-md bg-slate-700 px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-50 shadow-md ring-1 ring-slate-900/10">
            {videos.length > 0 || imgs.length > 0 ? (
              <div className="mb-2 flex flex-wrap justify-end gap-2">
                {videos.map((src, i) => (
                  <video
                    key={`v-${i}`}
                    src={src}
                    controls
                    playsInline
                    className="max-h-40 max-w-[min(100%,14rem)] rounded-lg border border-white/15 bg-black object-contain"
                  />
                ))}
                {imgs.map((src, i) => (
                  <img
                    key={`i-${i}`}
                    src={src}
                    alt=""
                    className="max-h-36 max-w-[min(100%,11rem)] rounded-lg border border-white/15 object-contain"
                  />
                ))}
              </div>
            ) : null}
            {m.content ? <p className="whitespace-pre-wrap">{m.content}</p> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => quoteMessage(m)}
              className="text-[10px] font-medium text-indigo-200/95 underline-offset-2 hover:text-white hover:underline"
            >
              引用此条
            </button>
            {timeStr ? <p className="text-[10px] text-slate-400">{timeStr}</p> : null}
          </div>
        </div>
      </div>
    )
  }

  const isErrorish =
    m.role === 'assistant' && /暂时连不上助手|失败|错误|error|500|502/i.test(m.content)

  return (
    <div className="flex justify-start">
      <div className="w-full">
        <div
          className={cn(
            'rounded-2xl rounded-bl-md px-4 py-3 text-[13px] leading-relaxed shadow-sm',
            isSystem
              ? 'border border-amber-200/90 bg-amber-50/90 text-amber-950 ring-1 ring-amber-100/70'
              : isErrorish
                ? 'border border-amber-200/80 bg-amber-50/70 text-amber-950 ring-1 ring-amber-100/50'
                : 'border border-slate-200/80 bg-slate-50/95 text-slate-800 ring-1 ring-slate-200/40',
          )}
        >
          {imgs.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {imgs.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  className={
                    m.role === 'assistant' && imgs.length === 1
                      ? 'max-h-[min(70vh,28rem)] w-full max-w-full rounded-lg border border-slate-200/80 object-contain shadow-sm'
                      : 'max-h-40 max-w-[min(100%,14rem)] rounded-lg border border-slate-200/80 object-contain'
                  }
                />
              ))}
            </div>
          ) : null}
          {m.content ? (
            <p className="whitespace-pre-wrap">
              {formatAssistantDisplayText(m.content)}
            </p>
          ) : null}
        </div>
        {m.role === 'assistant' ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => quoteMessage(m)}
              className="text-[10px] font-medium text-indigo-600 hover:underline"
            >
              引用此条
            </button>
            {timeStr ? <p className="text-[10px] text-slate-400">{timeStr}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
