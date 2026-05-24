import type { AiAgentExecutionResult } from '../lib/aiAgentTypes'

export function AiAgentExecutionResultCard({ result }: { result: AiAgentExecutionResult }) {
  return (
    <div className="mt-3 rounded-xl border border-slate-200/90 bg-white/90 p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">{result.title}</p>
      <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">
        {result.summary}
      </p>

      {result.kind === 'competitor_report' && result.competitors?.length ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-slate-600">周边竞品（{result.competitors.length}）</p>
          <ul className="max-h-48 space-y-2 overflow-y-auto text-xs text-slate-700">
            {result.competitors.slice(0, 8).map((c, i) => (
              <li
                key={`${c.name}-${i}`}
                className="rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2"
              >
                <span className="font-medium text-slate-900">{c.name}</span>
                {c.distanceHint ? (
                  <span className="ml-1 text-slate-500">· {c.distanceHint}</span>
                ) : null}
                {c.category ? <p className="mt-0.5 text-slate-500">{c.category}</p> : null}
                {c.highlights ? <p className="mt-0.5 text-slate-600">{c.highlights}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.suggestions?.length ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-indigo-800">经营建议</p>
          <ul className="mt-1 list-inside list-disc text-xs text-indigo-900/90">
            {result.suggestions.slice(0, 5).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.stepsDone?.length ? (
        <ol className="mt-3 space-y-1 border-l-2 border-emerald-200 pl-3 text-xs text-slate-600">
          {result.stepsDone.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      ) : null}

      {result.syncCount != null ? (
        <p className="mt-2 text-xs text-emerald-700">共同步 {result.syncCount} 个商品至本地库</p>
      ) : null}
    </div>
  )
}
