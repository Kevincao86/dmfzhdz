type Dim = { key: string; label: string; score: number; note: string }

export default function SiteSelectionScoreCard({
  overall,
  verdict,
  dimensions,
  scoreStory,
  brandUnderstanding,
}: {
  overall: number
  verdict: string
  dimensions: Dim[]
  scoreStory?: string
  brandUnderstanding?: string
}) {
  const ring = Math.min(100, Math.max(0, overall))
  const storyParas = (scoreStory || '')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)

  return (
    <div className="overflow-hidden rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/90 via-white to-sky-50/50 shadow-sm">
      <div className="grid gap-5 p-5 lg:grid-cols-[200px_1fr]">
        <div className="flex flex-col items-center justify-center rounded-xl border border-emerald-100 bg-white/80 px-4 py-5">
          <div
            className="relative flex h-36 w-36 items-center justify-center rounded-full"
            style={{
              background: `conic-gradient(#059669 ${ring * 3.6}deg, #e2e8f0 0deg)`,
            }}
          >
            <div className="flex h-[7.25rem] w-[7.25rem] flex-col items-center justify-center rounded-full bg-white">
              <span className="text-3xl font-semibold tabular-nums text-emerald-900">{overall}</span>
              <span className="text-[11px] text-emerald-700/80">综合分 /100</span>
            </div>
          </div>
          <p className="mt-3 text-sm font-medium text-emerald-800">结论 · {verdict}</p>
        </div>

        <div className="space-y-4">
          {brandUnderstanding ? (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                AI 品牌属性理解
              </p>
              <p className="mt-1 text-sm leading-relaxed text-indigo-950/90">{brandUnderstanding}</p>
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              图文综合评估
            </p>
            {storyParas.length ? (
              <div className="space-y-2">
                {storyParas.map((p, i) => (
                  <p
                    key={i}
                    className="rounded-lg border border-white/80 bg-white/70 px-3 py-2 text-sm leading-relaxed text-gray-800 shadow-sm"
                  >
                    {p}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">暂无图文评估</p>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {dimensions.map((d) => (
              <div key={d.key} className="rounded-lg border border-emerald-100/80 bg-white/80 px-3 py-2">
                <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-gray-800">{d.label}</span>
                  <span className="tabular-nums text-emerald-800">{d.score}</span>
                </div>
                <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500/80"
                    style={{ width: `${Math.max(6, Math.min(100, d.score))}%` }}
                  />
                </div>
                <p className="text-[11px] text-gray-500">{d.note}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
