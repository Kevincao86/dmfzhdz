import { setupRegionState } from '../../lib/mpSync/regionPicker'

type Props = {
  province: string
  city: string
  onChange: (province: string, city: string) => void
}

export default function RegionSelect({ province, city, onChange }: Props) {
  const state = setupRegionState(province, city)
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
