import { setupRegionState } from '../../lib/mpSync/regionPicker'

type Props = {
  province: string
  city: string
  onChange: (province: string, city: string) => void
  compact?: boolean
  /** 嵌入筛选条：无边框，与 orders-page 等工具栏一致 */
  bare?: boolean
}

export default function HallCityFilter({ province, city, onChange, compact, bare }: Props) {
  const prov = province || '全部'
  const state = prov === '全部' ? null : setupRegionState(prov, city)
  const selectCls = bare
    ? 'orders-page__filter-select min-w-0 flex-1'
    : compact
      ? 'rounded-lg panel-input border px-2 py-1.5 text-sm min-w-[5.5rem]'
      : 'mt-1 w-full rounded-lg panel-input border px-2 py-2 text-sm'

  return (
    <div
      className={`flex flex-wrap gap-2 items-center ${bare ? 'orders-page__region-filter w-full' : ''} ${compact && !bare ? '' : bare ? '' : 'w-full'}`}
    >
      <select
        className={selectCls}
        value={prov}
        onChange={(e) => {
          const next = e.target.value
          if (next === '全部') onChange('全部', '全部')
          else {
            const s = setupRegionState(next, '')
            onChange(s.province, s.city || '全部')
          }
        }}
      >
        <option value="全部">{bare ? '省份' : '全部省份'}</option>
        {setupRegionState('', '').provinces.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
      {state ? (
        <select
          className={selectCls}
          value={city || state.city}
          onChange={(e) => onChange(state.province, e.target.value)}
        >
          <option value="全部">{bare ? '城市' : '全部城市'}</option>
          {state.cities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      ) : null}
    </div>
  )
}
