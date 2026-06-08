import { ChevronDown, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '../../cn'
import { formatRecruitmentCityDisplay, initCityPickerState } from '../../lib/recruitmentCityPicker'
import ModalPortal from '../ui/ModalPortal'

export type RecruitmentCityValue = {
  cityNational: boolean
  selectedCities: string[]
}

type Props = {
  open: boolean
  value: RecruitmentCityValue
  onClose: () => void
  onConfirm: (next: RecruitmentCityValue) => void
}

export default function RecruitmentCityPickerModal({ open, value, onClose, onConfirm }: Props) {
  const wasOpenRef = useRef(false)
  const [draft, setDraft] = useState<RecruitmentCityValue>(value)
  const [keyword, setKeyword] = useState('')
  const [activeProvince, setActiveProvince] = useState('')
  const [provinceRows, setProvinceRows] = useState<{ name: string; active: boolean }[]>([])
  const [cityCheckGrid, setCityCheckGrid] = useState<{ name: string; on: boolean }[]>([])
  const [err, setErr] = useState('')

  const refreshUi = useCallback(
    (kw: string, provinceHint: string, selectedCities: string[]) => {
      const st = initCityPickerState(kw, provinceHint, selectedCities)
      setActiveProvince(st.activeProvince)
      setProvinceRows(st.provinceRows)
      setCityCheckGrid(st.cityCheckGrid)
    },
    [],
  )

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current
    wasOpenRef.current = open
    if (!open) return
    if (justOpened) {
      setDraft(value)
      setKeyword('')
      setErr('')
      refreshUi('', '', value.selectedCities)
    }
  }, [open, refreshUi, value])

  useEffect(() => {
    if (!open) return
    refreshUi(keyword, activeProvince, draft.selectedCities)
  }, [keyword, open, refreshUi, activeProvince, draft.selectedCities])

  function toggleCity(name: string) {
    setDraft((prev) => {
      const cities = [...prev.selectedCities]
      const idx = cities.indexOf(name)
      if (idx >= 0) cities.splice(idx, 1)
      else cities.push(name)
      return { cityNational: false, selectedCities: cities }
    })
    setErr('')
  }

  function confirm() {
    if (!draft.cityNational && !draft.selectedCities.length) {
      setErr('请选择全国或添加城市')
      return
    }
    onConfirm(draft)
    onClose()
  }

  return (
    <ModalPortal open={open}>
      <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-3 sm:items-center sm:p-6">
        <div
          className="flex w-full max-w-lg max-h-[min(88vh,720px)] flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recruitment-city-picker-title"
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
            <h3 id="recruitment-city-picker-title" className="text-[15px] font-semibold text-gray-900">
              招募城市
            </h3>
            <button type="button" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" onClick={onClose}>
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
            <p className="mb-3 text-xs text-gray-500">可多选城市；选「全国」则不限地域（与星选 PR 招募表单一致）</p>
            <button
              type="button"
              className={cn(
                'mb-3 w-full rounded-lg py-2 text-sm font-medium transition-colors',
                draft.cityNational ? 'bg-violet-600 text-white' : 'border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100',
              )}
              onClick={() => {
                setDraft({ cityNational: true, selectedCities: [] })
                setErr('')
              }}
            >
              全国
            </button>
            <input
              className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
              placeholder="搜索省、市"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <div className="grid h-52 grid-cols-2 gap-2">
              <div className="overflow-auto rounded-lg border border-gray-200">
                {provinceRows.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    className={cn(
                      'block w-full px-2 py-2 text-left text-sm hover:bg-violet-50',
                      p.active ? 'bg-violet-100 font-medium text-violet-800' : 'text-gray-700',
                    )}
                    onClick={() => refreshUi(keyword, p.name, draft.selectedCities)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              <div className="overflow-auto rounded-lg border border-gray-200">
                {cityCheckGrid.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    className="flex w-full items-center gap-2 px-2 py-2 text-sm text-gray-700 hover:bg-violet-50"
                    onClick={() => toggleCity(c.name)}
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]',
                        c.on ? 'border-violet-600 bg-violet-600 text-white' : 'border-gray-300 bg-white',
                      )}
                    >
                      {c.on ? '✓' : ''}
                    </span>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
            {draft.selectedCities.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {draft.selectedCities.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-xs text-violet-800">
                    {c}
                    <button
                      type="button"
                      className="text-violet-500 hover:text-violet-800"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          selectedCities: prev.selectedCities.filter((x) => x !== c),
                        }))
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            {err ? <p className="mt-3 text-xs text-red-600">{err}</p> : null}
          </div>

          <footer className="shrink-0 border-t border-gray-100 px-4 py-3">
            <button
              type="button"
              className="w-full rounded-xl bg-violet-600 py-2.5 text-sm font-medium text-white hover:bg-violet-500"
              onClick={confirm}
            >
              确认
            </button>
          </footer>
        </div>
      </div>
    </ModalPortal>
  )
}

export function RecruitmentCityField({
  cityNational,
  selectedCities,
  onClick,
}: {
  cityNational: boolean
  selectedCities: string[]
  onClick: () => void
}) {
  const text = formatRecruitmentCityDisplay(cityNational, selectedCities)
  const empty = text === '请选择招募城市'
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors',
        empty ? 'border-gray-300 text-gray-400' : 'border-gray-300 text-gray-900 hover:border-violet-400',
      )}
    >
      <span className="truncate">{text}</span>
      <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
    </button>
  )
}
