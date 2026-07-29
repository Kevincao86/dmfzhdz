import { Clapperboard, Copy, Play, Search, Volume2, Wrench } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { cn } from '../cn'
import {
  SHORT_VIDEO_CASES,
  casesByTab,
  type ShortVideoCaseItem,
  type ShortVideoCaseKind,
} from '../lib/shortVideoCaseGallery'
import { findShortVideoSkill } from '../lib/shortVideoSkills'

type TabId = 'discover' | 'skill' | 'film'

const TABS: { id: TabId; label: string; kind: ShortVideoCaseKind }[] = [
  { id: 'discover', label: '发现', kind: 'discover' },
  { id: 'skill', label: '技能', kind: 'skill' },
  { id: 'film', label: '短片', kind: 'film' },
]

export type ShortVideoCaseGalleryProps = {
  onApplyCase: (item: ShortVideoCaseItem) => void
  className?: string
}

export default function ShortVideoCaseGallery({ onApplyCase, className }: ShortVideoCaseGalleryProps) {
  const [tab, setTab] = useState<TabId>('film')
  const [q, setQ] = useState('')

  const items = useMemo(() => {
    const base = casesByTab(TABS.find((t) => t.id === tab)!.kind)
    const t = q.trim()
    if (!t) return base
    return base.filter(
      (c) =>
        c.title.includes(t) ||
        c.subtitle.includes(t) ||
        c.prompt.includes(t) ||
        (c.skillId && findShortVideoSkill(c.skillId)?.name.includes(t)),
    )
  }, [tab, q])

  return (
    <section className={cn('sv-case-gallery', className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 p-1 shadow-sm">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition',
                tab === t.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50',
              )}
            >
              {t.id === 'skill' ? '🛠️ ' : ''}
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索案例"
            className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
          />
        </div>
      </div>

      <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
        {items.map((item) => (
          <CaseCard key={item.id} item={item} onApply={() => onApplyCase(item)} />
        ))}
      </div>

      {items.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-400">暂无匹配案例</p>
      ) : null}

      <p className="mt-4 text-center text-[11px] text-slate-400">
        共 {SHORT_VIDEO_CASES.length} 个案例 · AI 封面运镜短片可悬停预览 ·「做同款」回填文案与参数
      </p>
    </section>
  )
}

function CaseCard({ item, onApply }: { item: ShortVideoCaseItem; onApply: () => void }) {
  const skill = findShortVideoSkill(item.skillId)
  const tall = item.aspect === '9:16'
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)

  const onEnter = () => {
    const v = videoRef.current
    if (!v || !item.videoUrl) return
    void v.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
  }

  const onLeave = () => {
    const v = videoRef.current
    if (!v) return
    v.pause()
    v.currentTime = 0
    setPlaying(false)
  }

  return (
    <article
      className={cn(
        'group mb-4 break-inside-avoid overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md',
      )}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div
        className={cn('relative overflow-hidden', tall ? 'aspect-[9/16] min-h-[220px]' : 'aspect-video min-h-[140px]')}
        style={
          item.coverUrl
            ? undefined
            : { background: `linear-gradient(145deg, ${item.coverFrom}, ${item.coverTo})` }
        }
      >
        {item.coverUrl ? (
          <img
            src={item.coverUrl}
            alt=""
            className={cn('absolute inset-0 h-full w-full object-cover transition', playing && 'opacity-0')}
          />
        ) : null}
        {item.videoUrl ? (
          <video
            ref={videoRef}
            src={item.videoUrl}
            muted
            loop
            playsInline
            preload="metadata"
            className={cn(
              'absolute inset-0 h-full w-full object-cover transition',
              playing ? 'opacity-100' : 'opacity-0',
            )}
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 z-[1] space-y-1 p-4 text-white">
          {item.badge ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm">
              {item.videoUrl ? <Play className="h-2.5 w-2.5" /> : null}
              {item.badge}
            </span>
          ) : null}
          <h3 className="text-base font-semibold leading-snug">{item.title}</h3>
          <p className="text-xs text-white/85">{item.subtitle}</p>
          <p className="text-[11px] text-white/70">
            {item.aspect} · {item.durationSec}s{item.longform ? ' · 长视频' : ''}
            {skill ? ` · ${skill.name}` : ''}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
          {item.kind === 'skill' ? (
            <Wrench className="h-3 w-3" />
          ) : item.videoUrl ? (
            <Volume2 className="h-3 w-3" />
          ) : (
            <Clapperboard className="h-3 w-3" />
          )}
          {item.videoUrl ? 'AI 短片预览' : item.kind === 'skill' ? '技能案例' : '灵感发现'}
        </span>
        <button
          type="button"
          onClick={onApply}
          className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800 ring-1 ring-cyan-200/80 transition hover:bg-cyan-100"
        >
          <Copy className="h-3 w-3" aria-hidden />
          做同款
        </button>
      </div>
    </article>
  )
}
