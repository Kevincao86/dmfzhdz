import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchMpRegistry } from '../lib/mpApi'
import { getAccount, getActiveRole } from '../lib/mpSession'
import { readApplications, type ApplicationLocal } from '../lib/mpSync/applicationsStore'
import { uploadAndSubmitRecruitmentVideo, videoStatusLabel } from '../lib/mpSync/recruitmentVideo'
import {
  APPLICATION_TIME_FILTERS,
  matchApplicationTimeFilter,
  parseAppliedAtMs,
  type ApplicationTimeFilterId,
} from '../lib/mpRecruitment/applicationFilters'
import * as hallFilters from '../lib/mpRecruitment/hallFilters'
import { matchListKeyword } from '../lib/mpRecruitment/listKeywordSearch'
import { findMyApplicant } from '../lib/mpSync/talentContactPrGate'
import { mapMpOrderRow } from '../lib/mpRecruitment/orderCard'
import PrOrdersPage from './PrOrdersPage'
import PageHero from '../components/ui/PageHero'
import HallCityFilter from '../components/mp/HallCityFilter'

type EnrichedApplication = ApplicationLocal & {
  region?: string
  category?: string
  statusLabel?: string
  videoStatus?: string
  videoRejectReason?: string
  canUploadVideo?: boolean
  isIce?: boolean
  iceActionLabel?: string
}

/** 达人：我的报名；PR：我的发单 */
export default function OrdersPage() {
  const role = getActiveRole()
  if (role === 'pr') return <PrOrdersPage />
  return <TalentApplicationsPage />
}

