import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getWorkIdentity } from '../lib/mpWorkIdentity'
import { postTalentAccountCheck, type TalentCheckStatus, type TalentCheckView } from '../lib/talentAccountCheck'
import './TalentAccountCheckPage.css'

type SheetRow = { douyinId: string; nickname: string; state: '' | 'ok' | 'fail'; note: string }

const PLATFORMS = [
  { id: 'douyin', label: '抖音', logo: '/platforms/douyin.png', open: true },
  { id: 'xhs', label: '小红书', logo: '/platforms/xiaohongshu.png', open: true },
  { id: 'kuaishou', label: '快手', logo: '/platforms/kuaishou-local.png', open: false },
  { id: 'dianping', label: '大众点评', logo: '/platforms/dianping.png', open: false },
  { id: 'channels', label: '视频号', logo: '/platforms/wechat.png', open: false },
] as const

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
  if (data.error === 'platform_closed') {
    window.alert(data.message || '该平台尚未开放，目前只能查验抖音')
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
  const [xhsPointsPerCheck, setXhsPointsPerCheck] = useState(22)
  const [pointsBalance, setPointsBalance] = useState(0)
  const [hint, setHint] = useState('正在读取查验额度…')
  const [view, setView] = useState<TalentCheckView | null>(null)
  const [rows, setRows] = useState<SheetRow[]>([])
  const [records, setRecords] = useState<TalentCheckView[]>([])
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]['id']>('douyin')

  function applyStatus(data: TalentCheckStatus) {
    setMember(!!data.member)
    setFreeRemaining(Number(data.freeRemaining) || 0)
    setPointsPerCheck(Number(data.pointsPerCheck) || 5)
    setXhsPointsPerCheck(Number(data.xhsPointsPerCheck) || 22)
    setPointsBalance(Number(data.pointsBalance) || 0)
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
    void postTalentAccountCheck({ mode: 'history' })
      .then((data) => {
        if (data.ok) setRecords(data.records || [])
      })
      .catch(() => {})
  }, [navigate, pr])

  function reloadHistory() {
    void postTalentAccountCheck({ mode: 'history' })
      .then((data) => {
        if (data.ok) setRecords(data.records || [])
      })
      .catch(() => {})
  }

  function openRecord(record: TalentCheckView) {
    setTab('single')
    setPlatform(record.platform === 'xhs' ? 'xhs' : 'douyin')
    setQuery(record.account || '')
    setView({ ...record, cached: false, recent: record.recent || [] })
  }

  const xhsRate = xhsPointsPerCheck || 22
  const singleLabel = busy
    ? '查验中…'
    : platform === 'xhs'
      ? pointsBalance >= xhsRate
        ? '开始查验'
        : '去充值'
      : !member
        ? freeRemaining > 0
          ? '免费查验'
          : '去升级'
        : '开始查验'

  function onPlatform(id: (typeof PLATFORMS)[number]['id']) {
    const item = PLATFORMS.find((row) => row.id === id)
    if (!item?.open) {
      window.alert(`${item?.label || '该平台'}尚未开放，目前只能查验抖音和小红书`)
      return
    }
    setPlatform(id)
    setView(null)
    if (id === 'xhs') setTab('single')
  }

  async function onCheck() {
    const text = query.trim()
    if (!text || busy) return
    if (platform === 'xhs' && pointsBalance < xhsRate) {
      const go = window.confirm(`小红书查验需要 ${xhsRate} 积分，当前余额不足。`)
      if (go) navigate('/profile/points-recharge')
      return
    }
    if (platform !== 'xhs' && !member && freeRemaining <= 0) {
      promptUpgrade(navigate)
      return
    }
    setBusy(true)
    try {
      const data = await postTalentAccountCheck({ mode: 'check', query: text, platform })
      if (!data.ok) {
        handleGate(navigate, data)
        return
      }
      setView(data.view || null)
      applyStatus(data)
      reloadHistory()
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
        ? { mode: 'parse_sheet', platform: 'douyin', csvText: await file.text() }
        : { mode: 'parse_sheet', platform: 'douyin', fileBase64: await fileToBase64(file) }
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
      const quote = await postTalentAccountCheck({ mode: 'quote', platform: 'douyin', queries: rows.map((row) => row.douyinId) })
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
          const data = await postTalentAccountCheck({ mode: 'check', platform: 'douyin', query: next[i]!.douyinId })
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
      reloadHistory()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '批量查验失败')
    } finally {
      setBusy(false)
    }
  }

  const active = PLATFORMS.find((item) => item.id === platform) || PLATFORMS[0]
  const xhs = platform === 'xhs' || view?.platform === 'xhs'
  const recent = (view?.recent || []).filter(Boolean)

  return (
    <div className="talent-check">
      <div className="talent-check-head">
        <div className="talent-check-title">达人查验</div>
        <div className="talent-check-pills">
          <span className="talent-check-pill">{member ? `会员 · 余额 ${pointsBalance}` : '免费版'}</span>
          <span className="talent-check-pill">
            {platform === 'xhs' ? `${xhsRate}积分/次` : member ? `${pointsPerCheck}积分/次` : freeRemaining > 0 ? '本月剩 1 次' : '本月已用完'}
          </span>
        </div>
      </div>
      {!pr ? <p className="talent-check-note">{hint}</p> : null}
      {pr ? (
        <>
          <div className="talent-check-platforms">
            {PLATFORMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`talent-check-platform${item.open ? ' on' : ' off'}${platform === item.id ? ' picked' : ''}`}
                onClick={() => onPlatform(item.id)}
              >
                <img src={item.logo} alt="" />
                <span>
                  <b>{item.label}</b>
                  {item.open ? null : <small>未开放</small>}
                </span>
              </button>
            ))}
          </div>
          <div className="talent-check-tabs">
            <button type="button" className={tab === 'single' ? 'on' : ''} onClick={() => setTab('single')}>
              单个查验
            </button>
            <button
              type="button"
              className={tab === 'batch' ? 'on' : ''}
              onClick={() => {
                if (platform === 'xhs') {
                  window.alert('小红书目前只支持单个查验')
                  return
                }
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
              <div className="talent-check-search">
                <label className="talent-check-field">
                  <img src={active.logo} alt="" />
                  <input
                    placeholder={xhs ? '小红书号、主页链接或昵称' : '抖音号、口令或主页链接'}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <button type="button" className="talent-check-go" disabled={busy} onClick={() => void onCheck()}>
                  {singleLabel}
                </button>
              </div>
              <div className="talent-check-chips">
                <span>公开主页</span>
                <span>{xhs ? '笔记互动' : '口令解析'}</span>
                <span>{xhs ? '机构专业解读' : '抖音官方数据检索'}</span>
              </div>
              {view ? (
                <div className="talent-check-result">
                  <div className="talent-check-who">
                    <div className="talent-check-id">
                      {view.avatarUrl ? (
                        <img className="avatar" src={view.avatarUrl} alt="" />
                      ) : (
                        <span className="talent-check-fallback">{(view.nickname || '达').slice(0, 1)}</span>
                      )}
                      <div>
                        <strong>{view.nickname || '未公开'}</strong>
                        <div className="talent-check-account">
                          <img src={view.platform === 'xhs' ? PLATFORMS[1].logo : PLATFORMS[0].logo} alt="" />
                          {view.account || '未公开'}
                        </div>
                        <span className="talent-check-tag">公开主页</span>
                      </div>
                    </div>
                    <div className="talent-check-metrics">
                      <div>
                        <div className="talent-check-metric-top"><small>粉丝</small></div>
                        <p>{view.followersText || '未公开'}</p>
                      </div>
                      <div>
                        <div className="talent-check-metric-top"><small>签名</small></div>
                        <p>{view.signature || '未公开'}</p>
                      </div>
                      <div>
                        <div className="talent-check-metric-top"><small>内容方向</small><span className="talent-check-tag">{view.platform === 'xhs' ? '联网分析' : '抖音官方数据检索'}</span></div>
                        <p>{view.direction || '未写到'}</p>
                        <div className="talent-check-sales">
                          <div className="talent-check-metric-top"><small>{view.platform === 'xhs' ? '近期篇均互动' : '近30天带货金额'}</small></div>
                          <p>{view.platform === 'xhs' ? view.engageText || '未公开' : view.sales30d || '公开信息不足，暂不估算'}</p>
                        </div>
                      </div>
                      <div>
                        <div className="talent-check-metric-top"><small>近期内容</small><span className="talent-check-tag">{view.platform === 'xhs' ? '公开笔记' : '抖音官方数据检索'}</span></div>
                        <p>{recent.length ? recent.join('  ') : '未写到'}</p>
                      </div>
                    </div>
                  </div>
                  <div className="talent-check-read">
                    <b>豆包AI助手解读</b>
                    <div className="talent-check-summary">{view.summary}</div>
                  </div>
                  <div className="talent-check-clock">
                    核对于 {view.checkedAtLabel || ''} · 核验限于达人公开数据
                    {view.cached ? ' · 24小时内已查过，未再扣积分' : ''}
                  </div>
                </div>
              ) : (
                <div className="talent-check-guides">
                  <div><b>公开主页</b><span>{xhs ? '昵称、小红书号、粉丝与简介，以该账号公开主页为准。' : '昵称、抖音号、粉丝与签名，以该账号公开主页为准。'}</span></div>
                  <div><b>{xhs ? '公开笔记' : '抖音官方数据检索'}</b><span>{xhs ? '近期笔记的赞、藏和篇均互动，按公开笔记计算。' : '内容方向与近期作品标题，依据抖音官方数据检索。'}</span></div>
                  <div><b>核验口径</b><span>{xhs ? '粉丝和互动用公开数据，解读由豆包联网完成，不改这些数字。' : '本次只核验达人公开数据，并由官方助手进行达人数据分析和评估。'}</span></div>
                </div>
              )}
            </>
          ) : (
            <div className="talent-check-batch">
              <div className="talent-check-batch-row">
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
                <button type="button" className="talent-check-go" disabled={busy} onClick={() => fileRef.current?.click()}>
                  上传表格
                </button>
                <button type="button" className="talent-check-ghost" onClick={downloadTemplate}>
                  下载模板
                </button>
              </div>
              <div className="talent-check-note">{xhs ? '小红书目前只支持单个查验。' : '第一列填抖音号，第二列昵称可以空着。支持 xlsx、csv，一次最多 30 个。目前只能批量查验抖音。'}</div>
              {rows.map((row) => (
                <div className={`talent-check-line ${row.state}`} key={`${row.douyinId}-${row.note}`}>
                  {row.nickname || row.douyinId} · {row.note}
                </div>
              ))}
              {rows.length ? (
                <button type="button" className="talent-check-go" disabled={busy} onClick={() => void onBatch()} style={{ marginTop: 12 }}>
                  {busy ? '查验中…' : '开始批量查验'}
                </button>
              ) : null}
            </div>
          )}
          <section className="talent-check-history">
            <h3>查验记录</h3>
            {records.length ? (
              <div className="talent-check-history-list">
                {records.map((record) => (
                  <button
                    type="button"
                    className="talent-check-history-item"
                    key={`${record.account}-${record.checkedAt}`}
                    onClick={() => openRecord(record)}
                  >
                    {record.avatarUrl ? (
                      <img src={record.avatarUrl} alt="" />
                    ) : (
                      <span className="talent-check-history-fallback">{(record.nickname || '达').slice(0, 1)}</span>
                    )}
                    <span>
                      <b>{record.nickname || '未公开'}</b>
                      <small>
                        {record.account || '未公开'} · 粉丝 {record.followersText || '未公开'} · {record.platform === 'xhs' ? record.engageText || '篇均未公开' : record.sales30d || '暂不估算'}
                      </small>
                    </span>
                    <time>{record.checkedAtLabel || ''}</time>
                  </button>
                ))}
              </div>
            ) : (
              <p className="talent-check-history-empty">还没有查验记录。查完一个号后会留在这里，点开不重复扣积分。</p>
            )}
          </section>
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
