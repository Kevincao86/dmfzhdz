import { ChevronDown, Clapperboard, Copy, Loader2, Play, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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

/** 预取缓存，避免重复下载 */
const prefetchCache = new Map<string, Promise<void>>()

function prefetchCaseVideo(url: string | undefined) {
  const u = String(url || '').trim()
  if (!u || typeof window === 'undefined') return
  if (prefetchCache.has(u)) return
  const p = fetch(u, { credentials: 'same-origin', mode: 'cors', cache: 'force-cache' })
    .then(async (res) => {
      if (!res.ok) throw new Error(String(res.status))
      await res.blob()
    })
    .catch(() => {
      prefetchCache.delete(u)
    })
  prefetchCache.set(u, p)
}

export type ShortVideoCaseGalleryProps = {
  onApplyCase: (item: ShortVideoCaseItem) => void
  className?: string
}

export default function ShortVideoCaseGallery({ onApplyCase, className }: ShortVideoCaseGalleryProps) {
  const [tab, setTab] = useState<TabId>('film')
  const [filterOpen, setFilterOpen] = useState(false)
  const [q, setQ] = useState('')
  const [preview, setPreview] = useState<ShortVideoCaseItem | null>(null)
  const filterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => {
    if (!preview) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreview(null)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [preview])

  // 首屏可见案例做轻量预取（最多 3 个），降低第一次点开等待
  useEffect(() => {
    const first = casesByTab('film').slice(0, 3)
    for (const c of first) prefetchCaseVideo(c.videoUrl)
  }, [])

  const activeTab = TABS.find((t) => t.id === tab)!

  const items = useMemo(() => {
    const base = casesByTab(activeTab.kind)
    const t = q.trim()
    if (!t) return base
    return base.filter(
      (c) =>
        c.title.includes(t) ||
        c.subtitle.includes(t) ||
        c.prompt.includes(t) ||
        (c.skillId && findShortVideoSkill(c.skillId)?.name.includes(t)),
    )
  }, [activeTab.kind, q])

  return (
    <section className={cn('sv-case-gallery', className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div ref={filterRef} className="relative">
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
            aria-expanded={filterOpen}
          >
            {tab === 'skill' ? '🛠️ ' : ''}
            {activeTab.label}
            <ChevronDown className={cn('h-4 w-4 text-slate-500 transition', filterOpen && 'rotate-180')} />
          </button>
          {filterOpen ? (
            <div className="absolute left-0 top-full z-40 mt-2 min-w-[10rem] overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTab(t.id)
                    setFilterOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-medium transition hover:bg-cyan-50',
                    tab === t.id && 'bg-cyan-50 text-cyan-900 ring-1 ring-cyan-200',
                  )}
                >
                  {t.id === 'skill' ? '🛠️ ' : ''}
                  {t.label}
                </button>
              ))}
            </div>
          ) : null}
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <CaseCard
            key={item.id}
            item={item}
            onPreview={() => setPreview(item)}
            onApply={() => onApplyCase(item)}
            onHover={() => prefetchCaseVideo(item.videoUrl)}
          />
        ))}
      </div>

      {items.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-400">暂无匹配案例</p>
      ) : null}

      <p className="mt-4 text-center text-[11px] text-slate-400">
        共 {SHORT_VIDEO_CASES.length} 个案例 · 悬停预载 · 轻量预览片 ·「做同款」回填参数
      </p>

      {preview ? (
        <CasePreviewModal
          item={preview}
          onClose={() => setPreview(null)}
          onApply={() => {
            onApplyCase(preview)
            setPreview(null)
          }}
        />
      ) : null}
    </section>
  )
}

