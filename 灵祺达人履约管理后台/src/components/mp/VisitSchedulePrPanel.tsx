import { useEffect, useMemo, useState } from 'react'
import { clearMpRegistryCache } from '../../lib/mpApi'
import {
  generateAiVisitSchedule,
  setVisitSchedule,
  type VisitScheduleRow,
} from '../../lib/mpSync/visitScheduleRuntime'

type Props = {
  mpOrderId: string
  storeName: string
  category: string
  orderTitle?: string
  selectedApplicants: Record<string, unknown>[]
  onSaved: () => void
}

function applicantName(a: Record<string, unknown>): string {
  return String(a.platformNickname || a.name || a.platformAccount || a.id || '').trim()
}

export default function VisitSchedulePrPanel({ mpOrderId, storeName, category, orderTitle, selectedApplicants, onSaved }: Props) {
  const [mode, setMode] = useState<'manual' | 'ai'>('manual')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [visitSlots, setVisitSlots] = useState('09:00-12:00,14:00-17:00,17:00-20:00')
  const [shareTable, setShareTable] = useState(true)
  const [mealCount, setMealCount] = useState(1)
  const [tableSize, setTableSize] = useState(4)
  const [manualRows, setManualRows] = useState<VisitScheduleRow[]>([])

  const pool = useMemo(
    () => (selectedApplicants || []).filter((a) => a && a.id),
    [selectedApplicants],
  )

  useEffect(() => {
    if (!pool.length) return
    setManualRows(
      pool.map((a) => ({
        applicantId: String(a.id),
        time: String(a.assignedVisitAt || ''),
        storeName: storeName || String(a.assignedVisitStore || '门店'),
        tableNote: String(a.tableNote || (shareTable ? `拼桌 ${tableSize} 人/桌` : '单独探店')),
      })),
    )
  }, [pool, storeName, shareTable, tableSize])

  async function saveSchedule(rows: VisitScheduleRow[], assignMode: 'manual' | 'ai') {
    if (!mpOrderId || !rows.length) {
      setErr('请先填写排期')
      return
    }
    setBusy(true)
    setErr('')
    try {
      await setVisitSchedule(mpOrderId, {
        mode: assignMode,
        rows: assignMode === 'manual' ? rows : undefined,
        aiRows: assignMode === 'ai' ? rows.map((r) => {
          const hit = pool.find((a) => String(a.id) === r.applicantId)
          return {
            time: r.time,
            talentName: hit ? applicantName(hit) : r.applicantId,
            storeName: r.storeName,
            tableNote: r.tableNote,
          }
        }) : undefined,
        visitSlots: visitSlots.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
        category,
        shareTable,
        mealCount,
        tableSize,
        storeName,
        notify: true,
      })
      clearMpRegistryCache()
      onSaved()
      window.alert('探店排期已下发，订单已移入「待视频审核」，达人将收到站内信确认')
    } catch (e) {
      setErr(e instanceof Error ? e.message : '排期失败')
    } finally {
      setBusy(false)
    }
  }

  async function runAiSchedule() {
    const slots = visitSlots.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
    setBusy(true)
    setErr('')
    try {
      const { rows, source } = await generateAiVisitSchedule(pool, {
        visitSlots: slots,
        storeName,
        shareTable,
        mealCount,
        tableSize,
        category,
        title: orderTitle,
      })
      if (!rows.length) {
        setErr('无已选达人可排期')
        return
      }
      await saveSchedule(rows, 'ai')
      if (source === 'rule') {
        window.alert('AI 模型暂不可用，已使用规则引擎生成排期并下发')
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'AI 排期失败')
    } finally {
      setBusy(false)
    }
  }

  if (!pool.length) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-900">
        请先「确认选择」并「通知已选达人」，达人确认档期后再进行探店排期。
      </div>
    )
  }

  return (
    <section className="rounded-xl border border-[var(--shell-border)] bg-[var(--shell-surface)] p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-medium">探店排期</h3>
          <p className="text-xs text-[var(--shell-muted)] mt-1">
            达人确认档期后，可手动排期或使用 AI 智能排期（含拼桌），下发后达人需二次确认。
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg border ${mode === 'manual' ? 'bg-violet-600 text-white border-violet-600' : ''}`}
            onClick={() => setMode('manual')}
          >
            手动排期
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg border ${mode === 'ai' ? 'bg-violet-600 text-white border-violet-600' : ''}`}
            onClick={() => setMode('ai')}
          >
            AI 智能排期
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <label className="block">
          <span className="text-[var(--shell-muted)]">可探店时段</span>
          <input
            className="mt-1 w-full rounded-lg border px-2 py-1.5 panel-input"
            value={visitSlots}
            onChange={(e) => setVisitSlots(e.target.value)}
            placeholder="09:00-12:00,17:00-20:00"
          />
        </label>
        <label className="block">
          <span className="text-[var(--shell-muted)]">类目</span>
          <input className="mt-1 w-full rounded-lg border px-2 py-1.5 panel-input" value={category} readOnly />
        </label>
        <label className="block">
          <span className="text-[var(--shell-muted)]">餐食份数</span>
          <input
            type="number"
            min={0}
            className="mt-1 w-full rounded-lg border px-2 py-1.5 panel-input"
            value={mealCount}
            onChange={(e) => setMealCount(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <label className="block">
          <span className="text-[var(--shell-muted)]">每桌人数</span>
          <input
            type="number"
            min={1}
            className="mt-1 w-full rounded-lg border px-2 py-1.5 panel-input"
            value={tableSize}
            onChange={(e) => setTableSize(Math.max(1, Number(e.target.value) || 4))}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={shareTable} onChange={(e) => setShareTable(e.target.checked)} />
        餐饮拼桌（多人一桌）
      </label>

      {mode === 'manual' ? (
        <div className="space-y-2">
          {manualRows.map((row, idx) => {
            const a = pool.find((x) => String(x.id) === row.applicantId)
            return (
              <div key={row.applicantId} className="grid gap-2 sm:grid-cols-4 items-center rounded-lg border p-3 text-sm">
                <span className="font-medium truncate">{a ? applicantName(a) : row.applicantId}</span>
                <input
                  className="rounded-lg border px-2 py-1.5 panel-input"
                  placeholder="2026/6/15 17:00-20:00"
                  value={row.time}
                  onChange={(e) => {
                    const next = [...manualRows]
                    next[idx] = { ...next[idx], time: e.target.value }
                    setManualRows(next)
                  }}
                />
                <input
                  className="rounded-lg border px-2 py-1.5 panel-input"
                  value={row.storeName || ''}
                  onChange={(e) => {
                    const next = [...manualRows]
                    next[idx] = { ...next[idx], storeName: e.target.value }
                    setManualRows(next)
                  }}
                />
                <input
                  className="rounded-lg border px-2 py-1.5 panel-input"
                  placeholder="拼桌备注"
                  value={row.tableNote || ''}
                  onChange={(e) => {
                    const next = [...manualRows]
                    next[idx] = { ...next[idx], tableNote: e.target.value }
                    setManualRows(next)
                  }}
                />
              </div>
            )
          })}
          <button
            type="button"
            disabled={busy}
            className="btn-mockup btn-mockup--primary"
            onClick={() => void saveSchedule(manualRows.filter((r) => r.time.trim()), 'manual')}
          >
            {busy ? '下发中…' : '确认手动排期并通知达人'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-[var(--shell-muted)]">
            AI 将调用豆包/通义等模型，按粉丝量、报名偏好时段与拼桌设置生成排期；模型不可用时自动回退规则引擎。
          </p>
          <button
            type="button"
            disabled={busy}
            className="btn-mockup btn-mockup--primary"
            onClick={() => void runAiSchedule()}
          >
            {busy ? '生成中…' : 'AI 智能排期并通知达人'}
          </button>
        </div>
      )}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
    </section>
  )
}
