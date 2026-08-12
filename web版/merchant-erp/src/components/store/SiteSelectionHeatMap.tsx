import { useMemo } from 'react'
import type { SiteSelectionRecommendSpot } from '../../services/storeIntelApi'

type HeatCell = { lat: number; lng: number; weight: number }

function heatColor(w: number): string {
  const t = Math.min(1, Math.max(0, w / 100))
  if (t > 0.75) return `rgba(225, 29, 72, ${0.35 + t * 0.45})`
  if (t > 0.5) return `rgba(245, 158, 11, ${0.3 + t * 0.4})`
  if (t > 0.3) return `rgba(14, 165, 233, ${0.25 + t * 0.35})`
  return `rgba(148, 163, 184, ${0.2 + t * 0.25})`
}

function project(
  lat: number,
  lng: number,
  center: { lat: number; lng: number },
  width: number,
  height: number,
  spanLat: number,
  spanLng: number,
): { x: number; y: number } {
  const x = ((lng - center.lng) / spanLng + 0.5) * width
  const y = (0.5 - (lat - center.lat) / spanLat) * height
  return { x, y }
}

export default function SiteSelectionHeatMap({
  center,
  heatMapGrid,
  recommendations,
  candidateLabel,
}: {
  center: { lat: number; lng: number }
  heatMapGrid: HeatCell[]
  recommendations?: SiteSelectionRecommendSpot[]
  candidateLabel?: string
}) {
  const { spanLat, spanLng, sorted } = useMemo(() => {
    const lats = heatMapGrid.map((c) => c.lat)
    const lngs = heatMapGrid.map((c) => c.lng)
    const minLat = Math.min(...lats, center.lat)
    const maxLat = Math.max(...lats, center.lat)
    const minLng = Math.min(...lngs, center.lng)
    const maxLng = Math.max(...lngs, center.lng)
    return {
      spanLat: Math.max(maxLat - minLat, 0.004) * 1.15,
      spanLng: Math.max(maxLng - minLng, 0.004) * 1.15,
      sorted: [...heatMapGrid].sort((a, b) => a.weight - b.weight),
    }
  }, [heatMapGrid, center])

  const W = 640
  const H = 420

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-900 shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-200/90">地图热力图</p>
          <p className="text-[11px] text-slate-400">
            区位代理热力（周边 POI 衰减）· 非慧眼信令 · 红点=预想点位 · 绿点=推荐点
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-300">
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2 w-3 rounded-sm bg-slate-400/80" />低
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2 w-3 rounded-sm bg-sky-400/80" />中
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2 w-3 rounded-sm bg-amber-400/90" />高
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2 w-3 rounded-sm bg-rose-500" />很高
          </span>
        </div>
      </div>
      <div className="relative w-full overflow-hidden bg-[radial-gradient(ellipse_at_center,_#1e293b_0%,_#0f172a_70%)]">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="选址热力图">
          {/* 网格 */}
          {Array.from({ length: 9 }).map((_, i) => (
            <line
              key={`v-${i}`}
              x1={(W / 8) * i}
              y1={0}
              x2={(W / 8) * i}
              y2={H}
              stroke="rgba(148,163,184,0.12)"
              strokeWidth={1}
            />
          ))}
          {Array.from({ length: 7 }).map((_, i) => (
            <line
              key={`h-${i}`}
              x1={0}
              y1={(H / 6) * i}
              x2={W}
              y2={(H / 6) * i}
              stroke="rgba(148,163,184,0.12)"
              strokeWidth={1}
            />
          ))}
          {sorted.map((c, i) => {
            const { x, y } = project(c.lat, c.lng, center, W, H, spanLat, spanLng)
            const r = 10 + (c.weight / 100) * 22
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={r}
                fill={heatColor(c.weight)}
                stroke="transparent"
              />
            )
          })}
          {/* 预想点位 */}
          {(() => {
            const { x, y } = project(center.lat, center.lng, center, W, H, spanLat, spanLng)
            return (
              <g>
                <circle cx={x} cy={y} r={9} fill="#f43f5e" stroke="#fff" strokeWidth={2} />
                <text x={x + 12} y={y - 10} fill="#fecdd3" fontSize={11} fontWeight={600}>
                  {candidateLabel || '预想点位'}
                </text>
              </g>
            )
          })()}
          {(recommendations ?? []).map((r) => {
            const { x, y } = project(r.location.lat, r.location.lng, center, W, H, spanLat, spanLng)
            return (
              <g key={r.rank}>
                <circle cx={x} cy={y} r={7} fill="#34d399" stroke="#ecfdf5" strokeWidth={2} />
                <text x={x + 10} y={y + 4} fill="#a7f3d0" fontSize={10} fontWeight={600}>
                  荐{r.rank}·{r.score}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
