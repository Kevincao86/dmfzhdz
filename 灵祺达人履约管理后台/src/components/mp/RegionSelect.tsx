import { useEffect, useRef } from 'react'
import { setupRegionState } from '../../lib/mpSync/regionPicker'

type Props = {
  province: string
  city: string
  onChange: (province: string, city: string) => void
  /** 首次空值补默认省市，不视作用户编辑 */
  onDefaultFill?: (province: string, city: string) => void
  onFocus?: () => void
}

export default function RegionSelect({ province, city, onChange, onDefaultFill, onFocus }: Props) {
  const state = setupRegionState(province, city)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const defaultAppliedRef = useRef(false)

  /** 下拉默认展示首项省市，但父级 state 可能仍为空，导致保存校验「请选择省份」；仅首次补全，避免 onChange 引用变化反复触发 */
  useEffect(() => {
    if (defaultAppliedRef.current) return
    const resolved = setupRegionState(province, city)
    const provEmpty = !String(province || '').trim()
    const cityEmpty = !String(city || '').trim()
    if (
      (provEmpty || cityEmpty) &&
      resolved.province &&
      resolved.city &&
      (resolved.province !== province || resolved.city !== city)
    ) {
      defaultAppliedRef.current = true
      const fill = onDefaultFill || onChangeRef.current
      fill(resolved.province, resolved.city)
    }
  }, [province, city, onDefaultFill])
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block text-sm">
        <span className="text-slate-400">省份</span>
        <select
          className="mt-1 w-full rounded-lg panel-input border px-2 py-2"
          value={state.province}
          onFocus={onFocus}
          onChange={(e) => {
            const next = setupRegionState(e.target.value, '')
            onChange(next.province, next.city)
          }}
        >
          {state.provinces.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-slate-400">城市</span>
        <select
          className="mt-1 w-full rounded-lg panel-input border px-2 py-2"
          value={state.city}
          onFocus={onFocus}
          onChange={(e) => onChange(state.province, e.target.value)}
        >
          {state.cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