function CaseCard({
  item,
  onPreview,
  onApply,
  onHover,
}: {
  item: ShortVideoCaseItem
  onPreview: () => void
  onApply: () => void
  onHover: () => void
}) {
  const skill = findShortVideoSkill(item.skillId)
  const tall = item.aspect === '9:16'

  return (
    <article
      className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      onMouseEnter={onHover}
      onFocus={onHover}
    >
      <button
        type="button"
        onClick={onPreview}
        onPointerDown={onHover}
        className={cn(
          'relative block w-full overflow-hidden bg-slate-900 text-left',
          tall ? 'aspect-[9/16]' : 'aspect-video',
        )}
        aria-label={`预览 ${item.title}`}
      >
        {item.coverUrl ? (
          <img
            src={item.coverUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(145deg, ${item.coverFrom}, ${item.coverTo})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
        <span className="absolute left-1/2 top-1/2 z-[1] flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg">
          <Play className="h-5 w-5 fill-current" aria-hidden />
        </span>
        <div className="absolute bottom-0 left-0 right-0 z-[1] space-y-1 p-4 text-white">
          {item.badge ? (
            <span className="inline-flex rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm">
              {item.badge}
            </span>
          ) : null}
          <h3 className="text-base font-semibold leading-snug">{item.title}</h3>
          <p className="text-xs text-white/85">{item.subtitle}</p>
          <p className="text-[11px] text-white/70">
            {item.aspect} · 预览约 {item.durationSec}s
            {skill ? ` · ${skill.name}` : ''}
          </p>
        </div>
      </button>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onPreview}
          onPointerDown={onHover}
          disabled={!item.videoUrl}
          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-40"
        >
          {item.videoUrl ? <Play className="h-3 w-3" /> : <Clapperboard className="h-3 w-3" />}
          {item.videoUrl ? '预览视频' : '暂无成片'}
        </button>
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

function CasePreviewModal({
  item,
  onClose,
  onApply,
}: {
  item: ShortVideoCaseItem
  onClose: () => void
  onApply: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const skill = findShortVideoSkill(item.skillId)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)
  const [err, setErr] = useState('')

  useEffect(() => {
    prefetchCaseVideo(item.videoUrl)
    setLoading(true)
    setProgress(0)
    setErr('')
    const v = videoRef.current
    if (!v) return

    const onProgress = () => {
      try {
        if (!v.duration || !Number.isFinite(v.duration)) return
        const end = v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0
        setProgress(Math.min(99, Math.round((end / v.duration) * 100)))
      } catch {
        /* ignore */
      }
    }
    const onCanPlay = () => {
      setLoading(false)
      setProgress(100)
      void v.play().catch(() => undefined)
    }
    const onWaiting = () => setLoading(true)
    const onPlaying = () => setLoading(false)
    const onError = () => {
      setLoading(false)
      setErr('视频加载失败，请稍后重试')
    }

    v.addEventListener('progress', onProgress)
    v.addEventListener('loadeddata', onProgress)
    v.addEventListener('canplay', onCanPlay)
    v.addEventListener('waiting', onWaiting)
    v.addEventListener('playing', onPlaying)
    v.addEventListener('error', onError)
    v.load()

    return () => {
      v.removeEventListener('progress', onProgress)
      v.removeEventListener('loadeddata', onProgress)
      v.removeEventListener('canplay', onCanPlay)
      v.removeEventListener('waiting', onWaiting)
      v.removeEventListener('playing', onPlaying)
      v.removeEventListener('error', onError)
    }
  }, [item.id, item.videoUrl])

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      onClick={onClose}
    >
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl',
          item.aspect === '16:9' ? 'max-w-3xl' : 'max-w-md',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
          aria-label="关闭预览"
        >
          <X className="h-4 w-4" />
        </button>
        {item.videoUrl ? (
          <div className="relative bg-black">
            <video
              ref={videoRef}
              key={item.videoUrl}
              src={item.videoUrl}
              poster={item.coverUrl}
              controls
              playsInline
              muted
              autoPlay
              preload="auto"
              className={cn(
                'max-h-[70vh] w-full bg-black object-contain',
                item.aspect === '16:9' ? 'aspect-video' : 'aspect-[9/16]',
              )}
            />
            {loading && !err ? (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/35 text-white">
                <Loader2 className="h-8 w-8 animate-spin opacity-90" />
                <p className="text-xs font-medium tabular-nums">加载中 {progress}%</p>
              </div>
            ) : null}
            {err ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 px-4 text-center text-sm text-white/90">
                {err}
              </div>
            ) : null}
          </div>
        ) : (
          <div
            className={cn(
              'flex items-center justify-center bg-slate-900 text-sm text-slate-400',
              item.aspect === '16:9' ? 'aspect-video' : 'aspect-[9/16]',
            )}
          >
            暂无视频
          </div>
        )}
        <div className="space-y-3 p-4 text-white">
          <div>
            <h3 className="text-lg font-semibold">{item.title}</h3>
            <p className="mt-1 text-sm text-white/70">{item.subtitle}</p>
            <p className="mt-1 text-xs text-white/50">
              {item.aspect} · 预览约 {item.durationSec}s
              {skill ? ` · ${skill.name}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onApply}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-400"
            >
              <Copy className="h-4 w-4" />
              做同款
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/20 px-4 py-2.5 text-sm text-white/90 hover:bg-white/10"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
