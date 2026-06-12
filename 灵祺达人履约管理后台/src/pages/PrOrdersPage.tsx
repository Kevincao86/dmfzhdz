import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchMpRegistry, patchMpRecruitmentOrder, deleteMpRecruitmentOrder } from '../lib/mpApi'
import { getAccount } from '../lib/mpSession'
import * as hallFilters from '../lib/mpRecruitment/hallFilters'
import * as listFilters from '../lib/mpRecruitment/listFilters'
import { HALL_DEFAULT_STATUS_FILTER, matchHallStatusFilter } from '../lib/mpRecruitment/mpOrderStatus'
import { matchListKeyword } from '../lib/mpRecruitment/listKeywordSearch'
import {
  cachePublishedOrdersFromMpList,
  markPublishedOrderDeleted,
  readPublishedOrders,
  listPublishedOrdersForCurrentPr,
  pruneOrphanPublishedOrders,
  touchPublishedOrderSnapshot,
} from '../lib/mpRecruitment/publishedOrders'
import { syncClientStateWithServer } from '../lib/mpAccountClientSync'
import {
  deletePublishDraft,
  draftDisplayTitle,
  formatDraftSavedAt,
  listPublishDrafts,
  type PublishWizardDraft,
} from '../lib/mpSync/publishDraft'
import { DELIVERY_WINDOWS } from '../lib/mpSync/publishFormOptions'
import { prepareRecruitmentSharePayload } from '../lib/mpSync/recruitmentShareCopy'
import { readPrProfile } from '../lib/mpSync/userProfile'
import PageHero from '../components/ui/PageHero'
import HallCityFilter from '../components/mp/HallCityFilter'
import RecruitmentShareSheet from '../components/mp/RecruitmentShareSheet'
import { countPendingVideos, countVideos } from '../lib/mpRecruitment/prOrderVideoCounts'

type Tab = 'published' | 'drafts' | 'deleted'

const TARGET_FILTERS = [
  { id: 'all', label: '全部身份' },
  { id: 'talent', label: '达人' },
  { id: 'shoot', label: '拍摄' },
  { id: 'edit', label: '剪辑' },
] as const

const PR_ORDER_STATUS_FILTERS = [
  { value: HALL_DEFAULT_STATUS_FILTER, label: '招募中/收集中' },
  { value: '全部', label: '全部状态' },
  { value: '招募中', label: '招募中' },
  { value: '收集中', label: '收集中' },
  { value: '已截止', label: '已截止' },
  { value: '已停止', label: '已停止' },
  { value: '已完成', label: '已完成' },
] as const

type PrOrderRow = ReturnType<typeof listFilters.enrichMpOrderListItem> & {
  mpOrderId: string
  hallLabel: string
  platform: string
  region: string
  category: string
  recruitTarget: 'talent' | 'shoot' | 'edit'
  mp: Record<string, unknown> | null
  isRemovedFromRegistry: boolean
  isDeleted: boolean
  deletedAt?: string
  publishedAt?: string
  pendingVideoCount: number
  videoCount: number
}

function deliveryWindowLabel(id: string) {
  return DELIVERY_WINDOWS.find((w) => w.id === id)?.label || '招募大厅'
}

function recruitTargetLabel(t: string) {
  if (t === 'shoot') return '拍摄'
  if (t === 'edit') return '剪辑'
  return '达人'
}

