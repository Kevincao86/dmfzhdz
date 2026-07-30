import { Headphones, Music2, Pause, Play, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../cn'
import {
  recommendMusicForPrompt,
  SHORT_VIDEO_MUSIC_LIBRARY,
  type ShortVideoMusicMood,
  type ShortVideoMusicTrack,
} from '../lib/shortVideoMusicLibrary'

const ALL_MOODS: ShortVideoMusicMood[] = [
  '探店',
  '美食',
  '促销',
  '氛围',
  '种草',
  '短剧',
  '美业',
  '健身',
  '酒店',
  '亲子',
  '萌宠',
  '城市',
]

export type ShortVideoMusicStudioProps = {
  promptHint?: string
  disabled?: boolean
  selectedTrackId?: string | null
  onSelectTrack?: (track: ShortVideoMusicTrack) => void
  className?: string
}

export default function ShortVideoMusicStudio({
  promptHint = '',
  disabled,
  selectedTrackId,
  onSelectTrack,
  className,
}: ShortVideoMusicStudioProps) {
  const [mood, setMood] = useState<ShortVideoMusicMood | '全部'>('全部')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const recommended = useMemo(() => recommendMusicForPrompt(promptHint), [promptHint])

  const list = useMemo(() => {
    const base =
      mood === '全部'
        ? [...SHORT_VIDEO_MUSIC_LIBRARY]
        : SHORT_VIDEO_MUSIC_LIBRARY.filter((t) => t.moods.includes(mood))
    // 有提示词时，推荐靠前
    if (!promptHint.trim() || mood !== '全部') return base
    const recIds = new Set(recommended.map((t) => t.id))
    return [...base].sort((a, b) => Number(recIds.has(b.id)) - Number(recIds.has(a.id)))
  }, [mood, promptHint, recommended])

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  const stopPreview = () => {
    audioRef.current?.pause()
    audioRef.current = null
    setPlayingId(null)
  }

  const togglePreview = (track: ShortVideoMusicTrack) => {
    if (disabled) return
    if (playingId === track.id) {
      stopPreview()
      return
    }
    stopPreview()
    const a = new Audio(track.previewUrl)
    a.volume = 0.85
    a.onended = () => setPlayingId(null)
    a.onerror = () => setPlayingId(null)
    void a.play().catch(() => setPlayingId(null))
    audioRef.current = a
    setPlayingId(track.id)
  }

  return (
    <section
      className={cn(
        'overflow-visible rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50/80 via-white to-cyan-50/40 shadow-sm',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-violet-100/80 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-md">
            <Music2 className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-zinc-900">音乐 / 配乐工作室区</p>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
              按内容匹配独立曲目（互不重复）· 试听后选用 · 与 AI 混剪相互独立
            </p>
          </div>
        </div>
        <span className="rounded-full border border-violet-200 bg-white/80 px-3 py-1 text-[11px] font-medium text-violet-800">
          {SHORT_VIDEO_MUSIC_LIBRARY.length} 首独立曲库
        </span>
      </div>

      <div className="space-y-4 px-5 py-4">
        {promptHint.trim() ? (
          <div className="rounded-xl border border-violet-100 bg-white/80 px-3 py-2.5 text-xs text-zinc-600">
            <span className="inline-flex items-center gap-1 font-medium text-violet-800">
              <Sparkles className="h-3.5 w-3.5" />
              根据上方文案智能推荐
            </span>
            <span className="mt-1 block text-zinc-500">
              优先：{recommended.slice(0, 3).map((t) => t.title).join(' · ') || '通用氛围'}
            </span>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">
            可在上方输入门店/场景描述，系统会按关键词推荐匹配配乐；也可直接按场景筛选试听。
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          <MoodChip active={mood === '全部'} onClick={() => setMood('全部')} label="全部" />
          {ALL_MOODS.map((m) => (
            <MoodChip key={m} active={mood === m} onClick={() => setMood(m)} label={m} />
          ))}
        </div>

        <ul className="grid gap-2 sm:grid-cols-2">
          {list.map((track) => {
            const selected = selectedTrackId === track.id
            const playing = playingId === track.id
            const isRec = recommended.some((r) => r.id === track.id)
            return (
              <li
                key={track.id}
                className={cn(
                  'flex items-stretch gap-2 rounded-xl border bg-white/90 p-3 shadow-sm transition',
                  selected ? 'border-violet-400 ring-2 ring-violet-200' : 'border-zinc-200 hover:border-violet-200',
                )}
              >
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => togglePreview(track)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-40"
                  aria-label={playing ? '暂停' : '试听'}
                >
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-zinc-900">{track.title}</p>
                    {isRec ? (
                      <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                        推荐
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-500">{track.description}</p>
                  <p className="mt-1 text-[10px] text-zinc-400">{track.moods.join(' · ')}</p>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    stopPreview()
                    onSelectTrack?.(track)
                  }}
                  className={cn(
                    'self-center rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40',
                    selected
                      ? 'bg-violet-600 text-white'
                      : 'border border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100',
                  )}
                >
                  {selected ? '已选' : '选用'}
                </button>
              </li>
            )
          })}
        </ul>

        <div className="flex items-start gap-2 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 px-3 py-2.5 text-[11px] leading-relaxed text-zinc-500">
          <Headphones className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
          <span>
            选用后，生成短片时可在成片包装阶段使用该配乐。需要多素材拼接包装请另开「AI 混剪」工作区，不会从本页自动跳转。
          </span>
        </div>
      </div>
    </section>
  )
}

function MoodChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-2.5 py-1 text-[11px] font-medium transition',
        active
          ? 'bg-violet-600 text-white shadow-sm'
          : 'border border-zinc-200 bg-white text-zinc-600 hover:border-violet-200 hover:text-violet-800',
      )}
    >
      {label}
    </button>
  )
}