function TalentApplicationsPage() {
  const acc = getAccount()
  const [apps, setApps] = useState<EnrichedApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadingKey, setUploadingKey] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const pendingUpload = useRef<EnrichedApplication | null>(null)
  const [filterTime, setFilterTime] = useState<ApplicationTimeFilterId>('all')
  const [filterCategory, setFilterCategory] = useState('全部')
  const [filterProvince, setFilterProvince] = useState('全部')
  const [filterCity, setFilterCity] = useState('全部')
  const [filterKeyword, setFilterKeyword] = useState('')

  function enrichApplicationRow(a: ApplicationLocal, mp: Record<string, unknown> | undefined, reg: Record<string, unknown>) {
    if (!mp) return { ...a }
    const row = mapMpOrderRow(mp, reg)
    let applicantId = String(a.applicantId || '').trim()
    if (!applicantId) {
      const found = findMyApplicant(mp, a.mpOrderId)
      if (found && found.id) applicantId = String(found.id)
    }
    const applicants = Array.isArray(mp.applicants) ? (mp.applicants as Record<string, unknown>[]) : []
    const me = applicants.find((x) => x && String(x.id) === applicantId)
    const videoStatus = me ? String(me.videoStatus || '') : ''
    const videoRejectReason = me && me.videoRejectReason ? String(me.videoRejectReason) : ''
    const isIce = row.isIce
    const canUploadVideo = !isIce && (!videoStatus || videoStatus === 'rejected')
    let iceActionLabel = ''
    if (isIce && me) {
      const assigned = String(me.assignedVideoDownloadUrl || '').trim()
      const verified = me.aiVerifyStatus === 'passed'
      const pendingConfirm = me.taskStatus === 'pending_confirm' || (!me.taskStatus && !assigned)
      if (pendingConfirm) iceActionLabel = '确认接收'
      else if (assigned && !verified) iceActionLabel = '提交链接'
      else iceActionLabel = '查看云剪任务'
    }
    return {
      ...a,
      applicantId,
      title: a.title || row.title,
      platform: a.platform || row.platform,
      region: row.region,
      category: row.category,
      statusLabel: row.statusLabel,
      merchantName: row.merchantName,
      storeName: row.storeName,
      budgetText: row.budgetText,
      merchantOrderNo: String(mp.sourceMerchantOrderId || ''),
      videoStatus,
      videoRejectReason,
      canUploadVideo,
      isIce,
      iceActionLabel,
    }
  }

  async function reloadApps() {
    try {
      const { syncClientStateWithServer } = await import('../lib/mpAccountClientSync')
      await syncClientStateWithServer().catch(() => null)
    } catch {
      /* ignore */
    }
    const local = readApplications()
    try {
      const reg = await fetchMpRegistry()
      const mpList = (Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []) as Record<string, unknown>[]
      const enriched: EnrichedApplication[] = local.map((a) => {
        const mp = mpList.find((o) => o && String(o.id) === a.mpOrderId)
        return enrichApplicationRow(a, mp, reg)
      })
      setApps(enriched)
    } catch {
      setApps(local)
    }
  }

  function onPickVideo(app: EnrichedApplication) {
    if (!app.applicantId) {
      alert('缺少报名 ID，请重新报名后再上传')
      return
    }
    pendingUpload.current = app
    fileRef.current?.click()
  }

  async function onVideoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const app = pendingUpload.current
    e.target.value = ''
    pendingUpload.current = null
    if (!file || !app?.mpOrderId || !app.applicantId) return
    const key = `${app.mpOrderId}-${app.applicantId}`
    setUploadingKey(key)
    try {
      await uploadAndSubmitRecruitmentVideo(file, app.mpOrderId, app.applicantId)
      alert('视频已提交，请等待 PR 审核')
      await reloadApps()
    } catch (err) {
      alert(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploadingKey('')
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const local = readApplications()
      try {
        const reg = await fetchMpRegistry()
        const mpList = (Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []) as Record<
          string,
          unknown
        >[]
        const enriched: EnrichedApplication[] = local.map((a) => {
          const mp = mpList.find((o) => o && String(o.id) === a.mpOrderId)
          return enrichApplicationRow(a, mp, reg)
        })
        if (!cancelled) setApps(enriched)
      } catch {
        if (!cancelled) setApps(local)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const uploadInput = (
    <input
      ref={fileRef}
      type="file"
      accept="video/mp4,video/quicktime,video/*"
      className="hidden"
      onChange={(e) => void onVideoFileChange(e)}
    />
  )

  const filtered = useMemo(() => {
    return apps.filter((a) => {
      const ms = parseAppliedAtMs(a.appliedAt)
      if (!matchApplicationTimeFilter(ms, filterTime)) return false
      if (!hallFilters.matchCategory(a.category || '', filterCategory)) return false
      if (!hallFilters.matchRegionFilter(a.region || '', '', filterProvince, filterCity)) return false
      if (!matchListKeyword(a as Record<string, unknown>, filterKeyword)) return false
      return true
    })
  }, [apps, filterTime, filterCategory, filterProvince, filterCity, filterKeyword])

  return (
    <div className="max-w-3xl space-y-4">
      {uploadInput}
      <PageHero
        title="我的报名"
        subtitle="查看已提交的招募报名，可按时间、类目与城市筛选，快速回到商单详情。"
        badge={`${filtered.length} 条记录`}
      >
        <Link
          to="/hall"
          className="inline-flex items-center px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 transition-colors"
        >
          去招募大厅
        </Link>
      </PageHero>

      <p className="text-sm text-[var(--shell-muted)] px-1">
        灵祺达人 ID：<span className="text-amber-500 font-mono">{acc?.lingqiTalentId || '—'}</span>
      </p>

      {apps.length > 0 ? (
        <>
        <input
          className="w-full rounded-lg panel-input px-3 py-2.5 text-sm border"
          placeholder="搜索商单、门店、城市、单号"
          value={filterKeyword}
          onChange={(e) => setFilterKeyword(e.target.value)}
        />
        <div className="filter-strip rounded-xl border p-3 flex flex-wrap gap-2 items-center text-sm">
          <span className="text-xs text-[var(--shell-muted)] mr-1">筛选</span>
          <select
            className="rounded-lg panel-input border px-2 py-1.5"
            value={filterTime}
            onChange={(e) => setFilterTime(e.target.value as ApplicationTimeFilterId)}
          >
            {APPLICATION_TIME_FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg panel-input border px-2 py-1.5"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            {hallFilters.CATEGORY_FILTERS.map((c) => (
              <option key={c} value={c}>
                {c === '全部' ? '全部类目' : c}
              </option>
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
        </div>
        </>
      ) : null}

      {loading ? <p className="text-[var(--shell-muted)] text-sm px-1">加载报名记录…</p> : null}

      {!loading && !apps.length ? (
        <div className="surface-card rounded-xl border p-8 text-center">
          <p className="text-[var(--shell-muted)]">暂无报名记录</p>
          <p className="text-xs text-[var(--shell-muted)] mt-2">去招募大厅挑选商单，一键提交报名后会出现在这里</p>
          <Link
            to="/hall"
            className="inline-block mt-4 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-500"
          >
            浏览招募大厅
          </Link>
        </div>
      ) : null}

      {!loading && apps.length && !filtered.length ? (
        <p className="text-sm text-[var(--shell-muted)] text-center py-8">当前筛选条件下暂无报名</p>
      ) : null}

      <div className="space-y-3">
        {filtered.map((a) => (
          <article
            key={`${a.mpOrderId}-${a.applicantId}`}
            className="surface-card rounded-xl border p-4 hover-panel flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {a.platform ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600">{a.platform}</span>
                ) : null}
                {a.isIce ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-700">云剪任务</span>
                ) : a.category ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{a.category}</span>
                ) : null}
                {a.statusLabel ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700">
                    {a.statusLabel}
                  </span>
                ) : null}
                {a.videoStatus ? (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      a.videoStatus === 'passed'
                        ? 'bg-emerald-500/10 text-emerald-700'
                        : a.videoStatus === 'rejected'
                          ? 'bg-red-500/10 text-red-700'
                          : 'bg-amber-500/10 text-amber-700'
                    }`}
                  >
                    视频{videoStatusLabel(a.videoStatus)}
                  </span>
                ) : null}
              </div>
              <h3 className="font-semibold text-[var(--shell-text)] truncate">{a.title || a.mpOrderId}</h3>
              <p className="text-xs text-[var(--shell-muted)] mt-1.5">
                {a.region || '—'} · 报名于 {a.appliedAt || '—'}
              </p>
              {a.videoStatus === 'rejected' && a.videoRejectReason ? (
                <p className="text-xs text-red-600 mt-1.5 rounded-lg bg-red-50 px-2 py-1">
                  驳回原因：{a.videoRejectReason}
                </p>
              ) : null}
            </div>
            <div className="shrink-0 flex flex-col gap-2">
              {a.isIce && a.iceActionLabel ? (
                <Link
                  to={`/recruitment/${encodeURIComponent(a.mpOrderId)}?applied=1`}
                  className="text-sm px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-500 text-center"
                >
                  {a.iceActionLabel}
                </Link>
              ) : null}
              {a.canUploadVideo ? (
                <button
                  type="button"
                  disabled={uploadingKey === `${a.mpOrderId}-${a.applicantId}`}
                  className="text-sm px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-60"
                  onClick={() => onPickVideo(a)}
                >
                  {uploadingKey === `${a.mpOrderId}-${a.applicantId}`
                    ? '上传中…'
                    : a.videoStatus === 'rejected'
                      ? '重新上传视频'
                      : '上传视频'}
                </button>
              ) : null}
              <Link
                to={`/recruitment/${encodeURIComponent(a.mpOrderId)}?applied=1`}
                className="text-sm px-4 py-2 rounded-lg border border-violet-500/40 text-violet-600 hover:bg-violet-50 text-center"
              >
                查看招募详情
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
