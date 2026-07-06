import { useMemo, useState } from 'react'
import {
  buildRegionFromCityState,
  formatRecruitmentCityDisplay,
  initCityPickerState,
} from '@merchant/lib/recruitmentCityPicker'

type Props = {
  cityNational: boolean
  selectedCities: string[]
  onChange: (patch: { cityNational: boolean; selectedCities: string[]; region: string }) => void
}

export default function FormRelayCityPicker({ cityNational, selectedCities, onChange }: Props) {
  const [keyword, setKeyword] = useState('')
  const [activeProvince, setActiveProvince] = useState('')

  const { provinceRows, cityCheckGrid } = useMemo(
    () => initCityPickerState(keyword, activeProvince, selectedCities),
    [keyword, activeProvince, selectedCities],
  )

  const display = formatRecruitmentCityDisplay(cityNational, selectedCities)

  function emit(nextNational: boolean, nextCities: string[]) {
    onChange({
      cityNational: nextNational,
      selectedCities: nextCities,
      region: buildRegionFromCityState(nextNational, nextCities),
    })
  }

  return (
    <div className="form-relay-city-picker">
      <p className="form-relay-field__label">招募城市</p>
      <p className="form-relay-city-picker__value">{display}</p>
      <p className="form-relay-muted">可多选城市；选「全国」则不限地域（与发招募单一致）</p>
      <button
        type="button"
        className={`form-relay-city-picker__national ${cityNational ? 'is-on' : ''}`}
        onClick={() => emit(true, [])}
      >
        全国
      </button>
      <input
        className="form-relay-field__input"
        placeholder="搜索省、市"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />
      <div className="form-relay-city-picker__dual">
        <div className="form-relay-city-picker__provinces">
          {provinceRows.map((p) => (
            <button
              key={p.name}
              type="button"
              className={p.active ? 'is-on' : ''}
              onClick={() => setActiveProvince(p.name)}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="form-relay-city-picker__cities">
          {cityCheckGrid.map((c) => (
            <button
              key={c.name}
              type="button"
              className="form-relay-city-picker__city-row"
              onClick={() => {
                const cities = [...selectedCities]
                const idx = cities.indexOf(c.name)
                if (idx >= 0) cities.splice(idx, 1)
                else cities.push(c.name)
                emit(false, cities)
              }}
            >
              <span className={`form-relay-city-picker__check ${c.on ? 'is-on' : ''}`}>{c.on ? '✓' : ''}</span>
              {c.name}
            </button>
          ))}
        </div>
      </div>
      {selectedCities.length ? (
        <div className="form-relay-city-picker__chips">
          {selectedCities.map((c) => (
            <span key={c} className="form-relay-city-picker__chip">
              {c}
              <button
                type="button"
                aria-label={`移除${c}`}
                onClick={() => emit(false, selectedCities.filter((x) => x !== c))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
