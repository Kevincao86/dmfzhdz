import {
  Check,
  Film,
  Focus,
  GitBranch,
  ImagePlus,
  Link2,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Type,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../cn'
import type { ShortVideoScriptRow } from '../lib/shortVideoScriptTable'

export type CanvasMediaItem = {
  id: string
  previewUrl: string
  kind: 'image' | 'video'
  label: string
}

export type CanvasFlowEdge = { id: string; from: number; to: number }

export type ShortVideoInfiniteCanvasProps = {
  scriptRows: ShortVideoScriptRow[]
  media: CanvasMediaItem[]
  disabled?: boolean
  /** 父级应用流程后递增，画布重置为新顺序的顺序连线 */
  flowEpoch?: number
  /** @deprecated 优先用 onChangeScriptRow 在画布内编辑 */
  onEditRow?: (index: number) => void
  /** 画布内就地改分镜字段，不跳转短片生成页 */
  onChangeScriptRow?: (index: number, patch: Partial<ShortVideoScriptRow>) => void
  onRemoveScriptRow?: (index: number) => void
  onRemoveMedia?: (id: string) => void
  /** 按连线拓扑序重排分镜并写回流程 */
  onApplyFlowOrder?: (orderedIndices: number[]) => void
  onAddMediaClick?: () => void
  className?: string
}

type Pt = { x: number; y: number }

const NODE_W = 200
const NODE_H = 120
const GAP_X = 56
const GAP_Y = 48
const SCRIPT_W = NODE_W + 28
const SCRIPT_H = NODE_H + 36
/** 就地编辑时节点加高，容纳画面/口播输入 */
const SCRIPT_H_EDIT = 248

function defaultMediaPos(index: number): Pt {
  return {
    x: 48 + (index % 2) * (NODE_W + GAP_X),
    y: 56 + Math.floor(index / 2) * (NODE_H + GAP_Y),
  }
}

function defaultScriptPos(index: number, mediaCount: number): Pt {
  const col0 = mediaCount > 0 ? 48 + 2 * (NODE_W + GAP_X) : 64
  const perRow = 4
  return {
    x: col0 + (index % perRow) * (SCRIPT_W + GAP_X),
    y: 56 + Math.floor(index / perRow) * (SCRIPT_H + GAP_Y),
  }
}

function sequentialEdges(n: number): CanvasFlowEdge[] {
  const out: CanvasFlowEdge[] = []
  for (let i = 0; i < n - 1; i++) out.push({ id: `e-${i}-${i + 1}`, from: i, to: i + 1 })
  return out
}

/** Kahn 拓扑；有环时回退为现有下标顺序 */
function topoOrder(n: number, edges: CanvasFlowEdge[]): number[] {
  const indeg = Array.from({ length: n }, () => 0)
  const adj: number[][] = Array.from({ length: n }, () => [])
  for (const e of edges) {
    if (e.from < 0 || e.to < 0 || e.from >= n || e.to >= n || e.from === e.to) continue
    adj[e.from]!.push(e.to)
    indeg[e.to]! += 1
  }
  const q: number[] = []
  for (let i = 0; i < n; i++) if (indeg[i] === 0) q.push(i)
  const order: number[] = []
  while (q.length) {
    const u = q.shift()!
    order.push(u)
    for (const v of adj[u] || []) {
      indeg[v]! -= 1
      if (indeg[v] === 0) q.push(v)
    }
  }
  if (order.length !== n) return Array.from({ length: n }, (_, i) => i)
  return order
}

type DragKind = 'pan' | 'node' | 'link'

export default function ShortVideoInfiniteCanvas({
  scriptRows,
  media,
  disabled,
  flowEpoch = 0,
  onEditRow,
  onChangeScriptRow,
  onRemoveScriptRow,
  onRemoveMedia,
  onApplyFlowOrder,
  onAddMediaClick,
  className,
}: ShortVideoInfiniteCanvasProps) {
  const [scale, setScale] = useState(0.85)
  const [offset, setOffset] = useState<Pt>({ x: 20, y: 12 })
  const [panning, setPanning] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [nodePosMap, setNodePosMap] = useState<Record<string, Pt>>({})
  const [linkMode, setLinkMode] = useState(true)
  const [edges, setEdges] = useState<CanvasFlowEdge[]>([])
  const [linkFrom, setLinkFrom] = useState<number | null>(null)
  const [linkWireEnd, setLinkWireEnd] = useState<Pt | null>(null)
  const [hoverInPort, setHoverInPort] = useState<number | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  /** 画布内正在编辑的分镜下标 */
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const lastFlowEpochRef = useRef(flowEpoch)

  const dragRef = useRef<{
    kind: DragKind
    start: Pt
    origin: Pt
    nodeId?: string
    fromIndex?: number
    moved: boolean
  } | null>(null)
  const lastTapRef = useRef<{ id: string; at: number } | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const edgesInitRef = useRef(false)

  const scriptNodes = scriptRows.slice(0, 12)
  const mediaNodes = media.slice(0, 12)
  const n = scriptNodes.length

  const mediaIds = useMemo(() => mediaNodes.map((m) => m.id).join('|'), [mediaNodes])
  const scriptKey = useMemo(
    () => scriptNodes.map((r, i) => `${i}:${r.timeRange}`).join('|'),
    [scriptNodes],
  )

  useEffect(() => {
    setNodePosMap((prev) => {
      const next = { ...prev }
      let changed = false
      const alive = new Set<string>()
      mediaNodes.forEach((m, i) => {
        const id = `media:${m.id}`
        alive.add(id)
        if (!next[id]) {
          next[id] = defaultMediaPos(i)
          changed = true
        }
      })
      scriptNodes.forEach((_row, i) => {
        const id = `script:${i}`
        alive.add(id)
        if (!next[id]) {
          next[id] = defaultScriptPos(i, mediaNodes.length)
          changed = true
        }
      })
      for (const k of Object.keys(next)) {
        if (!alive.has(k)) {
          delete next[k]
          changed = true
        }
      }
      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaIds, scriptKey, mediaNodes.length])

  // 分镜数量变化时：首次给顺序边；之后裁剪非法边
  useEffect(() => {
    setEdges((prev) => {
      if (n < 2) return []
      if (!edgesInitRef.current) {
        edgesInitRef.current = true
        return sequentialEdges(n)
      }
      const clipped = prev.filter((e) => e.from < n && e.to < n && e.from !== e.to)
      // 若节点变多且无出边覆盖，不自动乱连，保持用户边
      return clipped
    })
    setLinkFrom(null)
    setSelectedEdgeId(null)
    setEditingIndex((cur) => (cur != null && cur >= n ? null : cur))
  }, [n, scriptKey])

  // 父级应用流程后：分镜已按拓扑重排，连线恢复为新顺序 1→2→…
  useEffect(() => {
    if (flowEpoch === lastFlowEpochRef.current) return
    lastFlowEpochRef.current = flowEpoch
    if (n >= 2) setEdges(sequentialEdges(n))
    else setEdges([])
    setLinkFrom(null)
    setSelectedEdgeId(null)
  }, [flowEpoch, n])

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      setScale((s) => Math.min(2.2, Math.max(0.35, s - e.deltaY * 0.0015)))
      return
    }
    setOffset((o) => ({ x: o.x - e.deltaX, y: o.y - e.deltaY }))
  }, [])

  const clientToWorld = (clientX: number, clientY: number): Pt => {
    const el = viewportRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    return {
      x: (clientX - rect.left - offset.x) / scale,
      y: (clientY - rect.top - offset.y) / scale,
    }
  }

  const tryOpenEdit = (nodeId: string) => {
    if (disabled) return
    const m = /^script:(\d+)$/.exec(nodeId)
    if (!m) return
    const idx = Number(m[1])
    if (onChangeScriptRow) {
      setEditingIndex((cur) => (cur === idx ? null : idx))
      setSelectedId(nodeId)
      return
    }
    onEditRow?.(idx)
  }

  const scriptNodeHeight = (index: number) =>
    editingIndex === index ? SCRIPT_H_EDIT : SCRIPT_H

  const addEdge = (from: number, to: number) => {
    if (from === to) return
    setEdges((prev) => {
      if (prev.some((e) => e.from === from && e.to === to)) return prev
      return [...prev, { id: `e-${from}-${to}-${Date.now()}`, from, to }]
    })
    setLinkFrom(null)
    setLinkWireEnd(null)
    setHoverInPort(null)
  }

  const portOutWorld = (index: number): Pt => {
    const id = `script:${index}`
    const p = nodePosMap[id] || defaultScriptPos(index, mediaNodes.length)
    const h = scriptNodeHeight(index)
    return { x: p.x + SCRIPT_W, y: p.y + h / 2 }
  }

  const portInWorld = (index: number): Pt => {
    const id = `script:${index}`
    const p = nodePosMap[id] || defaultScriptPos(index, mediaNodes.length)
    const h = scriptNodeHeight(index)
    return { x: p.x, y: p.y + h / 2 }
  }

  const hitTestInPort = (world: Pt): number | null => {
    const hitR = 22
    let best: number | null = null
    let bestD = hitR * hitR
    for (let i = 0; i < n; i++) {
      const p = portInWorld(i)
      const dx = world.x - p.x
      const dy = world.y - p.y
      const d2 = dx * dx + dy * dy
      if (d2 <= bestD) {
        bestD = d2
        best = i
      }
    }
    return best
  }

  /** 从出口按下开始拖拽连线（鼠标路径） */
  const onPortOutPointerDown = (index: number, e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (disabled || !linkMode) return
    const viewport = viewportRef.current
    if (!viewport) return
    viewport.setPointerCapture(e.pointerId)
    const world = clientToWorld(e.clientX, e.clientY)
    dragRef.current = {
      kind: 'link',
      start: world,
      origin: portOutWorld(index),
      fromIndex: index,
      moved: false,
    }
    setLinkFrom(index)
    setLinkWireEnd(world)
    setSelectedId(`script:${index}`)
    setSelectedEdgeId(null)
    setPanning(false)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return
    if (e.button !== 0 && e.button !== 1) return
    const target = e.target as HTMLElement
    if (target.closest('[data-port-out]') || target.closest('[data-port-in]')) return
    if (target.closest('[data-node-action]')) return
    if (target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return

    const nodeEl = target.closest('[data-canvas-node]') as HTMLElement | null
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

    if (nodeEl?.dataset.nodeId && nodeEl.dataset.nodeId !== 'empty') {
      const nodeId = nodeEl.dataset.nodeId
      // 编辑中的节点禁止拖拽，避免误移
      const editMatch = /^script:(\d+)$/.exec(nodeId)
      if (editMatch && editingIndex === Number(editMatch[1])) return
      const pos = nodePosMap[nodeId] || { x: 0, y: 0 }
      const world = clientToWorld(e.clientX, e.clientY)
      dragRef.current = {
        kind: 'node',
        start: world,
        origin: { ...pos },
        nodeId,
        moved: false,
      }
      setSelectedId(nodeId)
      setPanning(false)
      return
    }

    dragRef.current = {
      kind: 'pan',
      start: { x: e.clientX, y: e.clientY },
      origin: { ...offset },
      moved: false,
    }
    setPanning(true)
    setSelectedId(null)
    setEditingIndex(null)
    setLinkFrom(null)
    setLinkWireEnd(null)
    setHoverInPort(null)
    setSelectedEdgeId(null)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    if (d.kind === 'pan') {
      const dx = e.clientX - d.start.x
      const dy = e.clientY - d.start.y
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
      setOffset({ x: d.origin.x + dx, y: d.origin.y + dy })
      return
    }
    if (d.kind === 'link') {
      const world = clientToWorld(e.clientX, e.clientY)
      if (Math.abs(world.x - d.start.x) + Math.abs(world.y - d.start.y) > 2) d.moved = true
      setLinkWireEnd(world)
      const hit = hitTestInPort(world)
      setHoverInPort(hit != null && hit !== d.fromIndex ? hit : null)
      return
    }
    if (d.kind === 'node' && d.nodeId) {
      const world = clientToWorld(e.clientX, e.clientY)
      const dx = world.x - d.start.x
      const dy = world.y - d.start.y
      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true
      setNodePosMap((prev) => ({
        ...prev,
        [d.nodeId!]: { x: d.origin.x + dx, y: d.origin.y + dy },
      }))
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current
    dragRef.current = null
    setPanning(false)
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    if (d?.kind === 'link' && d.fromIndex != null) {
      const world = clientToWorld(e.clientX, e.clientY)
      const hit = hitTestInPort(world)
      if (hit != null && hit !== d.fromIndex) addEdge(d.fromIndex, hit)
      else {
        setLinkFrom(null)
        setLinkWireEnd(null)
        setHoverInPort(null)
      }
      return
    }
    if (d?.kind === 'node' && d.nodeId && !d.moved) {
      setSelectedId(d.nodeId)
      const now = Date.now()
      const prev = lastTapRef.current
      if (prev && prev.id === d.nodeId && now - prev.at < 380) {
        lastTapRef.current = null
        tryOpenEdit(d.nodeId)
      } else {
        lastTapRef.current = { id: d.nodeId, at: now }
      }
    }
  }

  const resetView = () => {
    setScale(0.85)
    setOffset({ x: 20, y: 12 })
    setNodePosMap({})
    setSelectedId(null)
    setLinkFrom(null)
    setLinkWireEnd(null)
    setHoverInPort(null)
  }

  const flowPaths = useMemo(() => {
    if (edges.length === 0) return [] as { id: string; d: string; label: string; mid: Pt }[]
    return edges.map((e) => {
      const a = nodePosMap[`script:${e.from}`] || defaultScriptPos(e.from, mediaNodes.length)
      const b = nodePosMap[`script:${e.to}`] || defaultScriptPos(e.to, mediaNodes.length)
      const x1 = a.x + SCRIPT_W
      const y1 = a.y + SCRIPT_H / 2
      const x2 = b.x
      const y2 = b.y + SCRIPT_H / 2
      const dx = Math.max(40, Math.abs(x2 - x1) * 0.45)
      const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
      return {
        id: e.id,
        d,
        label: `${e.from + 1}→${e.to + 1}`,
        mid: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 10 },
      }
    })
  }, [edges, nodePosMap, mediaNodes.length])

  const liveWirePath = useMemo(() => {
    if (linkFrom == null || !linkWireEnd) return null
    const a = portOutWorld(linkFrom)
    const x1 = a.x
    const y1 = a.y
    const x2 = linkWireEnd.x
    const y2 = linkWireEnd.y
    const dx = Math.max(40, Math.abs(x2 - x1) * 0.45)
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkFrom, linkWireEnd, nodePosMap, mediaNodes.length, n])

  const orderPreview = useMemo(() => topoOrder(n, edges).map((i) => i + 1).join(' → '), [n, edges])

  return (
    <div
      className={cn(
        'sv-infinite-canvas w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/90 bg-white/90 px-3 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-sky-600 text-white shadow-sm">
            <Focus className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">无限画布</p>
            <p className="text-[11px] text-slate-500">
              按住右侧圆点拖到左侧入口完成连线 · 点线可选中/双击删除 ·「应用流程」同步顺序
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setLinkMode((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium',
              linkMode
                ? 'border-cyan-200 bg-cyan-50 text-cyan-800'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            <Link2 className="h-3.5 w-3.5" />
            {linkMode ? '自由连线 · 开' : '自由连线 · 关'}
          </button>
          <button
            type="button"
            disabled={disabled || n < 2}
            onClick={() => {
              setEdges(sequentialEdges(n))
              setLinkFrom(null)
              setSelectedEdgeId(null)
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <GitBranch className="h-3.5 w-3.5" />
            一键顺序
          </button>
          <button
            type="button"
            disabled={disabled || edges.length === 0}
            onClick={() => {
              setEdges([])
              setLinkFrom(null)
              setSelectedEdgeId(null)
            }}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            清空连线
          </button>
          <button
            type="button"
            disabled={disabled || !selectedEdgeId}
            onClick={() => {
              if (!selectedEdgeId) return
              setEdges((prev) => prev.filter((e) => e.id !== selectedEdgeId))
              setSelectedEdgeId(null)
            }}
            className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-40"
          >
            删除选中线
          </button>
          {onApplyFlowOrder ? (
            <button
              type="button"
              disabled={disabled || n < 2 || edges.length === 0}
              onClick={() => onApplyFlowOrder(topoOrder(n, edges))}
              className="rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-xs font-semibold text-cyan-900 hover:bg-cyan-100 disabled:opacity-40"
            >
              应用流程
            </button>
          ) : null}
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

      {linkFrom != null ? (
        <div className="border-b border-amber-100 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-900">
          正在从镜 {linkFrom + 1} 拖出连线，松手到目标分镜左侧入口即可完成；松在空白处取消。
        </div>
      ) : null}

      <div
        ref={viewportRef}
        className={cn(
          'relative h-[min(62vh,560px)] w-full touch-none overflow-hidden',
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
          {flowPaths.length > 0 || liveWirePath ? (
            <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={2800} height={1800}>
              <defs>
                <marker id="sv-flow-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L6,3 L0,6 Z" fill="#22d3ee" />
                </marker>
                <marker id="sv-live-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L6,3 L0,6 Z" fill="#f59e0b" />
                </marker>
              </defs>
              {flowPaths.map((p) => {
                const active = selectedEdgeId === p.id
                return (
                  <g
                    key={p.id}
                    className="pointer-events-auto cursor-pointer"
                    onPointerDown={(ev) => {
                      ev.stopPropagation()
                      if (disabled || !linkMode) return
                      setSelectedEdgeId(p.id)
                      setSelectedId(null)
                      setLinkFrom(null)
                      setLinkWireEnd(null)
                    }}
                    onDoubleClick={(ev) => {
                      ev.stopPropagation()
                      if (disabled) return
                      setEdges((prev) => prev.filter((e) => e.id !== p.id))
                      setSelectedEdgeId(null)
                    }}
                  >
                    <path d={p.d} fill="none" stroke="transparent" strokeWidth="14" />
                    <path
                      d={p.d}
                      fill="none"
                      stroke={active ? '#f97316' : '#67e8f9'}
                      strokeWidth={active ? 3.2 : 2.5}
                      strokeDasharray="6 4"
                      markerEnd="url(#sv-flow-arrow)"
                      opacity="0.95"
                    />
                    <rect
                      x={p.mid.x - 18}
                      y={p.mid.y - 8}
                      width="36"
                      height="16"
                      rx="8"
                      fill={active ? '#fff7ed' : '#ecfeff'}
                      stroke={active ? '#fdba74' : '#a5f3fc'}
                    />
                    <text x={p.mid.x} y={p.mid.y + 4} textAnchor="middle" fontSize="9" fill={active ? '#c2410c' : '#0e7490'} fontWeight="600">
                      {p.label}
                    </text>
                  </g>
                )
              })}
              {liveWirePath ? (
                <path
                  d={liveWirePath}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="2.8"
                  strokeDasharray="5 4"
                  markerEnd="url(#sv-live-arrow)"
                  opacity="0.95"
                />
              ) : null}
            </svg>
          ) : null}

          {mediaNodes.map((m, i) => {
            const id = `media:${m.id}`
            const p = nodePosMap[id] || defaultMediaPos(i)
            const selected = selectedId === id
            return (
              <div
                key={m.id}
                data-canvas-node
                data-node-id={id}
                className={cn(
                  'absolute cursor-grab overflow-hidden rounded-xl border bg-white shadow-lg shadow-slate-900/10 active:cursor-grabbing',
                  selected ? 'border-cyan-400 ring-2 ring-cyan-400/40' : 'border-white ring-1 ring-slate-200',
                )}
                style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
              >
                {onRemoveMedia ? (
                  <button
                    type="button"
                    data-node-action
                    disabled={disabled}
                    aria-label="删除参考"
                    onPointerDown={(ev) => ev.stopPropagation()}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      onRemoveMedia(m.id)
                    }}
                    className="absolute right-1.5 top-1.5 z-[2] rounded-full bg-black/55 p-1 text-white hover:bg-rose-600"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                ) : null}
                {m.kind === 'video' ? (
                  <video src={m.previewUrl} muted playsInline className="pointer-events-none h-[78%] w-full object-cover" />
                ) : (
                  <img src={m.previewUrl} alt="" className="pointer-events-none h-[78%] w-full object-cover" />
                )}
                <div className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-600">
                  <ImagePlus className="h-3 w-3 shrink-0 text-cyan-600" />
                  <span className="truncate">参考 {i + 1} · {m.label}</span>
                </div>
              </div>
            )
          })}

          {scriptNodes.map((row, i) => {
            const id = `script:${i}`
            const p = nodePosMap[id] || defaultScriptPos(i, mediaNodes.length)
            const selected = selectedId === id || linkFrom === i
            const editing = editingIndex === i
            const nodeH = scriptNodeHeight(i)
            return (
              <div
                key={id}
                data-canvas-node
                data-node-id={id}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (editing) return
                  if (e.key === 'Enter') tryOpenEdit(id)
                  if (e.key === 'Backspace' || e.key === 'Delete') onRemoveScriptRow?.(i)
                }}
                className={cn(
                  'absolute overflow-visible rounded-xl border bg-gradient-to-br from-white to-cyan-50/80 text-left shadow-lg shadow-cyan-900/5',
                  editing ? 'cursor-default z-[5]' : 'cursor-grab active:cursor-grabbing',
                  selected || editing
                    ? 'border-cyan-400 ring-2 ring-cyan-400/40'
                    : 'border-cyan-200/80 ring-1 ring-cyan-100',
                )}
                style={{ left: p.x, top: p.y, width: SCRIPT_W, height: nodeH }}
              >
                {/* 入口 / 出口连线桩 */}
                {linkMode ? (
                  <>
                    <button
                      type="button"
                      data-port-in
                      data-node-action
                      title="连线入口（拖到此处松手）"
                      onPointerDown={(ev) => ev.stopPropagation()}
                      className={cn(
                        'absolute -left-2.5 top-1/2 z-[3] h-5 w-5 -translate-y-1/2 rounded-full border-2 bg-white shadow transition',
                        hoverInPort === i
                          ? 'scale-125 border-amber-500 bg-amber-100 ring-2 ring-amber-300'
                          : 'border-cyan-500 hover:scale-110',
                      )}
                    />
                    <button
                      type="button"
                      data-port-out
                      data-node-action
                      title="按住拖出连线"
                      onPointerDown={(ev) => onPortOutPointerDown(i, ev)}
                      className={cn(
                        'absolute -right-2.5 top-1/2 z-[3] h-5 w-5 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-sky-500 bg-sky-400 shadow hover:scale-110',
                        linkFrom === i && 'ring-2 ring-amber-400',
                      )}
                    />
                  </>
                ) : null}

                <div className="flex h-full flex-col overflow-hidden rounded-xl">
                  <div className="flex shrink-0 items-center justify-between gap-1 border-b border-cyan-100/80 bg-cyan-500/10 px-2 py-1.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-900">
                      <Film className="h-3 w-3" />
                      镜 {i + 1}
                    </span>
                    <span className="flex items-center gap-0.5">
                      {editing ? (
                        <input
                          type="text"
                          data-node-action
                          disabled={disabled}
                          value={row.timeRange}
                          aria-label="时间段"
                          placeholder="0-15秒"
                          onPointerDown={(ev) => ev.stopPropagation()}
                          onChange={(ev) => onChangeScriptRow?.(i, { timeRange: ev.target.value })}
                          className="mr-1 w-[4.5rem] rounded border border-cyan-200 bg-white px-1 py-0.5 text-[10px] tabular-nums text-cyan-900 outline-none ring-cyan-400/40 focus:ring-1"
                        />
                      ) : (
                        <span className="mr-1 text-[10px] tabular-nums text-cyan-800/80">
                          {row.timeRange || '—'}
                        </span>
                      )}
                      <button
                        type="button"
                        data-node-action
                        disabled={disabled}
                        aria-label={editing ? '完成编辑' : '编辑分镜'}
                        title={editing ? '完成' : '在画布内编辑'}
                        onPointerDown={(ev) => ev.stopPropagation()}
                        onClick={(ev) => {
                          ev.stopPropagation()
                          if (editing) setEditingIndex(null)
                          else tryOpenEdit(id)
                        }}
                        className={cn(
                          'rounded-md p-1 text-cyan-800 hover:bg-cyan-100',
                          editing && 'bg-cyan-200/80',
                        )}
                      >
                        {editing ? <Check className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                      </button>
                      {onRemoveScriptRow ? (
                        <button
                          type="button"
                          data-node-action
                          disabled={disabled || scriptNodes.length <= 1}
                          aria-label="删除分镜"
                          onPointerDown={(ev) => ev.stopPropagation()}
                          onClick={(ev) => {
                            ev.stopPropagation()
                            if (editingIndex === i) setEditingIndex(null)
                            onRemoveScriptRow(i)
                          }}
                          className="rounded-md p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      ) : null}
                    </span>
                  </div>
                  {editing && onChangeScriptRow ? (
                    <div
                      data-node-action
                      className="flex min-h-0 flex-1 flex-col gap-1.5 px-2 py-2"
                      onPointerDown={(ev) => ev.stopPropagation()}
                    >
                      <label className="flex min-h-0 flex-1 flex-col gap-0.5">
                        <span className="text-[9px] font-medium text-slate-500">画面 / 指令</span>
                        <textarea
                          disabled={disabled}
                          value={row.visual}
                          placeholder="镜头、人物动作、产品特写…"
                          rows={3}
                          autoFocus
                          onChange={(ev) => onChangeScriptRow(i, { visual: ev.target.value })}
                          className="min-h-0 flex-1 resize-none rounded-md border border-cyan-200 bg-white px-1.5 py-1 text-[11px] leading-snug text-slate-800 outline-none ring-cyan-400/30 focus:ring-1"
                        />
                      </label>
                      <label className="flex shrink-0 flex-col gap-0.5">
                        <span className="text-[9px] font-medium text-slate-500">口播 / 文案</span>
                        <textarea
                          disabled={disabled}
                          value={row.dialogue}
                          placeholder="该时段口播…"
                          rows={2}
                          onChange={(ev) => onChangeScriptRow(i, { dialogue: ev.target.value })}
                          className="resize-none rounded-md border border-cyan-200 bg-white px-1.5 py-1 text-[10px] leading-snug text-slate-700 outline-none ring-cyan-400/30 focus:ring-1"
                        />
                      </label>
                    </div>
                  ) : (
                    <div
                      className="space-y-1 px-2.5 py-2"
                      onDoubleClick={(ev) => {
                        ev.stopPropagation()
                        tryOpenEdit(id)
                      }}
                    >
                      <p className="line-clamp-2 text-[11px] leading-snug text-slate-700">
                        <Type className="mr-1 inline h-3 w-3 text-slate-400" />
                        {row.visual || '（画面待填）'}
                      </p>
                      <p className="line-clamp-2 text-[10px] leading-snug text-slate-500">
                        口播：{row.dialogue || '—'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {scriptNodes.length === 0 && mediaNodes.length === 0 ? (
            <div
              className="absolute flex w-[320px] flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white/80 px-6 py-10 text-center"
              style={{ left: 120, top: 140 }}
              data-canvas-node
              data-node-id="empty"
            >
              <Plus className="h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">画布为空</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                按住右侧圆点拖到左侧入口自由连线，再点「应用流程」同步到生成工作区。
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white/80 px-3 py-2 text-[11px] text-slate-500">
        <span>
          分镜 {n} · 连线 {edges.length}
          {n > 1 && edges.length > 0 ? ` · 流程预览 ${orderPreview}` : ''}
          {selectedId?.startsWith('script:') ? ' · 已选中' : ''}
        </span>
        <span className="inline-flex items-center gap-2">
          <Minus className="h-3 w-3" /> 拖空白平移
          <Plus className="h-3 w-3" /> 左右圆点连线
          <Pencil className="h-3 w-3" /> 铅笔/双击就地编辑
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
