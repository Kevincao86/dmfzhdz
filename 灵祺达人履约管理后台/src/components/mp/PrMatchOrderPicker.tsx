import { useMemo, useState } from 'react'
import {
  filterPrMatchOrderOptions,
  type PrMatchOrderOption,
} from '../../lib/mpRecruitment/prMatchOrderSelect'

type Props = {
  value: string
  options: PrMatchOrderOption[]
  onChange: (id: string) => void
  label?: string
}

export default function PrMatchOrderPicker({ value, options, onChange, label = '匹配招募单' }: Props) {
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const selected = options.find((o) => o.id === value) || options[0]
  const filtered = useMemo(() => filterPrMatchOrderOptions(options, keyword), [options, keyword])

  function close() {
    setOpen(false)
    setKeyword('')
  }

  function pick(id: string) {
    onChange(id)
    close()
  }

  if (!options.length) return null

  return (
    <>
      <div className="hall-field-row">
        <span className="hall-field-label">{label}</span>
        <button type="button" className="hall-picker-trigger" onClick={() => setOpen(true)}>
          <span className="truncate">{selected?.label || '请选择招募单'}</span>
          <span className="hall-picker-caret" aria-hidden>
            ▼
          </span>
        </button>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--panel-overlay)] p-4"
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-2xl panel-card p-4 max-h-[min(80vh,28rem)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-medium text-[var(--shell-text)] mb-2">选择招募单</p>
            <input
              className="w-full rounded-lg panel-input border px-3 py-2 text-sm mb-3"
              placeholder="搜索招募标题、单号"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              autoFocus
            />
            <div className="overflow-auto flex-1 min-h-0 border border-[var(--shell-border)] rounded-lg">
              {filtered.length ? (
                filtered.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`block w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-violet-500/10 ${
                      o.id === value ? 'bg-violet-500/20 font-medium text-[var(--shell-text)]' : 'text-[var(--shell-text)]'
                    }`}
                    onClick={() => pick(o.id)}
                  >
                    {o.label}
                    {o.title && o.title !== o.label ? (
                      <span className="block text-xs text-[var(--shell-muted)] mt-0.5 truncate">{o.title}</span>
                    ) : null}
                  </button>
                ))
              ) : (
                <p className="px-3 py-4 text-sm text-[var(--shell-muted)]">暂无匹配招募单</p>
              )}
            </div>
            <button
              type="button"
              className="mt-3 w-full py-2 rounded-lg border border-[var(--shell-border)] text-sm"
              onClick={close}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
