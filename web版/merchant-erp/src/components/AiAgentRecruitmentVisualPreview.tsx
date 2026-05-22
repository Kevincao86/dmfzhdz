import { Loader2, Sparkles } from 'lucide-react'
import type { AiRecruitmentBriefPreview } from '../lib/aiAgentTypes'

export function AiAgentRecruitmentVisualPreview({ brief }: { brief: AiRecruitmentBriefPreview }) {
  if (brief.enrichStatus === 'loading') {
    return (
      <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-violet-100 bg-white py-12">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
        <p className="mt-3 text-sm text-slate-600">正在生成达人探店图文 Brief…</p>
        <p className="mt-1 text-xs text-slate-400">完成后将展示可复制的图文版预览</p>
      </div>
    )
  }

  const variants: [string, string, string] = brief.previews ?? [
    brief.briefText,
    brief.briefText,
    brief.briefText,
  ]

  return (
    <div className="mt-4 space-y-3">
      <p className="text-center text-xs font-medium text-violet-900">达人招募 · 图文 Brief 预览</p>
      <BriefCard brief={brief} text={variants[0]} variantLabel="A" />
      <div className="grid gap-3 sm:grid-cols-2">
        <BriefCard brief={brief} text={variants[1]} variantLabel="B" compact />
        <BriefCard brief={brief} text={variants[2]} variantLabel="C" compact />
      </div>
      {brief.enrichError ? <p className="text-center text-xs text-amber-700">{brief.enrichError}</p> : null}
      <p className="text-center text-[11px] text-slate-500">
        确认后将按您的预算与人数需求 AI 分配达人档位，并在本窗口展示招募订单明细（同时推送运营台待接单）。
      </p>
    </div>
  )
}

function BriefCard({
  brief,
  text,
  variantLabel,
  compact,
}: {
  brief: AiRecruitmentBriefPreview
  text: string
  variantLabel: string
  compact?: boolean
}) {
  return (
    <div
      className={
        compact
          ? 'overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm'
          : 'mx-auto max-w-sm overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md ring-1 ring-violet-100/60'
      }
    >
      <div className="bg-gradient-to-br from-violet-600 via-fuchsia-600 to-orange-500 px-3 py-2.5 text-white">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-white/90">
              <Sparkles className="h-3 w-3" />
              {brief.platform}
            </div>
            <p className="mt-0.5 truncate text-sm font-semibold">{brief.mainProductName}</p>
          </div>
          <span className="shrink-0 rounded-md bg-white/20 px-2 py-0.5 text-[10px] font-semibold">
            版本 {variantLabel}
          </span>
        </div>
      </div>
      <div className={compact ? 'space-y-2 p-3' : 'space-y-3 p-4'}>
        <BriefTags tags={brief.tags} compact={compact} />
        <p
          className={
            compact
              ? 'line-clamp-6 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-700'
              : 'whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800'
          }
        >
          {text.trim() || '（暂无内容）'}
        </p>
      </div>
    </div>
  )
}

function BriefTags({ tags, compact }: { tags: string[]; compact?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.slice(0, compact ? 4 : 8).map((tag) => (
        <span
          key={tag}
          className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-800 ring-1 ring-violet-100"
        >
          #{tag}
        </span>
      ))}
    </div>
  )
}
