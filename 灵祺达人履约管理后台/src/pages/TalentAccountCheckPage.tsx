import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getWorkIdentity } from '../lib/mpWorkIdentity'
import { postTalentAccountCheck, type TalentCheckStatus, type TalentCheckView } from '../lib/talentAccountCheck'
import './TalentAccountCheckPage.css'

type SheetRow = { douyinId: string; nickname: string; state: '' | 'ok' | 'fail'; note: string }

function promptUpgrade(navigate: (path: string) => void, message?: string) {
  const go = window.confirm(message || '本月免费查验已用完，下月恢复。升级会员后按积分查验，不限次数。')
  if (go) navigate('/profile/membership')
}

function handleGate(navigate: (path: string) => void, data: TalentCheckStatus) {
  if (data.error === 'upgrade_membership') {
    promptUpgrade(navigate, data.message)
    return
  }
  if (data.error === 'insufficient_points') {
    const go = window.confirm(data.message || '积分不足，请充值积分或升级套餐后再试')
    if (go) navigate('/profile/points-recharge')
    return
  }
  window.alert(data.message || '暂时查不了')
}

export default function TalentAccountCheckPage() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const pr = getWorkIdentity() === 'pr'
  const [tab, setTab] = useState<'single' | 'batch'>('single')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [member, setMember] = useState(false)
  const [freeRemaining, setFreeRemaining] = useState(1)
  const [pointsPerCheck, setPointsPerCheck] = useState(5)
  const [hint, setHint] = useState('正在读取查验额度…')
  const [view, setView] = useState<TalentCheckView | null>(null)
  const [rows, setRows] = useState<SheetRow[]>([])

  function applyStatus(data: TalentCheckStatus) {
    setMember(!!data.member)
    setFreeRemaining(Number(data.freeRemaining) || 0)
    setPointsPerCheck(Number(data.pointsPerCheck) || 5)
    if (data.hint) setHint(data.hint)
  }

  useEffect(() => {
    if (!pr) {
      setHint('达人查验只在 PR 身份下使用')
      return
    }
    void postTalentAccountCheck({ mode: 'status' })
      .then((data) => {
        if (!data.ok) handleGate(navigate, data)
        else applyStatus(data)
      })
      .catch((err: unknown) => setHint(err instanceof Error ? err.message : '额度读取失败'))
  }, [navigate, pr])

  const singleLabel = !member
    ? freeRemaining > 0
      ? '本月免费查验 1 次'
      : '升级会员后查验'
    : `开始查验 · ${pointsPerCheck} 积分`

  async function onCheck() {
    const text = query.trim()
    if (!text || busy) return
    if (!member && freeRemaining <= 0) {
      promptUpgrade(navigate)
      return
    }
    setBusy(true)
    try {
      const data = await postTalentAccountCheck({ mode: 'check', query: text })
      if (!data.ok) {
        handleGate(navigate, data)
        return
      }
      setView(data.view || null)
      applyStatus(data)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '查验失败')
    } finally {
      setBusy(false)
    }
  }

  function downloadTemplate() {
    const blob = new Blob(['\uFEFF抖音号,昵称\n'], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '达人查验模板.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function onFile(file: File) {
    if (!member) {
      promptUpgrade(navigate, '批量查验需要升级会员。')
      return
    }
    setBusy(true)
    try {
      const name = file.name.toLowerCase()
      const body = name.endsWith('.csv')
        ? { mode: 'parse_sheet', csvText: await file.text() }
        : { mode: 'parse_sheet', fileBase64: await fileToBase64(file) }
      const data = await postTalentAccountCheck(body)
      if (!data.ok) {
        handleGate(navigate, data)
        return
      }
      setRows((data.rows || []).map((row) => ({ douyinId: row.douyinId, nickname: row.nickname || '', state: '', note: '待查验' })))
      if (data.truncated) window.alert('已截取前 30 个号')
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '表格读取失败')
    } finally {
      setBusy(false)
    }
  }

  async function onBatch() {
    if (busy || !rows.length) return
    if (!member) {
      promptUpgrade(navigate, '批量查验需要升级会员。')
      return
    }
    setBusy(true)
    try {
      const quote = await postTalentAccountCheck({ mode: 'quote', queries: rows.map((row) => row.douyinId) })
      if (!quote.ok) {
        handleGate(navigate, quote)
        return
      }
      const required = Number(quote.pointsRequired) || 0
      const cached = Number(quote.cached) || 0
      const content = required
        ? `本次 ${quote.chargeCount} 个号需要 ${required} 积分${cached ? `，${cached} 个号 24 小时内已查过，不重复扣` : ''}。确认后开始查验。`
        : '这些号 24 小时内都查过，不再扣积分。'
      if (!window.confirm(content)) return
      const next = rows.slice()
      for (let i = 0; i < next.length; i += 1) {
        next[i] = { ...next[i]!, note: '查验中', state: '' }
        setRows(next.slice())
        try {
          const data = await postTalentAccountCheck({ mode: 'check', query: next[i]!.douyinId })
          if (!data.ok) next[i] = { ...next[i]!, note: data.message || '未查到', state: 'fail' }
          else {
            next[i] = { ...next[i]!, note: data.view?.cached ? '24小时内已查过' : data.view?.nickname || '已查验', state: 'ok' }
            applyStatus(data)
          }
        } catch (err) {
          next[i] = { ...next[i]!, note: err instanceof Error ? err.message : '查验失败', state: 'fail' }
        }
        setRows(next.slice())
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '批量查验失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="talent-check">
      <div className="talent-check-strip">
        <div className="talent-check-title">达人查验</div>
        <div className="talent-check-sub">{hint}</div>
      </div>
      {pr ? (
        <>
          <div className="talent-check-tabs">
            <button
              type="button"
              className={tab === 'single' ? 'on' : ''}
              onClick={() => setTab('single')}
            >
              单个查验
            </button>
            <button
              type="button"
              className={tab === 'batch' ? 'on' : ''}
              onClick={() => {
                if (!member) {
                  promptUpgrade(navigate, '免费版每月只能查 1 个号。批量查验需要升级会员。')
                  return
                }
                setTab('batch')
              }}
            >
              批量查验
            </button>
          </div>
          {tab === 'single' ? (
            <>
              <div className="talent-check-card">
                <input
                  className="talent-check-field"
                  placeholder="抖音号、分享口令或主页链接"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button type="button" className="talent-check-btn" disabled={busy} onClick={() => void onCheck()}>
                  {busy ? '查验中…' : singleLabel}
                </button>
                <div className="talent-check-chips">
                  <span>公开主页</span>
                  <span>口令解析</span>
                  <span>豆包只读公开内容</span>
                </div>
              </div>
              {view ? (
                <div className="talent-check-card">
                  {view.rows.map((row) => (
                    <div className="talent-check-row" key={row.label}>
                      <b>{row.label}</b>
                      <div>
                        {row.value}
                        <em>{row.source}</em>
                      </div>
                    </div>
                  ))}
                  <div className="talent-check-clock">
                    核对于 {view.checkedAtLabel || ''} · 不读后台成交
                    {view.cached ? ' · 24小时内已查过，未再扣积分' : ''}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="talent-check-card">
                <div className="talent-check-note">第一列填抖音号，第二列昵称可以空着。支持 xlsx、csv，一次最多 30 个。免费版每月 1 次，不能批量查验。</div>
                <input
                  ref={fileRef}
                  className="talent-check-file"
                  type="file"
                  accept=".xlsx,.csv,text/csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) void onFile(file)
                  }}
                />
                <button type="button" className="talent-check-btn" disabled={busy} onClick={() => fileRef.current?.click()}>
                  上传表格
                </button>
                <button type="button" className="talent-check-ghost" onClick={downloadTemplate}>
                  下载模板
                </button>
              </div>
              {rows.length ? (
                <div className="talent-check-card">
                  <div className="talent-check-note">已读入 {rows.length} 个号</div>
                  {rows.map((row) => (
                    <div className={`talent-check-line ${row.state}`} key={row.douyinId}>
                      {row.nickname || row.douyinId} · {row.note}
                    </div>
                  ))}
                  <button type="button" className="talent-check-btn" disabled={busy} onClick={() => void onBatch()}>
                    {busy ? '查验中…' : '开始批量查验'}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </div>
  )
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      const comma = text.indexOf(',')
      resolve(comma >= 0 ? text.slice(comma + 1) : text)
    }
    reader.onerror = () => reject(new Error('表格读取失败'))
    reader.readAsDataURL(file)
  })
}
