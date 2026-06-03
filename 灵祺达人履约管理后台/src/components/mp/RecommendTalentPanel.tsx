import { useCallback, useEffect, useState } from 'react'
import { fetchMpRegistry } from '../../lib/mpApi'
import * as hallFilters from '../../lib/mpRecruitment/hallFilters'
import * as recruitmentAi from '../../lib/mpRecruitment/recruitmentAi'
import type { MpRegistry, TalentCardRow } from '../../lib/mpRecruitment/types'
import { formatTalent, matchTalentFilters } from '../../lib/mpRecruitment/talentFormat'

const TALENT_SEGMENTS = [
  { id: 'ai', label: '智能匹配' },
  { id: 'all', label: '全部达人' },
]

const TAG_FILTERS = ['全部', '优质', '推荐', '新锐', '会员', '美食', '亲子', '美妆']
const GENDER_FILTERS = ['全部', '男', '女']

function matchTalentSearch(row: TalentCardRow, keyword: string) {
  if (!keyword) return true
  const k = keyword.toLowerCase()
  return [row.id, row.name, row.platform, row.region, row.salesGrade, row.quality, ...row.tags]
    .join(' ')
    .toLowerCase()
    .includes(k)
}

function mapMembersAndLibrary(reg: MpRegistry): TalentCardRow[] {
  const library = Array.isArray(reg.talentLibraryEntries) ? reg.talentLibraryEntries : []
  const members = Array.isArray(reg.mpTalentMembers) ? reg.mpTalentMembers : []
  const fromLib = library.map((e) => {
    const row = e as Record<string, unknown>
    const raw = Number(row.followers) || 0
    return formatTalent({ ...row, qualityTag: raw >= 50000 ? '优质' : '推荐' })
  })
  const fromMembers = members.map((m) => {
    const mem = m as Record<string, unknown>
    const profiles = Array.isArray(mem.platformProfiles) ? mem.platformProfiles : []
    const primary = profiles[0] as Record<string, unknown> | undefined
    const raw = Number(primary?.followers) || 0
    return formatTalent({
      id: mem.id,
      platformNickname: primary?.platformNickname || mem.wxNickName,
      wxAvatarUrl: mem.wxAvatarUrl,
      platform: primary?.platform || '抖音',
      followers: raw,
      province: mem.province,
      city: mem.city,
      qualityTag: '会员',
      gender: mem.gender,
      accountTags: primary?.accountTags,
      douyinSalesLevel: primary?.douyinSalesLevel,
    })
  })
  return [...fromLib, ...fromMembers].sort((a, b) => (b.followersRaw || 0) - (a.followersRaw || 0))
}

