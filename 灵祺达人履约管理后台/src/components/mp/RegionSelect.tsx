import { useEffect } from 'react'
import { setupRegionState } from '../../lib/mpSync/regionPicker'

type Props = {
  province: string
  city: string
  onChange: (province: string, city: string) => void
}

export default function RegionSelect({ province, city, onChange }: Props) {
  const state = setupRegionState(province, city)

  /** 下拉默认展示首项省市，但父级 state 可能仍为空，导致保存校验「请选择省份」 */
  useEffect(() => {
    const resolved = setupRegionState(province, city)
    const provEmpty = !String(province || '').trim()
    const cityEmpty = !String(city || '').trim()
    if (
      (provEmpty || cityEmpty) &&
      resolved.province &&
      resolved.city &&
      (resolved.province !== province || resolved.city !== city)
    ) {
      onChange(resolved.province, resolved.city)
    }
  }, [province, city, onChange])
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block text-sm">
        <span className="text-slate-400">省份</span>
        <select
          className="mt-1 w-full rounded-lg panel-input border px-2 py-2"
          value={state.province}
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
