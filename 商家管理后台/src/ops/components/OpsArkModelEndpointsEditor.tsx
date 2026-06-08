import { useMemo, useState } from 'react'
import {
  catalogEndpointsCsv,
  filterCatalog,
  mergeCatalogIntoCsv,
  parseEndpointsCsv,
  type ArkCatalogEntry,
} from '../../meooRegistryShared/arkModelCatalogShared'
import { cn } from '../../cn'

type Props = {
  label: string
  hint: string
  placeholder: string
  catalog: readonly ArkCatalogEntry[]
  value: string
  onChange: (next: string) => void
  editing: boolean
  disabled?: boolean
}

export default function OpsArkModelEndpointsEditor({
  label,
  hint,
  placeholder,
  catalog,
  value,
  onChange,
  editing,
  disabled,
}: Props) {
  const [filter, setFilter] = useState('')
  const parsed = useMemo(() => parseEndpointsCsv(value), [value])
  const filtered = useMemo(() => filterCatalog(catalog, filter), [catalog, filter])

  function fillAll() {
    onChange(catalogEndpointsCsv(catalog))
  }

  function mergeAll() {
    onChange(mergeCatalogIntoCsv(value, catalog))
  }

  function toggleModel(entry: ArkCatalogEntry, checked: boolean) {
    const ids = new Set(parsed.map((p) => p.modelId))
    if (checked) ids.add(entry.modelId)
    else ids.delete(entry.modelId)
    const rows = catalog.filter((e) => ids.has(e.modelId))
    onChange(catalogEndpointsCsv(rows))
  }

  return (
    <div className="md:col-span-2 space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label className="block text-xs text-slate-400">{label}</label>
        {editing ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={fillAll}
              className="rounded-md border border-indigo-600/50 bg-indigo-600/10 px-2.5 py-1 text-[11px] text-indigo-300 hover:bg-indigo-600/20 disabled:opacity-50"
            >
              一键填入全部（{catalog.length}）
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={mergeAll}
              className="rounded-md border border-slate-600 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            >
              合并内置目录
            </button>
          </div>
        ) : null}
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">{hint}</p>

      {editing ? (
        <>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="筛选模型名称 / ID / 类型…"
            disabled={disabled}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600"
          />
          <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/80 p-2">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-slate-500">无匹配模型</p>
            ) : (
              <ul className="space-y-1">
                {filtered.map((e) => {
                  const checked = parsed.some((p) => p.modelId === e.modelId)
                  return (
                    <li key={e.modelId}>
                      <label className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 hover:bg-slate-900">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={(ev) => toggleModel(e, ev.target.checked)}
                          className="mt-0.5 rounded border-slate-600"
                        />
                        <span className="min-w-0 flex-1 text-xs">
                          <span className="font-medium text-slate-200">{e.label}</span>
                          <span className="mt-0.5 block font-mono text-[10px] text-slate-500">{e.modelId}</span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}

      <textarea
        spellCheck={false}
        rows={editing ? 3 : 2}
        readOnly={!editing}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 placeholder:text-slate-600',
          !editing && 'cursor-default opacity-80',
        )}
      />
      <p className="text-[10px] text-slate-600">
        已选 {parsed.length} 个 · 格式「显示名|模型ID或 ep-xxxx」，英文逗号分隔。额度不足时 ERP 会按此列表顺序自动切换同型模型。
      </p>
    </div>
  )
}
