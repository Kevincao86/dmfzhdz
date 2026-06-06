import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchMpRegistry } from '../../lib/mpApi'
import * as hallFilters from '../../lib/mpRecruitment/hallFilters'
import * as recruitmentAi from '../../lib/mpRecruitment/recruitmentAi'
import {
  boardEmptyHint,
  boardMatchHint,
  boardSearchPlaceholder,
  buildBoardPool,
  countPrOrdersForBoard,
  PR_BOARD_SEGMENTS,
  type PrBoardId,
} from '../../lib/mpRecruitment/prRecommendBoard'
import type { MpRegistry, TalentCardRow } from '../../lib/mpRecruitment/types'
import { matchTalentFilters } from '../../lib/mpRecruitment/talentFormat'

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

type Props = { embedded?: boolean }

export default function RecommendTalentPanel({ embedded = false }: Props) {
  const [prBoard, setPrBoard] = useState<PrBoardId>('talent')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [filterPlatform, setFilterPlatform] = useState('全部')
  const [filterCity, setFilterCity] = useState('全部')
  const [filterTag, setFilterTag] = useState('全部')
  const [filterGender, setFilterGender] = useState('全部')
  const [loading, setLoading] = useState(true)
  const [matching, setMatching] = useState(false)
  const [err, setErr] = useState('')
  const [allRows, setAllRows] = useState<TalentCardRow[]>([])
  const [displayRows, setDisplayRows] = useState<TalentCardRow[]>([])
  const [listEmptyHint, setListEmptyHint] = useState('')
  const [prBoardOrderCount, setPrBoardOrderCount] = useState(0)
  const [prMatchHint, setPrMatchHint] = useState('发达人招募后，将按发单要求智能推荐达人')
  const [cityFilters, setCityFilters] = useState<string[]>(['全部'])
  const [registryCache, setRegistryCache] = useState<MpRegistry | null>(null)
  const [boardPools, setBoardPools] = useState<Record<PrBoardId, TalentCardRow[]>>({
    talent: [],
    shoot: [],
    edit: [],
  })

  const searchPlaceholder = useMemo(() => boardSearchPlaceholder(prBoard), [prBoard])

  const applyTalentFilters = useCallback(async () => {
    const f = { platform: filterPlatform, city: filterCity, tag: filterTag, gender: filterGender }
    const kw = searchKeyword.trim()
    let filtered = allRows.filter((r) => matchTalentFilters(r, f) && matchTalentSearch(r, kw))

    if (prBoardOrderCount > 0 && registryCache && filtered.length) {
      setMatching(true)
      try {
        filtered = await recruitmentAi.enrichTalentMatchesForPr(filtered, registryCache, { board: prBoard })
        const matched = filtered.filter((t) => (t.matchScore || 0) >= 45)
        filtered = matched.length ? matched : filtered
      } catch {
        const packs = recruitmentAi.resolvePrRecentOrders(registryCache, { board: prBoard })
        const payloads = packs.map((p) => p.payload)
        filtered = filtered
          .map((t) => {
            const fb = recruitmentAi.fallbackTalentScore(t, payloads)
            return { ...t, matchScore: fb.score, aiTag: fb.tag, aiTagTone: fb.tone, aiMatch: fb.score >= 55 }
          })
          .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
      } finally {
        setMatching(false)
      }
    } else {
      filtered = filtered.slice().sort((a, b) => (b.followersRaw || 0) - (a.followersRaw || 0))
    }

    let hint = ''
    if (!filtered.length) {
      hint = boardEmptyHint(prBoard, kw, prBoardOrderCount > 0)
    }
    setDisplayRows(filtered.slice(0, 50))
    setListEmptyHint(hint)
  }, [
    allRows,
    searchKeyword,
    filterPlatform,
    filterCity,
    filterTag,
    filterGender,
    prBoardOrderCount,
    registryCache,
    prBoard,
  ])

  useEffect(() => {
    void applyTalentFilters()
  }, [applyTalentFilters])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        const reg = await fetchMpRegistry()
        setRegistryCache(reg)
        const pools = {
          talent: buildBoardPool(reg, 'talent'),
          shoot: buildBoardPool(reg, 'shoot'),
          edit: buildBoardPool(reg, 'edit'),
        }
        setBoardPools(pools)
        const board = prBoard
        const pool = pools[board]
        const orderCount = countPrOrdersForBoard(reg, board)
        setPrBoardOrderCount(orderCount)
        setPrMatchHint(boardMatchHint(board, orderCount))
        setAllRows(pool)
        const rowsForCity = [...pools.talent, ...pools.shoot, ...pools.edit]
        setCityFilters(hallFilters.buildCityFilterOptions(rowsForCity.map((r) => ({ region: r.region }))))
      } catch (e) {
        setErr(e instanceof Error ? e.message : '加载失败')
        setDisplayRows([])
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  function onBoardChange(id: PrBoardId) {
    if (id === prBoard) return
    const pool = boardPools[id] || []
    const orderCount = registryCache ? countPrOrdersForBoard(registryCache, id) : 0
    setPrBoard(id)
    setAllRows(pool)
    setPrBoardOrderCount(orderCount)
    setPrMatchHint(boardMatchHint(id, orderCount))
    setSearchKeyword('')
  }

  return (
    <div className="space-y-4">
      {embedded ? (
        <p className="text-sm text-[var(--shell-muted)]">{prMatchHint}</p>
      ) : (
        <div>
          <h2 className="text-xl font-bold text-[var(--shell-text)]">推荐大厅</h2>
          <p className="text-sm text-[var(--shell-muted)] mt-1">{prMatchHint}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-[var(--shell-muted)] self-center mr-1">需求身份</span>
        {PR_BOARD_SEGMENTS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              prBoard === s.id ? 'bg-violet-600 text-white' : 'panel-tab'
            }`}
            onClick={() => onBoardChange(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <input
        className="w-full rounded-lg panel-input px-3 py-2.5 text-sm"
        placeholder={searchPlaceholder}
        value={searchKeyword}
        onChange={(e) => setSearchKeyword(e.target.value)}
      />

      <div className="flex flex-wrap gap-2 text-sm">
        <select className="rounded-lg panel-input border px-2 py-1.5" value={filterPlatform} onChange={(e) => setFilterPlatform(e.target.value)}>
          {hallFilters.PLATFORM_FILTERS.map((p) => (
            <option key={p} value={p}>{p === '全部' ? '平台' : p}</option>
          ))}
        </select>
        <select className="rounded-lg panel-input border px-2 py-1.5" value={filterCity} onChange={(e) => setFilterCity(e.target.value)}>
          {cityFilters.map((c) => (
            <option key={c} value={c}>{c === '全部' ? '城市' : c}</option>
          ))}
        </select>
        <select className="rounded-lg panel-input border px-2 py-1.5" value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
          {TAG_FILTERS.map((t) => (
            <option key={t} value={t}>{t === '全部' ? '标签' : t}</option>
          ))}
        </select>
        {prBoard === 'talent' ? (
          <select className="rounded-lg panel-input border px-2 py-1.5" value={filterGender} onChange={(e) => setFilterGender(e.target.value)}>
            {GENDER_FILTERS.map((g) => (
              <option key={g} value={g}>{g === '全部' ? '性别' : g}</option>
            ))}
          </select>
        ) : null}
      </div>

      {loading || matching ? (
        <p className="text-[var(--shell-muted)] text-sm">{matching ? '智能匹配中…' : '加载中…'}</p>
      ) : null}
      {err ? <p className="text-red-400 text-sm">{err}</p> : null}
      {listEmptyHint ? <p className="text-[var(--shell-muted)] text-sm">{listEmptyHint}</p> : null}

      <div className="grid gap-3 md:grid-cols-2">
        {displayRows.map((t) => (
          <article key={t.id} className="talent-card rounded-xl border p-4 flex gap-3">
            {t.avatar ? (
              <img src={t.avatar} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-violet-600/30 flex items-center justify-center text-lg shrink-0">
                {t.name.slice(0, 1)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              {t.aiTag ? <span className="order-tag order-tag--match">{t.aiTag}</span> : null}
              <h3 className="font-semibold truncate text-[var(--shell-text)]">{t.name}</h3>
              <p className="talent-card-meta text-xs mt-1">
                {t.platform} · {t.followers === '团队' ? t.salesGrade : `${t.followers}粉`} · {t.salesGrade}
              </p>
              <p className="talent-card-meta text-xs mt-0.5">{t.region}</p>
              {t.matchScore ? (
                <p className="order-price text-xs mt-1 font-medium text-orange-600">匹配度 {t.matchScore}</p>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
