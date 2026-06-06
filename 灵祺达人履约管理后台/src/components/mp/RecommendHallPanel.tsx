import { useCallback, useEffect, useState } from 'react'
import { fetchMpRegistry } from '../../lib/mpApi'
import { getAccount, getActiveRole } from '../../lib/mpSession'
import { readApplications } from '../../lib/mpSync/applicationsStore'
import * as hallFilters from '../../lib/mpRecruitment/hallFilters'
import * as listFilters from '../../lib/mpRecruitment/listFilters'
import { loadOpenOrderRows } from '../../lib/mpRecruitment/orderCard'
import { orderVisibleToWorkIdentity } from '../../lib/mpRecruitment/roleHallFilters'
import * as recruitmentAi from '../../lib/mpRecruitment/recruitmentAi'
import type { RecruitmentOrderRow } from '../../lib/mpRecruitment/types'
import { getWorkIdentity, workIdentityLabel, WORK_EDITION_LABEL } from '../../lib/mpWorkIdentity'
import { readMember } from '../../lib/mpSync/talentMember'
import { profileFilled, TALENT_PLATFORMS } from '../../lib/mpSync/talentPlatformProfiles'
import RecruitmentOrderCard from './RecruitmentOrderCard'
import HallCityFilter from './HallCityFilter'
import RecommendTalentPanel from './RecommendTalentPanel'
import { useRecruitmentNav } from '../../lib/useRecruitmentNav'

function habitPlatforms(): string[] {
  const apps = readApplications()
  const set = new Set<string>()
  for (const a of apps.slice(0, 20)) {
    if (a.platform) set.add(a.platform)
  }
  return [...set]
}

function localHabitBoost(row: RecruitmentOrderRow, platforms: string[]): number {
  let boost = 0
  if (platforms.length && platforms.includes(row.platform)) boost += 12
  if (row.recommended) boost += 6
  if (row.urgent) boost += 4
  return boost
}

function buildSupplierMember() {
  const member = readMember()
  const acc = getAccount()
  const workId = getWorkIdentity()
  const primaryEntry = member?.platformProfiles
    ? TALENT_PLATFORMS.map((p) => ({ plat: p, prof: member.platformProfiles[p.id] })).find(
        (x) => profileFilled(x.prof),
      )
    : null
  const primary = primaryEntry?.prof
  const platformName = primaryEntry?.plat.name || '抖音'
  const accountTags = [
    ...(primary?.accountTags || []),
    workIdentityLabel(workId),
    ...(workId === 'shoot' ? ['拍摄', '跟拍'] : []),
    ...(workId === 'edit' ? ['剪辑', '后期'] : []),
  ]
  return {
    city: member?.city || '',
    province: member?.province || '',
    platform: platformName,
    nickname: primary?.platformNickname || acc?.wxNickName || '',
    followers: primary?.followers ? String(primary.followers) : '',
    accountTags,
    workIdentity: workId,
  }
}

