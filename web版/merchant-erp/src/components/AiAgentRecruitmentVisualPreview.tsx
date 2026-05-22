import { ChevronRight, Copy, Loader2, Sparkles } from 'lucide-react'
import { useCallback, useState } from 'react'
import type { AiRecruitmentBriefPreview } from '../lib/aiAgentTypes'
import { cn } from '../cn'
import { AiAgentOverlayModal } from './AiAgentOverlayModal'

type BriefDetailSelection = {
  variantLabel: string
  text: string
}

export function AiAgentRecruitmentVisualPreview({ brief }: { brief: AiRecruitmentBriefPreview }) {
  const [detail, setDetail] = useState<BriefDetailSelection | null>(null)
  const [copyTip, setCopyTip] = useState<string | null>(null)

  const copyBrief = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyTip(`已复制版本 ${label}`)
      window.setTimeout(() => setCopyTip(null), 2000)
    } catch {
      setCopyTip('复制失败，请手动选择文本')
      window.setTimeout(() => setCopyTip(null), 2000)
    }
  }, [])

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
      <p className="text-center text-[11px] text-slate-500">点击卡片查看完整 Brief 文案</p>
      <BriefCard
        brief={brief}
        text={variants[0]}
        variantLabel="A"
        onOpenDetail={() => setDetail({ variantLabel: 'A', text: variants[0] })}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <BriefCard
          brief={brief}
          text={variants[1]}
          variantLabel="B"
          compact
          onOpenDetail={() => setDetail({ variantLabel: 'B', text: variants[1] })}
        />
        <BriefCard
          brief={brief}
          text={variants[2]}
          variantLabel="C"
          compact
          onOpenDetail={() => setDetail({ variantLabel: 'C', text: variants[2] })}
        />
      </div>
      {brief.enrichError ? <p className="text-center text-xs text-amber-700">{brief.enrichError}</p> : null}
      <p className="text-center text-[11px] text-slate-500">
        确认后将按您的预算与人数需求 AI 分配达人档位，并在本窗口展示招募订单明细（同时推送运营台待接单）。
      </p>

      <AiAgentOverlayModal
        open={detail != null}
        title={`达人招募 Brief · 版本 ${detail?.variantLabel ?? ''}`}
        subtitle={[brief.platform, brief.mainProductName].filter(Boolean).join(' · ')}
        onClose={() => setDetail(null)}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            {copyTip ? <span className="text-xs text-emerald-700">{copyTip}</span> : <span />}
            <button
              type="button"
              onClick={() => detail && void copyBrief(detail.text, detail.variantLabel)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-700"
            >
              <Copy className="h-3.5 w-3.5" />
              复制全文
            </button>
          </div>
        }
      >
        {detail ? (
          <div className="space-y-4">
            <BriefTags tags={brief.tags} />
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <MetaRow label="投放平台" value={brief.platform} />
              <MetaRow label="主推品" value={brief.mainProductName} />
            </dl>
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                {detail.text.trim() || '（暂无内容）'}
              </p>
            </div>
          </div>
        ) : null}
      </AiAgentOverlayModal>
    </div>
  )
}

function BriefCard({
  brief,
  text,
  variantLabel,
  compact,
  onOpenDetail,
}: {
  brief: AiRecruitmentBriefPreview
  text: string
  variantLabel: string
  compact?: boolean
  onOpenDetail: () => void
}) {
  const trimmed = text.trim()
  const isTruncated = compact && trimmed.length > 120

  return (
    <button
      type="button"
      onClick={onOpenDetail}
      className={cn(
        'group w-full overflow-hidden rounded-xl border border-slate-200/90 bg-white text-left shadow-sm transition-all',
        'hover:border-violet-300 hover:shadow-md hover:ring-2 hover:ring-violet-100/80',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500',
        !compact && 'mx-auto max-w-sm rounded-2xl shadow-md ring-1 ring-violet-100/60',
      )}
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
          className={cn(
            'whitespace-pre-wrap leading-relaxed text-slate-700',
            compact ? 'line-clamp-6 text-[11px]' : 'text-[13px] text-slate-800',
          )}
        >
          {trimmed || '（暂无内容）'}
        </p>
        <p className="flex items-center justify-end gap-0.5 text-[10px] font-medium text-violet-600 group-hover:text-violet-700">
          {isTruncated ? '查看完整文案' : '查看详情'}
          <ChevronRight className="h-3 w-3" />
        </p>
      </div>
    </button>
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

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  )
}
