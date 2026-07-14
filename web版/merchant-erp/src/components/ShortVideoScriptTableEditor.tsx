import { Plus } from 'lucide-react'
import { SCRIPT_ROW_MAX_COUNT, type ShortVideoScriptRow } from '../lib/shortVideoScriptTable'

type Props = {
  rows: ShortVideoScriptRow[]
  disabled?: boolean
  /** 段数较多时压缩行高，配合外层滚动容器 */
  compact?: boolean
  onChange: (rows: ShortVideoScriptRow[]) => void
  /** 展示「添加时间段」按钮（手动编写分镜） */
  onAddRow?: () => void
}

export default function ShortVideoScriptTableEditor({
  rows,
  disabled,
  compact,
  onChange,
  onAddRow,
}: Props) {
  const updateRow = (index: number, patch: Partial<ShortVideoScriptRow>) => {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const textRows = compact ? 1 : 3

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="sticky top-0 z-[1] bg-zinc-50 shadow-[0_1px_0_0_rgb(228_228_231)]">
          <tr className="text-left text-xs font-medium text-zinc-600">
            <th className="w-[7.5rem] px-3 py-2.5">时间段</th>
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
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-xs outline-none ring-orange-600/30 focus-visible:ring-2"
                />
              </td>
              <td className="px-2 py-2">
                <textarea
                  disabled={disabled}
                  value={row.visual}
                  onChange={(e) => updateRow(i, { visual: e.target.value })}
                  placeholder="镜头、人物动作、产品特写、光线与运镜…"
                  rows={textRows}
                  className="w-full resize-y rounded-md border border-zinc-300 px-2 py-1.5 text-xs leading-relaxed outline-none ring-orange-600/30 focus-visible:ring-2"
                />
              </td>
              <td className="px-2 py-2">
                <textarea
                  disabled={disabled}
                  value={row.dialogue}
                  onChange={(e) => updateRow(i, { dialogue: e.target.value })}
                  placeholder="该时段观众听到的口播文案…"
                  rows={textRows}
                  className="w-full resize-y rounded-md border border-zinc-300 px-2 py-1.5 text-xs leading-relaxed outline-none ring-orange-600/30 focus-visible:ring-2"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {onAddRow ? (
        <div className="border-t border-zinc-100 bg-zinc-50/80 px-3 py-2">
          <button
            type="button"
            disabled={disabled || rows.length >= SCRIPT_ROW_MAX_COUNT}
            onClick={onAddRow}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            添加时间段
          </button>
        </div>
      ) : null}
    </div>
  )
}
