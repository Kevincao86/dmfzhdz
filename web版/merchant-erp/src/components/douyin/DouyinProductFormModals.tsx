import { useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import {
  DOUYIN_COMMON_HOLIDAYS,
  DOUYIN_WEEKDAY_LABELS,
  type DouyinTimePeriod,
  type DouyinWeekdayKey,
} from '../../lib/douyinProductRuleText'

function ModalFrame({
  open,
  title,
  onClose,
  onConfirm,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  onConfirm: () => void
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-gray-100" aria-label="关闭">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        {children}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}

export function SalePeriodModal({
  open,
  onClose,
  saleStart,
  saleEnd,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  saleStart: string
  saleEnd: string
  onConfirm: (start: string, end: string) => void
}) {
  const [start, setStart] = useState(saleStart)
  const [end, setEnd] = useState(saleEnd)
  useEffect(() => {
    if (open) {
      setStart(saleStart)
      setEnd(saleEnd)
    }
  }, [open, saleStart, saleEnd])
  return (
    <ModalFrame open={open} title="选择售卖时间段" onClose={onClose} onConfirm={() => onConfirm(start, end)}>
      <label className="block text-sm">
        开始时间
        <input
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="mt-1 w-full rounded-lg border px-3 py-2"
        />
      </label>
      <label className="mt-3 block text-sm">
        结束时间
        <input
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="mt-1 w-full rounded-lg border px-3 py-2"
        />
      </label>
    </ModalFrame>
  )
}

export function NonConsumeDatesModal({
  open,
  onClose,
  weekdays,
  holidays,
  specificDates,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  weekdays: DouyinWeekdayKey[]
  holidays: string[]
  specificDates: string[]
  onConfirm: (w: DouyinWeekdayKey[], h: string[], d: string[]) => void
}) {
  const [w, setW] = useState(weekdays)
  const [h, setH] = useState(holidays)
  const [dates, setDates] = useState(specificDates)
  const [pickDate, setPickDate] = useState('')
  useEffect(() => {
    if (open) {
      setW(weekdays)
      setH(holidays)
      setDates(specificDates)
    }
  }, [open, weekdays, holidays, specificDates])

  const toggleWeek = (k: DouyinWeekdayKey) => {
    setW((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))
  }

  return (
    <ModalFrame
      open={open}
      title="部分日期不可用"
      onClose={onClose}
      onConfirm={() => onConfirm(w, h, dates)}
    >
      <p className="mb-2 text-xs text-gray-500">节假日选项与来客后台常见节日对齐，提交后写入商品说明。</p>
      <p className="text-sm font-medium text-gray-800">每周几不可用</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(Object.keys(DOUYIN_WEEKDAY_LABELS) as DouyinWeekdayKey[]).map((k) => (
          <label key={k} className="flex items-center gap-1 rounded border px-2 py-1 text-xs">
            <input type="checkbox" checked={w.includes(k)} onChange={() => toggleWeek(k)} />
            {DOUYIN_WEEKDAY_LABELS[k]}
          </label>
        ))}
      </div>
      <p className="mt-4 text-sm font-medium text-gray-800">节假日不可用</p>
      <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
        {DOUYIN_COMMON_HOLIDAYS.map((hol) => (
          <label key={hol.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={h.includes(hol.id)}
              onChange={() =>
                setH((prev) =>
                  prev.includes(hol.id) ? prev.filter((x) => x !== hol.id) : [...prev, hol.id],
                )
              }
            />
            {hol.label}
          </label>
        ))}
      </div>
      <p className="mt-4 text-sm font-medium text-gray-800">指定某天不可用（可多选）</p>
      <div className="mt-2 flex gap-2">
        <input
          type="date"
          value={pickDate}
          onChange={(e) => setPickDate(e.target.value)}
          className="flex-1 rounded-lg border px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          className="rounded-lg border px-3 py-1.5 text-sm"
          onClick={() => {
            if (!pickDate || dates.includes(pickDate)) return
            setDates((prev) => [...prev, pickDate].sort())
            setPickDate('')
          }}
        >
          添加
        </button>
      </div>
      {dates.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-gray-700">
          {dates.map((d) => (
            <li key={d} className="flex items-center justify-between rounded bg-gray-50 px-2 py-1">
              {d}
              <button type="button" className="text-red-600" onClick={() => setDates((p) => p.filter((x) => x !== d))}>
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
    </ModalFrame>
  )
}

export function TimePeriodsModal({
  open,
  onClose,
  periods,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  periods: DouyinTimePeriod[]
  onConfirm: (p: DouyinTimePeriod[]) => void
}) {
  const [list, setList] = useState(periods)
  useEffect(() => {
    if (open) setList(periods.length ? periods : [{ start: '09:00', end: '22:00' }])
  }, [open, periods])

  return (
    <ModalFrame open={open} title="每日可用时段" onClose={onClose} onConfirm={() => onConfirm(list)}>
      {list.map((p, i) => (
        <div key={i} className="mb-2 flex items-center gap-2 text-sm">
          <input
            type="time"
            value={p.start}
            onChange={(e) => {
              const next = [...list]
              next[i] = { ...next[i]!, start: e.target.value }
              setList(next)
            }}
            className="rounded border px-2 py-1"
          />
          <span>至</span>
          <input
            type="time"
            value={p.end}
            onChange={(e) => {
              const next = [...list]
              next[i] = { ...next[i]!, end: e.target.value }
              setList(next)
            }}
            className="rounded border px-2 py-1"
          />
          <button
            type="button"
            className="text-xs text-red-600"
            onClick={() => setList((prev) => prev.filter((_, j) => j !== i))}
          >
            删除
          </button>
        </div>
      ))}
      <button
        type="button"
        className="mt-2 text-sm text-indigo-600"
        onClick={() => setList((prev) => [...prev, { start: '09:00', end: '22:00' }])}
      >
        + 添加时段
      </button>
    </ModalFrame>
  )
}

export function PurchaseLimitModal({
  open,
  onClose,
  perPerson,
  perDay,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  perPerson: number
  perDay: number
  onConfirm: (perPerson: number, perDay: number) => void
}) {
  const [pp, setPp] = useState(perPerson)
  const [pd, setPd] = useState(perDay)
  const [usePp, setUsePp] = useState(perPerson > 0)
  const [usePd, setUsePd] = useState(perDay > 0)
  useEffect(() => {
    if (open) {
      setPp(perPerson)
      setPd(perDay)
      setUsePp(perPerson > 0)
      setUsePd(perDay > 0)
    }
  }, [open, perPerson, perDay])

  return (
    <ModalFrame
      open={open}
      title="限制购买"
      onClose={onClose}
      onConfirm={() => onConfirm(usePp ? pp : 0, usePd ? pd : 0)}
    >
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={usePp} onChange={(e) => setUsePp(e.target.checked)} />
        每人最多购买
        <input
          type="number"
          min={1}
          disabled={!usePp}
          value={pp || ''}
          onChange={(e) => setPp(Number(e.target.value) || 0)}
          className="w-20 rounded border px-2 py-1"
        />
        份
      </label>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={usePd} onChange={(e) => setUsePd(e.target.checked)} />
        每人每天最多购买
        <input
          type="number"
          min={1}
          disabled={!usePd}
          value={pd || ''}
          onChange={(e) => setPd(Number(e.target.value) || 0)}
          className="w-20 rounded border px-2 py-1"
        />
        份
      </label>
    </ModalFrame>
  )
}

export function ReserveAdvanceModal({
  open,
  onClose,
  days,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  days: number
  onConfirm: (days: number) => void
}) {
  const [d, setD] = useState(days)
  useEffect(() => {
    if (open) setD(days)
  }, [open, days])
  return (
    <ModalFrame open={open} title="预约规则" onClose={onClose} onConfirm={() => onConfirm(d)}>
      <p className="text-sm text-gray-600">需提前</p>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={30}
          value={d}
          onChange={(e) => setD(Math.max(1, Number(e.target.value) || 1))}
          className="w-20 rounded-lg border px-2 py-2 text-sm"
        />
        <span className="text-sm">天电话预约</span>
      </div>
    </ModalFrame>
  )
}

export function VoucherUseLimitModal({
  open,
  onClose,
  max,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  max: number
  onConfirm: (max: number) => void
}) {
  const [n, setN] = useState(max)
  useEffect(() => {
    if (open) setN(max)
  }, [open, max])
  return (
    <ModalFrame open={open} title="限制使用张数" onClose={onClose} onConfirm={() => onConfirm(n)}>
      <label className="block text-sm">
        每次消费最多使用
        <input
          type="number"
          min={1}
          value={n}
          onChange={(e) => setN(Math.max(1, Number(e.target.value) || 1))}
          className="ml-2 w-20 rounded-lg border px-2 py-1"
        />
        张
      </label>
    </ModalFrame>
  )
}
