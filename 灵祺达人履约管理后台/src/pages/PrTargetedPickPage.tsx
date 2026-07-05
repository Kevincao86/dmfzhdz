import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { fetchMpRegistry } from '../lib/mpApi'
import { buildBoardPool } from '../lib/mpRecruitment/prRecommendBoard'
import { PLATFORMS } from '../lib/mpSync/publishFormOptions'
import { sendInvites } from '../lib/mpSync/mpTargetedRecruitApi'
import { BtnOutline, BtnPrimary } from '../components/ui/MockupLayouts'

type TalentRow = {
  id: string
  name?: string
  platform?: string
  region?: string
  city?: string
  province?: string
  douyinSalesLevel?: string
  salesGrade?: string
  accountTags?: string[]
}

function normalizeSalesLevel(raw: string) {
  const s = String(raw || '').trim()
  if (!s) return ''
  const m = s.match(/Lv\d+/i)
  return m ? m[0].replace(/^lv/i, 'Lv') : s
}

function matchRow(
  row: TalentRow,
  kw: string,
  platform: string,
  province: string,
  city: string,
  salesLevel: string,
) {
  if (platform && platform !== '全部' && row.platform !== platform) return false
  if (province && province !== '全部') {
    const rowProv = String(row.province || '').trim()
    const region = String(row.region || '').trim()
    if (rowProv !== province && !region.startsWith(province)) return false
  }
  if (city && city !== '全部') {
    const rowCity = String(row.city || '').trim()
    const region = String(row.region || '').trim()
    if (rowCity !== city && !region.includes(city)) return false
  }
  if (salesLevel && salesLevel !== '全部') {
    const lv = normalizeSalesLevel(row.douyinSalesLevel || row.salesGrade || '')
    if (lv !== salesLevel && !String(row.salesGrade || '').includes(salesLevel)) return false
  }
  const k = kw.trim().toLowerCase()
  if (!k) return true
  const blob = [row.name, row.id, row.region, row.city, row.province, (row.accountTags || []).join(' ')]
    .join(' ')
    .toLowerCase()
  return blob.includes(k)
}

export default function PrTargetedPickPage() {
  const { id: mpOrderId = '' } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const inviteResponseHours = Number(search.get('hours') || 72) || 72
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [allRows, setAllRows] = useState<TalentRow[]>([])
  const [keyword, setKeyword] = useState('')
  const [filterPlatform, setFilterPlatform] = useState('全部')
  const [filterProvince, setFilterProvince] = useState('全部')
  const [filterCity, setFilterCity] = useState('全部')
  const [filterSalesLevel, setFilterSalesLevel] = useState('全部')
  const [selectedMap, setSelectedMap] = useState<Record<string, boolean>>({})
  const [sending, setSending] = useState(false)

  const loadPool = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const reg = await fetchMpRegistry({ includeRecommendPool: true })
      const pool = buildBoardPool(reg, 'talent') as TalentRow[]
      setAllRows(pool.filter((r) => r && r.id))
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e || '加载失败'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPool()
  }, [loadPool])

  const displayRows = useMemo(
    () => allRows.filter((r) => matchRow(r, keyword, filterPlatform, filterProvince, filterCity, filterSalesLevel)),
    [allRows, keyword, filterPlatform, filterProvince, filterCity, filterSalesLevel],
  )

  const selectedCount = Object.keys(selectedMap).filter((k) => selectedMap[k]).length

  const salesLevelOpts = useMemo(() => {
    const set = new Set<string>(['全部'])
    for (const r of allRows) {
      const lv = normalizeSalesLevel(r.douyinSalesLevel || r.salesGrade || '')
      if (lv && /^Lv\d+$/i.test(lv)) set.add(lv.replace(/^lv/i, 'Lv'))
    }
    return [...set]
  }, [allRows])

  async function onSend() {
    const ids = Object.keys(selectedMap).filter((k) => selectedMap[k])
    if (!ids.length) {
      window.alert('请选择达人')
      return
    }
    setSending(true)
    try {
      const res = await sendInvites(mpOrderId, ids, inviteResponseHours)
      const added = Number(res.added) || ids.length
      window.alert(`已邀约 ${added} 人`)
      navigate(`/orders/${encodeURIComponent(mpOrderId)}/targeted`)
    } catch (e) {
      window.alert(String(e instanceof Error ? e.message : e || '发送失败'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="page-content-shell page-content-shell--wide">
      <header className="mb-4">
        <Link to={`/orders/${encodeURIComponent(mpOrderId)}/targeted`} className="text-sm text-blue-600 hover:underline">
          ← 邀约管理
        </Link>
        <h1 className="text-xl font-semibold mt-2">选择达人 · 定向邀约</h1>
        <p className="text-sm text-[var(--shell-muted)]">响应时限 {inviteResponseHours} 小时</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        <input
          type="search"
          className="rounded-lg border px-3 py-2 text-sm"
          placeholder="搜索昵称/ID/地区"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <select
          className="rounded-lg border px-3 py-2 text-sm"
          value={filterPlatform}
          onChange={(e) => setFilterPlatform(e.target.value)}
        >
          {['全部', ...PLATFORMS].map((p) => (
            <option key={p} value={p}>
              {p === '全部' ? '平台 · 全部' : p}
            </option>
          ))}
        </select>
        <input
          className="rounded-lg border px-3 py-2 text-sm"
          placeholder="省份（如：广东）"
          value={filterProvince === '全部' ? '' : filterProvince}
          onChange={(e) => setFilterProvince(e.target.value.trim() || '全部')}
        />
        <select
          className="rounded-lg border px-3 py-2 text-sm"
          value={filterSalesLevel}
          onChange={(e) => setFilterSalesLevel(e.target.value)}
        >
          {salesLevelOpts.map((lv) => (
            <option key={lv} value={lv}>
              {lv === '全部' ? '带货等级 · 全部' : lv}
            </option>
          ))}
        </select>
      </div>

      {loading ? <p className="text-sm">加载中…</p> : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <div className="rounded-xl border divide-y max-h-[52vh] overflow-y-auto mb-4">
        {!loading && !displayRows.length ? (
          <p className="p-4 text-sm text-[var(--shell-muted)]">暂无匹配达人</p>
        ) : null}
        {displayRows.map((row) => {
          const checked = !!selectedMap[row.id]
          return (
            <label key={row.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  setSelectedMap((prev) => {
                    const next = { ...prev }
                    if (next[row.id]) delete next[row.id]
                    else next[row.id] = true
                    return next
                  })
                }
              />
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{row.name || row.id}</div>
                <div className="text-xs text-[var(--shell-muted)]">
                  {[row.platform, row.region || row.city, normalizeSalesLevel(row.douyinSalesLevel || '')]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
            </label>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 sticky bottom-4 bg-[var(--shell-bg)] py-2">
        <span className="text-sm">已选 {selectedCount} 人</span>
        <BtnOutline onClick={() => setSelectedMap({})}>清空</BtnOutline>
        <BtnPrimary disabled={sending || selectedCount === 0} onClick={() => void onSend()}>
          {sending ? '发送中…' : `发送邀约 (${selectedCount})`}
        </BtnPrimary>
      </div>
    </div>
  )
}
