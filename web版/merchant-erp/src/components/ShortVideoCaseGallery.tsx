import { ChevronDown, Clapperboard, Copy, Loader2, Play, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../cn'
import {
  SHORT_VIDEO_CASES,
  canvasLocalLifeCases,
  casesByTab,
  type ShortVideoCaseItem,
  type ShortVideoCaseKind,
} from '../lib/shortVideoCaseGallery'
import { findShortVideoSkill } from '../lib/shortVideoSkills'

type TabId = 'all' | 'discover' | 'skill' | 'film'

const TABS: { id: TabId; label: string; kind: ShortVideoCaseKind | 'all' }[] = [
  { id: 'all', label: '全部', kind: 'all' },
  { id: 'discover', label: '发现', kind: 'discover' },
  { id: 'skill', label: '技能', kind: 'skill' },
  { id: 'film', label: '短片', kind: 'film' },
]

/** 用隐藏 video 预取（跨域 OSS 无需 CORS fetch） */
const prefetchWarm = new Set<string>()

function prefetchCaseVideo(url: string | undefined) {
  const u = String(url || '').trim()
  if (!u || typeof window === 'undefined') return
  if (prefetchWarm.has(u)) return
  prefetchWarm.add(u)
  try {
    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'video'
    link.href = u
    document.head.appendChild(link)
  } catch {
    /* ignore */
  }
  const v = document.createElement('video')
  v.preload = 'auto'
  v.muted = true
  v.playsInline = true
  v.src = u
  v.load()
}

export type ShortVideoCaseGalleryProps = {
  onApplyCase: (item: ShortVideoCaseItem) => void
  className?: string
}

export default function ShortVideoCaseGallery({ onApplyCase, className }: ShortVideoCaseGalleryProps) {
  const [tab, setTab] = useState<TabId>('all')
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
    const first = casesByTab('all').slice(0, 3)
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

  const tabCount = (id: TabId) => casesByTab(TABS.find((t) => t.id === id)!.kind).length

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
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-500">
              {tabCount(tab)}
            </span>
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
                    'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition hover:bg-cyan-50',
                    tab === t.id && 'bg-cyan-50 text-cyan-900 ring-1 ring-cyan-200',
                  )}
                >
                  <span>
                    {t.id === 'skill' ? '🛠️ ' : ''}
                    {t.label}
                  </span>
                  <span className="text-[11px] tabular-nums text-slate-400">{tabCount(t.id)}</span>
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

      <div className="grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
        共 {SHORT_VIDEO_CASES.length} 个案例 · 悬停 1 秒自动播放 · 含口播案例已 AI 配音 ·「做同款」回填参数
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
  const videoRef = useRef<HTMLVideoElement>(null)
  const hoverTimerRef = useRef<number | null>(null)
  const [hoverPlaying, setHoverPlaying] = useState(false)
  const [hoverMuted, setHoverMuted] = useState(false)

  const clearHoverTimer = () => {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }

  const stopHoverPlay = () => {
    clearHoverTimer()
    setHoverPlaying(false)
    const v = videoRef.current
    if (v) {
      v.pause()
      try {
        v.currentTime = 0
      } catch {
        /* ignore */
      }
    }
  }

  const startHoverPlay = async () => {
    if (!item.videoUrl) return
    setHoverPlaying(true)
    const v = videoRef.current
    if (!v) return
    v.muted = false
    setHoverMuted(false)
    try {
      await v.play()
    } catch {
      v.muted = true
      setHoverMuted(true)
      try {
        await v.play()
      } catch {
        setHoverPlaying(false)
      }
    }
  }

  useEffect(() => () => clearHoverTimer(), [])

  return (
    <article
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      onMouseEnter={() => {
        onHover()
        clearHoverTimer()
        hoverTimerRef.current = window.setTimeout(() => {
          void startHoverPlay()
        }, 1000)
      }}
      onMouseLeave={stopHoverPlay}
      onFocus={onHover}
    >
      <button
        type="button"
        onClick={onPreview}
        onPointerDown={onHover}
        className={cn(
          'relative block w-full overflow-hidden bg-slate-950 text-left',
          item.aspect === '16:9'
            ? 'aspect-video'
            : item.aspect === '1:1'
              ? 'aspect-square'
              : 'aspect-[9/16]',
        )}
        aria-label={`预览 ${item.title}`}
      >
        {item.coverUrl ? (
          <img
            src={item.coverUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className={cn(
              'absolute inset-0 h-full w-full object-contain transition-opacity',
              hoverPlaying ? 'opacity-0' : 'opacity-100',
            )}
          />
        ) : (
          <div
            className={cn('absolute inset-0 transition-opacity', hoverPlaying ? 'opacity-0' : 'opacity-100')}
            style={{ background: `linear-gradient(145deg, ${item.coverFrom}, ${item.coverTo})` }}
          />
        )}
        {item.videoUrl ? (
          <video
            ref={videoRef}
            src={item.videoUrl}
            className={cn(
              'absolute inset-0 h-full w-full object-contain transition-opacity',
              hoverPlaying ? 'opacity-100' : 'opacity-0',
            )}
            playsInline
            loop
            preload="metadata"
            poster={item.coverUrl}
          />
        ) : null}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
        {!hoverPlaying ? (
          <span className="absolute left-1/2 top-1/2 z-[1] flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow-lg">
            <Play className="h-5 w-5 fill-current" aria-hidden />
          </span>
        ) : null}
        {hoverPlaying && hoverMuted ? (
          <span className="absolute right-3 top-3 z-[2] rounded-full bg-black/70 px-2 py-1 text-[10px] text-white">
            已静音 · 点击听口播
          </span>
        ) : null}
        <div className="absolute bottom-0 left-0 right-0 z-[1] space-y-1 p-4 text-white">
          <div className="flex flex-wrap gap-1">
            {item.badge ? (
              <span className="inline-flex rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium">
                {item.badge}
              </span>
            ) : null}
            {item.hasNarration ? (
              <span className="inline-flex rounded-full bg-cyan-600/90 px-2 py-0.5 text-[10px] font-medium">
                含口播
              </span>
            ) : null}
          </div>
          <h3 className="text-base font-semibold leading-snug drop-shadow-sm">{item.title}</h3>
          <p className="text-xs text-white/90">{item.subtitle}</p>
          <p className="text-[11px] text-white/75">
            {item.aspect} · 预览约 {item.durationSec}s
            {skill ? ` · ${skill.name}` : ''}
            {hoverPlaying ? ' · 悬停播放中' : ' · 悬停 1 秒自动播'}
          </p>
        </div>
      </button>
      <div className="mt-auto flex items-center justify-between gap-2 px-3 py-2.5">
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
  const primaryUrl = String(item.videoUrl || '').trim()
  const localFallback = primaryUrl.includes('aliyuncs.com')
    ? `/short-video-cases/${item.id}.mp4?v=local3`
    : ''
  const [playUrl, setPlayUrl] = useState(primaryUrl)

  useEffect(() => {
    setPlayUrl(primaryUrl)
    setLoading(true)
    setProgress(0)
    setErr('')
    prefetchCaseVideo(primaryUrl)
  }, [item.id, primaryUrl])

  useEffect(() => {
    const v = videoRef.current
    if (!v || !playUrl) return

    let usedFallback = false
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
      setErr('')
      // 用户点击打开预览视为手势，优先带声播放；若被拦截则静音重试并可手动开声
      void v.play().catch(() => {
        v.muted = true
        void v.play().catch(() => undefined)
      })
    }
    const onWaiting = () => setLoading(true)
    const onPlaying = () => {
      setLoading(false)
      setErr('')
    }
    const onError = () => {
      if (!usedFallback && localFallback && playUrl !== localFallback) {
        usedFallback = true
        setPlayUrl(localFallback)
        setLoading(true)
        setErr('')
        return
      }
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
  }, [playUrl, localFallback])

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
          item.aspect === '16:9' ? 'max-w-4xl' : item.aspect === '1:1' ? 'max-w-lg' : 'max-w-lg',
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
        {playUrl ? (
          <div className="relative bg-black">
            <video
              ref={videoRef}
              key={playUrl}
              src={playUrl}
              poster={item.coverUrl}
              controls
              playsInline
              autoPlay
              preload="auto"
              className={cn(
                'mx-auto max-h-[82vh] w-full bg-black object-contain',
                item.aspect === '16:9' ? 'aspect-video' : item.aspect === '1:1' ? 'aspect-square' : 'aspect-[9/16]',
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
              {item.hasNarration ? ' · 含 AI 口播' : ''}
            </p>
            {item.narrationScript ? (
              <p className="mt-2 rounded-lg bg-white/10 px-3 py-2 text-xs leading-relaxed text-white/85">
                口播：{item.narrationScript}
              </p>
            ) : null}
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

/** 无限画布下方：本地生活含口播案例条，「做同款」铺画布路径 */
export function ShortVideoCanvasLocalLifeStrip({
  onApplyCase,
  className,
}: {
  onApplyCase: (item: ShortVideoCaseItem) => void
  className?: string
}) {
  const items = useMemo(() => canvasLocalLifeCases(), [])
  const [preview, setPreview] = useState<ShortVideoCaseItem | null>(null)

  if (!items.length) return null

  return (
    <section className={cn('w-full space-y-3', className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">本地生活 · 画布案例</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            含配音预览 · 点「做同款」自动生成镜头节点与连线路径
          </p>
        </div>
        <span className="text-[11px] text-slate-400">{items.length} 款</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {items.map((item) => (
          <CanvasCaseCard
            key={item.id}
            item={item}
            onPreview={() => {
              prefetchCaseVideo(item.videoUrl)
              setPreview(item)
            }}
            onApply={() => onApplyCase(item)}
            onHover={() => prefetchCaseVideo(item.videoUrl)}
          />
        ))}
      </div>
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

function CanvasCaseCard({
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
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hoverPlaying, setHoverPlaying] = useState(false)
  const timerRef = useRef<number | null>(null)
  const pathLen = item.canvasScriptRows?.length ?? 0

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  const startHoverPlay = () => {
    onHover()
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      const v = videoRef.current
      if (!v || !item.videoUrl) return
      v.muted = false
      void v.play().then(() => setHoverPlaying(true)).catch(() => {
        v.muted = true
        void v.play().then(() => setHoverPlaying(true)).catch(() => undefined)
      })
    }, 600)
  }

  const stopHoverPlay = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = null
    const v = videoRef.current
    if (v) {
      v.pause()
      v.currentTime = 0
    }
    setHoverPlaying(false)
  }

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        className="relative aspect-[9/14] w-full overflow-hidden bg-slate-100"
        onMouseEnter={startHoverPlay}
        onMouseLeave={stopHoverPlay}
        onFocus={startHoverPlay}
        onBlur={stopHoverPlay}
        onClick={onPreview}
        aria-label={`预览 ${item.title}`}
      >
        {item.coverUrl ? (
          <img
            src={item.coverUrl}
            alt=""
            className={cn(
              'absolute inset-0 h-full w-full object-cover transition-opacity',
              hoverPlaying ? 'opacity-0' : 'opacity-100',
            )}
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(145deg, ${item.coverFrom}, ${item.coverTo})`,
            }}
          />
        )}
        {item.videoUrl ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            ref={videoRef}
            src={item.videoUrl}
            className={cn(
              'absolute inset-0 h-full w-full object-cover transition-opacity',
              hoverPlaying ? 'opacity-100' : 'opacity-0',
            )}
            playsInline
            loop
            preload="metadata"
            poster={item.coverUrl}
          />
        ) : null}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 pt-10 text-left text-white">
          <div className="mb-1 flex flex-wrap gap-1">
            <span className="rounded-full bg-cyan-600/90 px-1.5 py-0.5 text-[9px] font-medium">含配音</span>
            <span className="rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] font-medium">
              {pathLen} 镜路径
            </span>
          </div>
          <p className="text-sm font-semibold leading-snug">{item.title}</p>
          <p className="mt-0.5 line-clamp-1 text-[11px] text-white/85">{item.subtitle}</p>
        </div>
      </button>
      <div className="flex items-center gap-2 p-2.5">
        <button
          type="button"
          onClick={onPreview}
          disabled={!item.videoUrl}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-slate-100 px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-40"
        >
          <Play className="h-3 w-3" />
          预览
        </button>
        <button
          type="button"
          onClick={onApply}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-50 px-2 py-1.5 text-[11px] font-semibold text-emerald-900 ring-1 ring-emerald-200 hover:bg-emerald-100"
        >
          <Copy className="h-3 w-3" />
          做同款
        </button>
      </div>
    </article>
  )
}
