import {
  Film,
  Focus,
  ImagePlus,
  Minus,
  Plus,
  RotateCcw,
  Type,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { cn } from '../cn'
import type { ShortVideoScriptRow } from '../lib/shortVideoScriptTable'

export type CanvasMediaItem = {
  id: string
  previewUrl: string
  kind: 'image' | 'video'
  label: string
}

export type ShortVideoInfiniteCanvasProps = {
  scriptRows: ShortVideoScriptRow[]
  media: CanvasMediaItem[]
  disabled?: boolean
  onSelectRow?: (index: number) => void
  onAddMediaClick?: () => void
  className?: string
}

type Pt = { x: number; y: number }

const NODE_W = 200
const NODE_H = 120
const GAP_X = 48
const GAP_Y = 36

function nodePos(index: number, col = 0): Pt {
  return {
    x: 80 + col * (NODE_W + GAP_X * 2) + (index % 3) * (NODE_W + GAP_X),
    y: 80 + Math.floor(index / 3) * (NODE_H + GAP_Y),
  }
}

export default function ShortVideoInfiniteCanvas({
  scriptRows,
  media,
  disabled,
  onSelectRow,
  onAddMediaClick,
  className,
}: ShortVideoInfiniteCanvasProps) {
  const [scale, setScale] = useState(0.85)
  const [offset, setOffset] = useState<Pt>({ x: 40, y: 20 })
  const [panning, setPanning] = useState(false)
  const dragRef = useRef<{ start: Pt; origin: Pt } | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      setScale((s) => Math.min(2.2, Math.max(0.35, s - e.deltaY * 0.0015)))
      return
    }
    setOffset((o) => ({ x: o.x - e.deltaX, y: o.y - e.deltaY }))
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return
    const target = e.target as HTMLElement
    if (target.closest('[data-canvas-node]')) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { start: { x: e.clientX, y: e.clientY }, origin: { ...offset } }
    setPanning(true)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.start.x
    const dy = e.clientY - dragRef.current.start.y
    setOffset({ x: dragRef.current.origin.x + dx, y: dragRef.current.origin.y + dy })
  }

  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null
    setPanning(false)
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const resetView = () => {
    setScale(0.85)
    setOffset({ x: 40, y: 20 })
  }

  const scriptNodes = scriptRows.slice(0, 12)
  const mediaNodes = media.slice(0, 12)

  return (
    <div className={cn('sv-infinite-canvas overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/90 bg-white/90 px-3 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-sky-600 text-white shadow-sm">
            <Focus className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">无限画布</p>
            <p className="text-[11px] text-slate-500">拖拽平移 · ⌘/Ctrl+滚轮缩放 · 分镜与参考同屏</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <ToolbarBtn label="缩小" onClick={() => setScale((s) => Math.max(0.35, s - 0.1))} icon={ZoomOut} disabled={disabled} />
          <span className="min-w-[3rem] text-center text-xs tabular-nums text-slate-600">{Math.round(scale * 100)}%</span>
          <ToolbarBtn label="放大" onClick={() => setScale((s) => Math.min(2.2, s + 0.1))} icon={ZoomIn} disabled={disabled} />
          <ToolbarBtn label="复位" onClick={resetView} icon={RotateCcw} disabled={disabled} />
          {onAddMediaClick ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onAddMediaClick}
              className="ml-1 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <ImagePlus className="h-3.5 w-3.5" />
              添加参考
            </button>
          ) : null}
        </div>
      </div>

      <div
        ref={viewportRef}
        className={cn(
          'relative h-[min(62vh,560px)] touch-none overflow-hidden',
          panning ? 'cursor-grabbing' : 'cursor-grab',
        )}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.45) 1px, transparent 0)',
          backgroundSize: `${22 * scale}px ${22 * scale}px`,
          backgroundPosition: `${offset.x}px ${offset.y}px`,
        }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left will-change-transform"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          }}
        >
          {/* 参考媒体列 */}
          {mediaNodes.map((m, i) => {
            const p = nodePos(i, 0)
            return (
              <div
                key={m.id}
                data-canvas-node
                className="absolute overflow-hidden rounded-xl border border-white bg-white shadow-lg shadow-slate-900/10 ring-1 ring-slate-200"
                style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
              >
                {m.kind === 'video' ? (
                  <video src={m.previewUrl} muted playsInline className="h-[78%] w-full object-cover" />
                ) : (
                  <img src={m.previewUrl} alt="" className="h-[78%] w-full object-cover" />
                )}
                <div className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-600">
                  <ImagePlus className="h-3 w-3 shrink-0 text-cyan-600" />
                  <span className="truncate">参考 {i + 1} · {m.label}</span>
                </div>
              </div>
            )
          })}

          {/* 分镜脚本节点 */}
          {scriptNodes.map((row, i) => {
            const p = nodePos(i, mediaNodes.length ? 1 : 0)
            const yBoost = mediaNodes.length ? 0 : 0
            return (
              <button
                key={`script-${i}-${row.timeRange}`}
                type="button"
                data-canvas-node
                disabled={disabled}
                onClick={() => onSelectRow?.(i)}
                className="absolute overflow-hidden rounded-xl border border-cyan-200/80 bg-gradient-to-br from-white to-cyan-50/80 text-left shadow-lg shadow-cyan-900/5 ring-1 ring-cyan-100 transition hover:ring-cyan-300 disabled:opacity-60"
                style={{
                  left: p.x + (mediaNodes.length ? NODE_W + GAP_X : 0),
                  top: p.y + yBoost,
                  width: NODE_W + 24,
                  height: NODE_H + 28,
                }}
              >
                <div className="flex items-center justify-between gap-1 border-b border-cyan-100/80 bg-cyan-500/10 px-2.5 py-1.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-900">
                    <Film className="h-3 w-3" />
                    镜 {i + 1}
                  </span>
                  <span className="text-[10px] tabular-nums text-cyan-800/80">{row.timeRange || '—'}</span>
                </div>
                <div className="space-y-1 px-2.5 py-2">
                  <p className="line-clamp-2 text-[11px] leading-snug text-slate-700">
                    <Type className="mr-1 inline h-3 w-3 text-slate-400" />
                    {row.visual || '（画面待填）'}
                  </p>
                  <p className="line-clamp-2 text-[10px] leading-snug text-slate-500">
                    口播：{row.dialogue || '—'}
                  </p>
                </div>
              </button>
            )
          })}

          {scriptNodes.length === 0 && mediaNodes.length === 0 ? (
            <div
              className="absolute flex w-[320px] flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white/80 px-6 py-10 text-center"
              style={{ left: 120, top: 140 }}
              data-canvas-node
            >
              <Plus className="h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">画布为空</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                在「短片生成」中填写分镜或上传参考图后，节点会自动出现在此。
              </p>
              {onAddMediaClick ? (
                <button
                  type="button"
                  onClick={onAddMediaClick}
                  className="mt-4 inline-flex items-center gap-1 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  添加参考素材
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-white/80 px-3 py-2 text-[11px] text-slate-500">
        <span>
          分镜 {scriptNodes.length} · 参考 {mediaNodes.length}
          {scriptRows.length > 12 ? `（仅展示前 12 段）` : ''}
        </span>
        <span className="inline-flex items-center gap-2">
          <Minus className="h-3 w-3" /> 滚轮平移
          <Plus className="h-3 w-3" /> ⌘缩放
        </span>
      </div>
    </div>
  )
}

function ToolbarBtn({
  label,
  onClick,
  icon: Icon,
  disabled,
}: {
  label: string
  onClick: () => void
  icon: typeof ZoomIn
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  )
}
