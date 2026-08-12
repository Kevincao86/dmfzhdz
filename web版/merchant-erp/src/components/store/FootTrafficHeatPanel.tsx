import type { CompetitorFootTrafficHeat } from '../../lib/competitorStorage'

function barColor(index: number): string {
  if (index >= 75) return 'bg-rose-500'
  if (index >= 55) return 'bg-amber-500'
  if (index >= 35) return 'bg-sky-500'
  return 'bg-slate-300'
}

export default function FootTrafficHeatPanel({
  heat,
  compact,
}: {
  heat: CompetitorFootTrafficHeat
  compact?: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            近 7 日人流热度
          </h3>
          {!compact ? (
            <p className="mt-1 text-xs text-amber-800/90">{heat.disclaimer}</p>
          ) : null}
        </div>
      </div>
      <p className="text-sm leading-relaxed text-gray-800">{heat.insight}</p>
      {heat.drivers?.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {heat.drivers.map((d) => (
            <li
              key={d}
              className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700"
            >
              {d}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-1.5 pr-3 font-medium">日期</th>
              <th className="py-1.5 pr-3 font-medium">日均</th>
              <th className="py-1.5 pr-2 font-medium">早</th>
              <th className="py-1.5 pr-2 font-medium">午</th>
              <th className="py-1.5 pr-2 font-medium">晚</th>
              <th className="py-1.5 font-medium">夜</th>
            </tr>
          </thead>
          <tbody>
            {heat.days.map((day) => (
              <tr key={day.date} className="border-b border-gray-50">
                <td className="py-2 pr-3 text-gray-800">
                  {day.date.slice(5)} · {day.weekday}
                </td>
                <td className="py-2 pr-3 font-medium text-gray-900">{day.avgIndex}</td>
                {day.slots.map((s) => (
                  <td key={s.key} className="py-2 pr-2">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-10 overflow-hidden rounded bg-slate-100">
                        <div
                          className={`h-full ${barColor(s.index)}`}
                          style={{ width: `${Math.max(8, s.index)}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-gray-700">{s.index}</span>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