export default function PrOrdersPage() {
  const acc = getAccount()
  const [search, setSearch] = useSearchParams()
  const tabParam = search.get('tab')
  const tab: Tab =
    tabParam === 'drafts' ? 'drafts' : tabParam === 'deleted' ? 'deleted' : 'published'

  const [rows, setRows] = useState<PrOrderRow[]>([])
  const [drafts, setDrafts] = useState<PublishWizardDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [togglingId, setTogglingId] = useState('')
  const [deletingId, setDeletingId] = useState('')
  const [sharingId, setSharingId] = useState('')
  const [shareSheet, setShareSheet] = useState<{ text: string; title: string } | null>(null)
  const [filterTarget, setFilterTarget] = useState('all')
  const [filterPlatform, setFilterPlatform] = useState('全部')
  const [filterCategory, setFilterCategory] = useState('全部')
  const [filterHall, setFilterHall] = useState('全部')
  const [filterProvince, setFilterProvince] = useState('全部')
  const [filterCity, setFilterCity] = useState('全部')
  const [filterStatus, setFilterStatus] = useState<string>(HALL_DEFAULT_STATUS_FILTER)
  const [filterKeyword, setFilterKeyword] = useState('')

  const refreshDrafts = useCallback(() => {
    setDrafts(listPublishDrafts())
  }, [])

  async function loadPublished() {
    setErr('')
    try {
      await syncClientStateWithServer().catch(() => null)
      const reg = await fetchMpRegistry({ includePrOwned: true })
      const mpList = (Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []) as Record<
        string,
        unknown
      >[]
      cachePublishedOrdersFromMpList(mpList)
      pruneOrphanPublishedOrders(mpList)
      const local = listPublishedOrdersForCurrentPr(mpList)
      if (!local.length) {
        setRows([])
        return
      }
      setRows(
        local.map((item) => {
          const mp = mpList.find((o) => o && o.id === item.mpOrderId) as Record<string, unknown> | undefined
          if (mp) {
            touchPublishedOrderSnapshot(item.mpOrderId, {
              title: String(mp.title || mp.customerName || item.title || item.mpOrderId),
              lastStatus: String(mp.status || 'open'),
              hall: mp.hall === 'urgent' || mp.urgent ? 'urgent' : mp.hall === 'ice' || mp.orderKind === 'ice' ? 'ice' : 'normal',
            })
          }
          const enriched = listFilters.enrichMpOrderListItem(mp || null, item)
          return {
            ...enriched,
            mpOrderId: item.mpOrderId,
            hallLabel: enriched.hallLabel as string,
            platform: enriched.platform as string,
            region: String(mp?.region || mp?.storeName || ''),
            category: String(mp?.category || '本地生活'),
            recruitTarget: enriched.recruitTarget as 'talent' | 'shoot' | 'edit',
            mp: mp || null,
            isRemovedFromRegistry: Boolean(enriched.isRemovedFromRegistry),
            isDeleted: Boolean(enriched.isDeleted),
            deletedAt: item.deletedAt,
            pendingVideoCount: countPendingVideos(mp || null),
            videoCount: countVideos(mp || null),
          }
        }),
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败')
      const fallback = readPublishedOrders()
      setRows(
        fallback.map((item) => {
          const enriched = listFilters.enrichMpOrderListItem(null, item)
          return {
            ...enriched,
            mpOrderId: item.mpOrderId,
            hallLabel: enriched.hallLabel as string,
            platform: '抖音',
            region: '',
            category: '本地生活',
            recruitTarget: 'talent' as const,
            mp: null,
            isRemovedFromRegistry: Boolean(enriched.isRemovedFromRegistry),
            isDeleted: Boolean(enriched.isDeleted),
            deletedAt: item.deletedAt,
            pendingVideoCount: 0,
            videoCount: 0,
          }
        }),
      )
    }
  }

  async function load() {
    setLoading(true)
    refreshDrafts()
    await loadPublished()
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [refreshDrafts])

  const { activeRows, deletedRows } = useMemo(() => {
    const active: PrOrderRow[] = []
    const deleted: PrOrderRow[] = []
    for (const row of rows) {
      if (row.isDeleted || row.deletedAt) deleted.push(row)
      else active.push(row)
    }
    deleted.sort((a, b) => {
      const ta = Date.parse(String(a.deletedAt || '').replace(/\//g, '-')) || 0
      const tb = Date.parse(String(b.deletedAt || '').replace(/\//g, '-')) || 0
      return tb - ta
    })
    return { activeRows: active, deletedRows: deleted }
  }, [rows])

  const filteredRows = useMemo(() => {
    const source = tab === 'deleted' ? deletedRows : activeRows
    return source.filter((row) => {
      if (tab === 'deleted') {
        return matchListKeyword(row as Record<string, unknown>, filterKeyword)
      }
      if (filterTarget !== 'all' && row.recruitTarget !== filterTarget) return false
      if (!hallFilters.matchPlatform(row.platform, filterPlatform)) return false
      if (!hallFilters.matchCategory(row.category, filterCategory)) return false
      if (!hallFilters.matchHallType(row.hallLabel, filterHall)) return false
      if (!hallFilters.matchRegionFilter(row.region, '', filterProvince, filterCity)) return false
      if (!matchHallStatusFilter(String(row.statusLabel || ''), filterStatus)) return false
      if (!matchListKeyword(row as Record<string, unknown>, filterKeyword)) return false
      return true
    })
  }, [
    activeRows,
    deletedRows,
    tab,
    filterTarget,
    filterPlatform,
    filterCategory,
    filterHall,
    filterProvince,
    filterCity,
    filterStatus,
    filterKeyword,
  ])

  const filteredDrafts = useMemo(() => {
    const kw = filterKeyword.trim()
    if (!kw) return drafts
    return drafts.filter((draft) =>
      matchListKeyword(
        {
          title: draftDisplayTitle(draft),
          recruitModeLabel: draft.recruitModeLabel,
        },
        kw,
        [draft.form?.title, draft.form?.shootLocation, ...(draft.form?.selectedCities || [])],
      ),
    )
  }, [drafts, filterKeyword])

  function setTab(next: Tab) {
    if (next === 'published') setSearch({})
    else setSearch({ tab: next })
  }

  function onDeleteDraft(id: string) {
    if (!confirm('确定删除该草稿？删除后不可恢复。')) return
    deletePublishDraft(id)
    refreshDrafts()
  }

  async function onShare(row: PrOrderRow) {
    if (sharingId) return
    const order = row.mp || {
      id: row.mpOrderId,
      title: row.title,
      region: '全国',
      recruitmentInfo: '',
    }
    setSharingId(row.mpOrderId)
    try {
      const payload = await prepareRecruitmentSharePayload(order as Record<string, unknown>, readPrProfile())
      setShareSheet(payload)
    } catch (e) {
      alert(e instanceof Error ? e.message : '分享失败')
    } finally {
      setSharingId('')
    }
  }

  async function onToggle(row: PrOrderRow) {
    if (!row.canToggleRecruit || togglingId) return
    const next = row.toggleNextStatus as string
    if (!confirm(next === 'closed' ? '停止后达人将无法继续报名，已报名数据保留。' : '开始后将在招募大厅重新展示。')) return
    setTogglingId(row.mpOrderId)
    try {
      await patchMpRecruitmentOrder({ id: row.mpOrderId, status: next })
      await loadPublished()
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败')
    } finally {
      setTogglingId('')
    }
  }

  async function onDeletePublished(row: PrOrderRow) {
    if (deletingId) return
    if (
      !confirm('删除后达人将无法在招募大厅看到该单，已报名信息将一并移除。确定删除？')
    ) {
      return
    }
    setDeletingId(row.mpOrderId)
    try {
      await deleteMpRecruitmentOrder(row.mpOrderId)
      markPublishedOrderDeleted(row.mpOrderId)
      await loadPublished()
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败')
    } finally {
      setDeletingId('')
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <PageHero
        title="我的发单"
        subtitle="管理已发布招募单与草稿，支持按身份、状态、平台、城市、类目与大厅类型筛选。"
        badge={
          tab === 'published'
            ? `${filteredRows.length} 条发单`
            : tab === 'deleted'
              ? `${filteredRows.length} 条已删除`
              : `${drafts.length} 草稿`
        }
      >
        <Link
          to="/publish"
          className="inline-flex px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500"
        >
          发布招募
        </Link>
      </PageHero>
      <p className="text-sm text-[var(--shell-muted)] px-1">
        PR ID：<span className="text-amber-500 font-mono">{acc?.lingqiPrId || '—'}</span>
      </p>

      <div className="flex gap-2 p-1 rounded-xl panel-input border max-w-xl">
        <button
          type="button"
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'published' ? 'bg-violet-600 text-white' : 'panel-tab'
          }`}
          onClick={() => setTab('published')}
        >
          已发布招募单
          {!loading && activeRows.length ? (
            <span className="ml-1 text-xs opacity-80">({activeRows.length})</span>
          ) : null}
        </button>
        <button
          type="button"
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'drafts' ? 'bg-violet-600 text-white' : 'panel-tab'
          }`}
          onClick={() => setTab('drafts')}
        >
          草稿箱
          {!loading && drafts.length ? <span className="ml-1 text-xs opacity-80">({drafts.length})</span> : null}
        </button>
        <button
          type="button"
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'deleted' ? 'bg-violet-600 text-white' : 'panel-tab'
          }`}
          onClick={() => setTab('deleted')}
        >
          已删除
          {!loading && deletedRows.length ? (
            <span className="ml-1 text-xs opacity-80">({deletedRows.length})</span>
          ) : null}
        </button>
      </div>

      {(tab === 'published' && activeRows.length > 0) ||
      (tab === 'deleted' && deletedRows.length > 0) ||
      (tab === 'drafts' && drafts.length > 0) ? (
        <input
          className="w-full rounded-lg panel-input px-3 py-2.5 text-sm border"
          placeholder={
            tab === 'drafts'
              ? '搜索草稿标题、门店、城市'
              : tab === 'deleted'
                ? '搜索已删除招募标题、单号'
                : '搜索招募标题、城市、单号'
          }
          value={filterKeyword}
          onChange={(e) => setFilterKeyword(e.target.value)}
        />
      ) : null}

      {tab === 'published' && activeRows.length > 0 ? (
        <div className="filter-strip rounded-xl border p-3 space-y-2">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-[var(--shell-muted)]">身份</span>
            {TARGET_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`px-3 py-1.5 rounded-lg text-sm ${filterTarget === f.id ? 'bg-violet-600 text-white' : 'panel-tab'}`}
                onClick={() => setFilterTarget(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center text-sm">
            <select
              className="rounded-lg panel-input border px-2 py-1.5"
              value={filterPlatform}
              onChange={(e) => setFilterPlatform(e.target.value)}
            >
              {hallFilters.PLATFORM_FILTERS.map((p) => (
                <option key={p} value={p}>{p === '全部' ? '全部平台' : p}</option>
              ))}
            </select>
            <select
              className="rounded-lg panel-input border px-2 py-1.5"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              {hallFilters.CATEGORY_FILTERS.map((c) => (
                <option key={c} value={c}>{c === '全部' ? '全部类目' : c}</option>
              ))}
            </select>
            <select
              className="rounded-lg panel-input border px-2 py-1.5"
              value={filterHall}
              onChange={(e) => setFilterHall(e.target.value)}
            >
              {hallFilters.HALL_TYPE_FILTERS.map((h) => (
                <option key={h} value={h}>{h === '全部' ? '全部大厅' : h}</option>
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
            <select
              className="rounded-lg panel-input border px-2 py-1.5"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              {PR_ORDER_STATUS_FILTERS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          {filteredRows.length !== activeRows.length ? (
            <p className="text-xs text-[var(--shell-muted)]">显示 {filteredRows.length} / {activeRows.length} 条</p>
          ) : null}
        </div>
      ) : null}

      {loading ? <p className="text-[var(--shell-muted)]">加载中…</p> : null}
      {err && tab === 'published' ? <p className="text-amber-600 text-sm">{err}</p> : null}

      {tab === 'published' ? (
        <>
          {!loading && !activeRows.length ? (
            <div className="surface-card rounded-xl border p-6 text-center text-[var(--shell-muted)] text-sm">
              <p>暂无已发布招募单</p>
              <p className="mt-2 text-xs">发布招募成功后会出现在此处；也可在小程序发单后同步到本机</p>
              <Link to="/publish" className="inline-block mt-4 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm">
                去发布招募
              </Link>
            </div>
          ) : null}
          {!loading && activeRows.length && !filteredRows.length ? (
            <p className="text-sm text-[var(--shell-muted)] text-center py-6">
              当前筛选条件下暂无招募单
              {filterStatus !== '全部' ? '，可尝试将状态改为「全部状态」' : ''}
              {activeRows.some((r) => r.isRemovedFromRegistry) ? '；部分发单可能尚未同步到服务器，请刷新页面或重新发布' : ''}
            </p>
          ) : null}
          <div className="space-y-3">
            {filteredRows.map((row) => (
              <article
                key={row.mpOrderId}
                className={`surface-card rounded-xl border p-4${row.isRemovedFromRegistry ? ' opacity-75' : ''}`}
              >
                <div className="flex justify-between gap-2 items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-xs text-violet-500">{row.hallLabel}</span>
                      {row.isRemovedFromRegistry ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">未同步</span>
                      ) : null}
                      <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{recruitTargetLabel(row.recruitTarget)}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{row.platform}</span>
                    </div>
                    <h3 className="font-semibold mt-1 text-[var(--shell-text)]">{row.title}</h3>
                    <p className="text-xs text-[var(--shell-muted)] mt-2">
                      {row.region || '—'} · {row.category} · {row.signupLabel} · {row.deadlineDaysText}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-white/10 shrink-0">{row.statusLabel}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!row.isRemovedFromRegistry ? (
                    <>
                      <Link
                        to={`/orders/${encodeURIComponent(row.mpOrderId)}/applicants`}
                        className="text-sm px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-500"
                      >
                        报名管理
                        {row.applicantCount ? <span className="ml-1 opacity-80">({row.applicantCount})</span> : null}
                      </Link>
                      <Link
                        to={`/publish?edit=${encodeURIComponent(row.mpOrderId)}`}
                        className="text-sm px-3 py-1.5 rounded-lg border border-violet-500/40 text-violet-600 hover:bg-violet-50"
                      >
                        编辑招募
                      </Link>
                      <Link
                        to={`/orders/${encodeURIComponent(row.mpOrderId)}/video-review`}
                        className={`text-sm px-3 py-1.5 rounded-lg border ${
                          row.pendingVideoCount > 0
                            ? 'border-amber-950/35 text-amber-950 hover:bg-amber-950/5 font-semibold'
                            : 'border-amber-500/40 text-amber-700 hover:bg-amber-50'
                        }`}
                      >
                        视频审核
                        {row.videoCount > 0 ? (
                          <span className="ml-1 opacity-90">({row.videoCount})</span>
                        ) : null}
                      </Link>
                      <button
                        type="button"
                        disabled={sharingId === row.mpOrderId}
                        className="text-sm px-3 py-1.5 rounded-lg border border-[var(--shell-border)] disabled:opacity-50"
                        onClick={() => void onShare(row)}
                      >
                        {sharingId === row.mpOrderId ? '生成中…' : '分享'}
                      </button>
                      {row.canToggleRecruit ? (
                        <button
                          type="button"
                          disabled={togglingId === row.mpOrderId}
                          className="text-sm px-3 py-1.5 rounded-lg border border-[var(--shell-border)]"
                          onClick={() => void onToggle(row)}
                        >
                          {row.toggleActionLabel}招募
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={deletingId === row.mpOrderId}
                        className="text-sm px-3 py-1.5 rounded-lg border border-red-500/40 text-red-600 hover:bg-red-50"
                        onClick={() => void onDeletePublished(row)}
                      >
                        删除
                      </button>
                    </>
                  ) : (
                    <p className="text-xs text-[var(--shell-muted)]">该发单已从招募大厅移除，仅保留历史记录</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      ) : tab === 'deleted' ? (
        <>
          {!loading && !deletedRows.length ? (
            <div className="surface-card rounded-xl border p-6 text-center text-[var(--shell-muted)] text-sm">
              <p>暂无已删除发单</p>
              <p className="mt-2 text-xs">在「已发布招募单」中删除的发单会保留在此处，便于查阅历史记录</p>
            </div>
          ) : null}
          {!loading && deletedRows.length && !filteredRows.length ? (
            <p className="text-sm text-[var(--shell-muted)] text-center py-6">当前搜索条件下暂无已删除发单</p>
          ) : null}
          <div className="space-y-3">
            {filteredRows.map((row) => (
              <article key={row.mpOrderId} className="surface-card rounded-xl border p-4 opacity-90">
                <div className="flex justify-between gap-2 items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-xs text-violet-500">{row.hallLabel}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        {recruitTargetLabel(row.recruitTarget)}
                      </span>
                      {row.platform !== '—' ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{row.platform}</span>
                      ) : null}
                    </div>
                    <h3 className="font-semibold mt-1 text-[var(--shell-text)]">{row.title}</h3>
                    <p className="text-xs text-[var(--shell-muted)] mt-2">
                      删除于 {row.deletedAt || '—'}
                      {row.publishedAt ? ` · 原发布于 ${row.publishedAt}` : ''}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 shrink-0">已删除</span>
                </div>
                <p className="mt-3 text-xs text-[var(--shell-muted)]">该发单已从招募大厅移除，仅保留本地历史记录</p>
              </article>
            ))}
          </div>
        </>
      ) : (
        <>
          {!loading && drafts.length && !filteredDrafts.length ? (
            <p className="text-sm text-[var(--shell-muted)] text-center py-6">当前搜索条件下暂无草稿</p>
          ) : null}
          {!loading && !drafts.length ? (
            <div className="surface-card rounded-xl border p-6 text-center text-[var(--shell-muted)] text-sm">
              <p>草稿箱为空</p>
              <p className="mt-2 text-xs">在「发布招募」填写表单后点击「保存草稿」，会出现在此处</p>
              <Link to="/publish" className="inline-block mt-4 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm">
                去发布招募
              </Link>
            </div>
          ) : null}
          <div className="space-y-3">
            {filteredDrafts.map((draft) => (
              <article key={draft.id} className="surface-card rounded-xl border border-amber-500/25 p-4">
                <div className="flex justify-between gap-2 items-start">
                  <div>
                    <span className="text-xs text-amber-500/90">草稿</span>
                    <h3 className="font-semibold mt-1">{draftDisplayTitle(draft)}</h3>
                    <p className="text-xs text-[var(--shell-muted)] mt-2">
                      {draft.recruitModeLabel || '招募'} · {deliveryWindowLabel(draft.form.deliveryWindow)} · 保存于{' '}
                      {formatDraftSavedAt(draft.savedAt)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    to={`/publish?draft=${encodeURIComponent(draft.id)}`}
                    className="text-sm px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-500"
                  >
                    继续编辑
                  </Link>
                  <button
                    type="button"
                    className="text-sm px-3 py-1.5 rounded-lg border border-[var(--shell-border)]"
                    onClick={() => onDeleteDraft(draft.id)}
                  >
                    删除
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {shareSheet ? (
        <RecruitmentShareSheet
          text={shareSheet.text}
          title={shareSheet.title}
          onClose={() => setShareSheet(null)}
        />
      ) : null}
    </div>
  )
}
