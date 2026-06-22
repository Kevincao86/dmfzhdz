import type { ShortVideoScriptRow } from '../lib/shortVideoScriptTable'

type Props = {
  rows: ShortVideoScriptRow[]
  disabled?: boolean
  onChange: (rows: ShortVideoScriptRow[]) => void
}

export default function ShortVideoScriptTableEditor({ rows, disabled, onChange }: Props) {
  const updateRow = (index: number, patch: Partial<ShortVideoScriptRow>) => {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="bg-zinc-50 text-left text-xs font-medium text-zinc-600">
            <th className="px-3 py-2.5 w-[7.5rem]">时间段</th>
            <th className="px-3 py-2.5">画面 / 指令</th>
            <th className="px-3 py-2.5">口播 / 文案</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-zinc-100 align-top">
              <td className="px-2 py-2">
                <input
                  type="text"
                  disabled={disabled}
                  value={row.timeRange}
                  onChange={(e) => updateRow(i, { timeRange: e.target.value })}
                  placeholder="0-10秒"
                  className="w-full rounded-md border border-zinc-300 px-2 py-2 text-xs outline-none ring-orange-600/30 focus-visible:ring-2"
                />
              </td>
              <td className="px-2 py-2">
                <textarea
                  disabled={disabled}
                  value={row.visual}
                  onChange={(e) => updateRow(i, { visual: e.target.value })}
                  placeholder="镜头、人物动作、产品特写、光线与运镜…"
                  rows={3}
                  className="w-full resize-y rounded-md border border-zinc-300 px-2 py-2 text-xs leading-relaxed outline-none ring-orange-600/30 focus-visible:ring-2"
                />
              </td>
              <td className="px-2 py-2">
                <textarea
                  disabled={disabled}
                  value={row.dialogue}
                  onChange={(e) => updateRow(i, { dialogue: e.target.value })}
                  placeholder="该时段观众听到的口播文案…"
                  rows={3}
                  className="w-full resize-y rounded-md border border-zinc-300 px-2 py-2 text-xs leading-relaxed outline-none ring-orange-600/30 focus-visible:ring-2"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
