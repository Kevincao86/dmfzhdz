import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  loadTrainingPayouts,
  markTrainingPayoutsPaid,
  type TrainingPayoutRow,
} from '../opsTrainingReviewApi'
import { parsePayoutCallbackIds, payoutCallbackSummary } from '../payoutCallbackCsv'

const TABS = [
  { id: 'pending', label: '待打款' },
  { id: 'paid', label: '打款成功' },
] as const

function money(n: number) {
  return (Number(n) || 0).toFixed(2)
}

function whenText(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function csvCell(value: string) {
  const s = String(value ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function exportPayouts(rows: TrainingPayoutRow[]) {
  const header = ['收款户名', '收款账号', '开户行', '实发金额', '主体', '申请时间', '提现编号', '备注']
  const lines = [header.join(',')]
  rows.forEach((row) => {
    const account = row.bankNo ? `="${row.bankNo}"` : ''
    lines.push(
      [
        row.name,
        account,
        row.bank,
        money(row.net),
        row.kind === 'entity' ? '企业' : '个人',
        whenText(row.createdAt),
        row.id,
        '课时费提现',
      ]
        .map(csvCell)
        .join(','),
    )
  })
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  a.href = url
  a.download = `课时费提现-${stamp.getFullYear()}${p(stamp.getMonth() + 1)}${p(stamp.getDate())}-${p(stamp.getHours())}${p(stamp.getMinutes())}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function OpsTrainingPayoutsPage() {
  const [rows, setRows] = useState<TrainingPayoutRow[]>([])
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('pending')
  const [picked, setPicked] = useState<string[]>([])
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const list = await loadTrainingPayouts()
    setRows(list)
    setPicked([])
  }, [])

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : '加载失败'))
  }, [load])

  const shown = useMemo(() => rows.filter((row) => row.status === tab), [rows, tab])
  const pickedRows = shown.filter((row) => picked.includes(row.id))
  const allChecked = shown.length > 0 && shown.every((row) => picked.includes(row.id))

  function toggle(id: string) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((item) => item !== id) : [...cur, id]))
  }

  function toggleAll() {
    setPicked(allChecked ? [] : shown.map((row) => row.id))
  }

  async function markPaid() {
    const ids = pickedRows.filter((row) => row.status === 'pending').map((row) => row.id)
    if (!ids.length) return
    if (!window.confirm(`确认把 ${ids.length} 笔标为打款成功？请先完成银行转账。`)) return
    setBusy(true)
    setErr('')
    try {
      await markTrainingPayoutsPaid(ids)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '标记失败')
    } finally {
      setBusy(false)
    }
  }

  async function onCallbackFile(file: File) {
    const ids = parsePayoutCallbackIds(await file.text())
    if (!ids.length) {
      setErr('回传文件里没有提现编号')
      return
    }
    setBusy(true)
    setErr('')
    setNotice('')
    try {
      const result = await markTrainingPayoutsPaid(ids)
      setNotice(payoutCallbackSummary(result))
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '回传失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="ops-page-title text-xl font-semibold">课时费提现</h1>
        <p className="ops-muted mt-1 text-sm">
          达人在小程序发起提现后出现在这里。导出名单打款后，按提现编号回传打款记录。回传成功后，这里显示打款成功，达人端显示提现成功。
        </p>
      </div>
      {err ? <p className="ops-hint-warn text-sm">{err}</p> : null}
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((item) => {
          const count = rows.filter((row) => row.status === item.id).length
          return (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? 'rounded-full bg-violet-600 px-3 py-1 text-sm text-white' : 'ops-btn-soft'}
              onClick={() => {
                setTab(item.id)
                setPicked([])
              }}
            >
              {item.label} {count}
            </button>
          )
        })}
        <button type="button" className="ops-btn-soft" disabled={!pickedRows.length} onClick={() => exportPayouts(pickedRows)}>
          导出选中（{pickedRows.length}）
        </button>
        <button
          type="button"
          className="ops-btn-soft"
          disabled={!shown.length}
          onClick={() => exportPayouts(shown)}
        >
          导出当前列表
        </button>
        {tab === 'pending' ? (
          <button type="button" className="ops-btn-soft" disabled={busy || !pickedRows.length} onClick={() => void markPaid()}>
            标记打款成功
          </button>
        ) : null}
        <label className={`ops-btn-soft ${busy ? 'pointer-events-none opacity-60' : ''}`}>
          回传打款记录
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void onCallbackFile(file)
            }}
          />
        </label>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--ops-border)] bg-[var(--ops-panel)]">
        <table className="min-w-full text-left text-sm">
          <thead className="ops-muted border-b border-[var(--ops-border)] text-xs">
            <tr>
              <th className="p-3">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="全选" />
              </th>
              <th className="p-3">收款人</th>
              <th className="p-3">账号</th>
              <th className="p-3">开户行</th>
              <th className="p-3">实发</th>
              <th className="p-3">佣金 / 个税</th>
              <th className="p-3">申请时间</th>
              <th className="p-3">提现编号</th>
              <th className="p-3">状态</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.id} className="border-b border-[var(--ops-border)] last:border-0">
                <td className="p-3">
                  <input type="checkbox" checked={picked.includes(row.id)} onChange={() => toggle(row.id)} aria-label={`选择 ${row.name}`} />
                </td>
                <td className="p-3">
                  <div className="font-medium">{row.name || '未填姓名'}</div>
                  <div className="ops-muted text-xs">{row.kind === 'entity' ? '企业' : '个人'} · {row.orderCount} 笔结算</div>
                </td>
                <td className="p-3 font-mono">{row.bankNo || '—'}</td>
                <td className="p-3">{row.bank || '—'}</td>
                <td className="p-3 font-semibold">¥{money(row.net)}</td>
                <td className="p-3 ops-muted">¥{money(row.commission)} / ¥{money(row.tax)}</td>
                <td className="p-3">
                  <div>{whenText(row.createdAt)}</div>
                  {row.paidAt ? <div className="ops-muted text-xs">打款 {whenText(row.paidAt)}</div> : null}
                </td>
                <td className="p-3 font-mono text-xs">{row.id}</td>
                <td className="p-3">{row.status === 'paid' ? '打款成功' : '待打款'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length ? <p className="ops-muted p-8 text-center text-sm">这一栏还没有提现记录</p> : null}
      </div>
    </div>
  )
}