export default function RecommendTalentPanel() {
  const [searchKeyword, setSearchKeyword] = useState('')
  const [talentSegment, setTalentSegment] = useState('ai')
  const [filterPlatform, setFilterPlatform] = useState('全部')
  const [filterCity, setFilterCity] = useState('全部')
  const [filterTag, setFilterTag] = useState('全部')
  const [filterGender, setFilterGender] = useState('全部')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [allRows, setAllRows] = useState<TalentCardRow[]>([])
  const [displayRows, setDisplayRows] = useState<TalentCardRow[]>([])
  const [listEmptyHint, setListEmptyHint] = useState('')
  const [prOrderCount, setPrOrderCount] = useState(0)
  const [prMatchHint, setPrMatchHint] = useState('发招募后，将按您的招募要求智能推荐达人')
  const [cityFilters, setCityFilters] = useState<string[]>(['全部'])
  const [registryCache, setRegistryCache] = useState<MpRegistry | null>(null)

  const applyTalentFilters = useCallback(async () => {
    const f = { platform: filterPlatform, city: filterCity, tag: filterTag, gender: filterGender }
    const kw = searchKeyword.trim()
    let filtered = allRows.filter((r) => matchTalentFilters(r, f) && matchTalentSearch(r, kw))
    if (talentSegment === 'ai' && prOrderCount > 0 && registryCache && filtered.length) {
      filtered = await recruitmentAi.enrichTalentMatchesForPr(filtered, registryCache)
      filtered = filtered.filter((t) => (t.matchScore || 0) >= 45)
    } else {
      filtered = filtered.slice().sort((a, b) => (b.followersRaw || 0) - (a.followersRaw || 0))
    }
    let hint = ''
    if (!filtered.length) {
      hint = kw ? `未找到「${kw}」相关达人` : talentSegment === 'ai' && prOrderCount > 0 ? '暂无高匹配达人，可切换「全部达人」' : '筛选后暂无更多达人'
    }
    setDisplayRows(filtered.slice(0, 50))
    setListEmptyHint(hint)
  }, [allRows, searchKeyword, talentSegment, filterPlatform, filterCity, filterTag, filterGender, prOrderCount, registryCache])

  useEffect(() => {
    void applyTalentFilters()
  }, [applyTalentFilters])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        const reg = await fetchMpRegistry()
        setRegistryCache(reg)
        const merged = mapMembersAndLibrary(reg)
        const packs = recruitmentAi.resolvePrRecentOrders(reg)
        setPrOrderCount(packs.length)
        setPrMatchHint(
          packs.length > 0 ? `已根据您最近 ${packs.length} 条发单要求智能匹配达人` : '发招募后，将按您的招募要求智能推荐达人',
        )
        setAllRows(merged.slice(0, 50))
        setCityFilters(hallFilters.buildCityFilterOptions(merged.map((r) => ({ region: r.region }))))
        if (packs.length > 0) setTalentSegment('ai')
      } catch (e) {
        setErr(e instanceof Error ? e.message : '加载失败')
        setDisplayRows([])
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">推荐达人</h2>
        <p className="text-sm text-slate-400 mt-1">{prMatchHint}</p>
      </div>
      <input
        className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2.5 text-sm"
        placeholder="搜索达人昵称、ID"
        value={searchKeyword}
        onChange={(e) => setSearchKeyword(e.target.value)}
      />
      {prOrderCount > 0 ? (
        <div className="flex flex-wrap gap-2">
          {TALENT_SEGMENTS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`px-3 py-1.5 rounded-lg text-sm ${talentSegment === s.id ? 'bg-orange-600 text-white' : 'bg-white/5 text-slate-400'}`}
              onClick={() => setTalentSegment(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2 text-sm">
        <select className="rounded-lg bg-black/30 border border-white/10 px-2 py-1.5" value={filterPlatform} onChange={(e) => setFilterPlatform(e.target.value)}>
          {hallFilters.PLATFORM_FILTERS.map((p) => (
            <option key={p} value={p}>{p === '全部' ? '平台' : p}</option>
          ))}
        </select>
        <select className="rounded-lg bg-black/30 border border-white/10 px-2 py-1.5" value={filterCity} onChange={(e) => setFilterCity(e.target.value)}>
          {cityFilters.map((c) => (
            <option key={c} value={c}>{c === '全部' ? '城市' : c}</option>
          ))}
        </select>
        <select className="rounded-lg bg-black/30 border border-white/10 px-2 py-1.5" value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
          {TAG_FILTERS.map((t) => (
            <option key={t} value={t}>{t === '全部' ? '标签' : t}</option>
          ))}
        </select>
        <select className="rounded-lg bg-black/30 border border-white/10 px-2 py-1.5" value={filterGender} onChange={(e) => setFilterGender(e.target.value)}>
          {GENDER_FILTERS.map((g) => (
            <option key={g} value={g}>{g === '全部' ? '性别' : g}</option>
          ))}
        </select>
      </div>
      {loading ? <p className="text-slate-400">加载中…</p> : null}
      {err ? <p className="text-red-400 text-sm">{err}</p> : null}
      {listEmptyHint ? <p className="text-slate-500 text-sm">{listEmptyHint}</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {displayRows.map((t) => (
          <article key={t.id} className="rounded-xl border border-white/10 bg-[#1a1a28] p-4 flex gap-3">
            <div className="w-12 h-12 rounded-full bg-violet-600/30 flex items-center justify-center text-lg shrink-0">
              {t.name.slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              {t.aiTag ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300">{t.aiTag}</span>
              ) : null}
              <h3 className="font-semibold truncate">{t.name}</h3>
              <p className="text-xs text-slate-500 mt-1">
                {t.platform} · {t.followers}粉 · {t.salesGrade}
              </p>
              <p className="text-xs text-slate-600 mt-0.5">{t.region}</p>
              {t.matchScore ? <p className="text-xs text-amber-400 mt-1">匹配度 {t.matchScore}</p> : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