function SupplierRecommendOrders() {
  const goDetail = useRecruitmentNav()
  const workId = getWorkIdentity()
  const [searchKeyword, setSearchKeyword] = useState('')
  const [filterPlatform, setFilterPlatform] = useState('全部')
  const [filterProvince, setFilterProvince] = useState('全部')
  const [filterCity, setFilterCity] = useState('全部')
  const [priceSelected, setPriceSelected] = useState<string[]>([])
  const [priceFilterLabel, setPriceFilterLabel] = useState('价格')
  const [showPriceSheet, setShowPriceSheet] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [allOrderRows, setAllOrderRows] = useState<RecruitmentOrderRow[]>([])
  const [orderDisplayRows, setOrderDisplayRows] = useState<RecruitmentOrderRow[]>([])
  const talentCity = readMember()?.city || readMember()?.province || ''
  const habitPlats = habitPlatforms()

  const applyOrderFilters = useCallback(async () => {
    const member = buildSupplierMember()
    const kw = searchKeyword.trim()
    let rows = allOrderRows.filter((r) => {
      if (!orderVisibleToWorkIdentity(r, workId)) return false
      const blob = [r.title, r.merchantName, r.region, r.platform].join(' ').toLowerCase()
      if (kw && !blob.includes(kw.toLowerCase())) return false
      if (!hallFilters.matchPlatform(r.platform, filterPlatform)) return false
      if (!hallFilters.matchRegionFilter(r.region, r.storeName, filterProvince, filterCity)) return false
      if (!hallFilters.matchPriceBuckets(r.priceAmount, priceSelected)) return false
      return true
    })
    const mocks = rows.filter((r) => r.isMock)
    let real = rows.filter((r) => !r.isMock)
    if (real.length) {
      real = await recruitmentAi.enrichOrderMatches(real, member)
      real = real.map((r) => ({
        ...r,
        matchScore: Math.min(100, (r.matchScore || 0) + localHabitBoost(r, habitPlats)),
      }))
      real.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0) || (b.publishedAtMs || 0) - (a.publishedAtMs || 0))
    }
    setOrderDisplayRows([...real, ...mocks].slice(0, 50))
  }, [allOrderRows, searchKeyword, filterPlatform, filterProvince, filterCity, priceSelected, workId, habitPlats])

  useEffect(() => {
    void applyOrderFilters()
  }, [applyOrderFilters])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        const reg = await fetchMpRegistry()
        let rows = loadOpenOrderRows(reg).filter((r) => orderVisibleToWorkIdentity(r, workId))
        if (!rows.length) rows = listFilters.buildMockRecruitmentRows()
        setAllOrderRows(rows)
      } catch (e) {
        setErr(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [workId])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-[var(--shell-text)]">推荐大厅</h2>
        <p className="text-sm text-[var(--shell-muted)] mt-1">
          AI 识别 {WORK_EDITION_LABEL[workId]} 身份 · 结合标签与报名习惯匹配 · 按匹配分从高到低排序
        </p>
      </div>
      <input
        className="w-full rounded-lg panel-input px-3 py-2.5 text-sm"
        placeholder="搜索商单、门店、城市"
        value={searchKeyword}
        onChange={(e) => setSearchKeyword(e.target.value)}
      />
      <div className="flex flex-wrap gap-2 text-sm">
        <select className="rounded-lg panel-select px-2 py-1.5" value={filterPlatform} onChange={(e) => setFilterPlatform(e.target.value)}>
          {hallFilters.PLATFORM_FILTERS.map((p) => (
            <option key={p} value={p}>{p === '全部' ? '平台' : p}</option>
          ))}
        </select>
        <HallCityFilter
          compact
          province={filterProvince}
          city={filterCity}
          onChange={(prov, c) => {
            setFilterProvince(prov)
            setFilterCity(c)
          }}
        />
        <button type="button" className="rounded-lg border border-[var(--shell-border)] px-2 py-1.5" onClick={() => setShowPriceSheet(true)}>
          {priceFilterLabel}
        </button>
      </div>
      {loading ? <p className="text-[var(--shell-muted)]">智能匹配中…</p> : null}
      {err ? <p className="text-amber-600 text-sm">{err}</p> : null}
      {!loading && !orderDisplayRows.length ? (
        <p className="text-[var(--shell-muted)] text-sm">
          {talentCity ? '暂无高匹配商单，可调整筛选条件' : '请先在「我的」完善资料，以获得更精准推荐'}
        </p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {orderDisplayRows.map((o) => (
          <RecruitmentOrderCard key={o.id} row={o} onClick={() => goDetail(o)} />
        ))}
      </div>
      {showPriceSheet ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--panel-overlay)] p-4" onClick={() => setShowPriceSheet(false)}>
          <div className="w-full max-w-md rounded-2xl panel-card p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap gap-2">
              {hallFilters.priceBucketsForView(priceSelected).map((b) => (
                <button key={b.id} type="button" className={`px-3 py-1.5 rounded-full text-sm ${b.selected ? 'panel-tab-active' : 'panel-tab'}`} onClick={() => setPriceSelected(hallFilters.togglePriceId(priceSelected, b.id))}>
                  {b.label}
                </button>
              ))}
            </div>
            <button type="button" className="w-full mt-4 py-2 rounded-lg panel-tab-active" onClick={() => { setPriceFilterLabel(hallFilters.priceFilterLabel(priceSelected, '价格')); setShowPriceSheet(false) }}>
              确定
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function RecommendHallPanel() {
  const role = getActiveRole()
  if (role === 'pr') {
    return (
      <div className="space-y-2">
        <div className="mb-2">
          <h2 className="text-xl font-bold text-[var(--shell-text)]">推荐大厅</h2>
          <p className="text-sm text-[var(--shell-muted)] mt-1">
            AI 识别 PR 身份 · 结合招募要求与发单习惯推荐达人 · 按匹配分从高到低排序
          </p>
        </div>
        <RecommendTalentPanel embedded />
      </div>
    )
  }
  return <SupplierRecommendOrders />
}
