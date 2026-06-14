import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { readApplications, updateApplicationApplicantId, type ApplicationLocal } from '../lib/mpSync/applicationsStore'
import { fetchRegistryAndReconcileApplications } from '../lib/mpSync/applicationsRegistrySync'
import { uploadAndSubmitRecruitmentVideo } from '../lib/mpSync/recruitmentVideo'
import { resolveOrderCoverUrl } from '../lib/mpSync/recruitCoverLibrary'
import {
  APPLICATION_TIME_FILTERS,
  CATEGORY_FILTERS,
  filterApplicationRows,
  type ApplicationTimeFilterId,
} from '../lib/mpRecruitment/applicationFilters'
import { PLATFORM_FILTERS } from '../lib/mpRecruitment/hallFilters'
import {
  canTalentUploadRecruitmentVideo,
  matchTalentApplicationTab,
  resolveApplicationDisplayStatus,
  resolveTalentApplicationProgress,
  TALENT_APPLICATION_TABS,
  type TalentAppTabId,
} from '../lib/mpRecruitment/talentApplicationStatus'
import { findMyApplicant } from '../lib/mpSync/talentContactPrGate'
import { buildNotifiedApplicantIdSet } from '../lib/mpSync/applicantListExtras'
import { mapMpOrderRow } from '../lib/mpRecruitment/orderCard'
import type { MpRegistry } from '../lib/mpRecruitment/types'
import PrOrdersPage from './PrOrdersPage'
import ApplicationOrderCard from '../components/mp/ApplicationOrderCard'
import HallCityFilter from '../components/mp/HallCityFilter'
import { EmptyState } from '../components/ui/MockupLayouts'
import { getActiveRole } from '../lib/mpSession'

type EnrichedApplication = ApplicationLocal & {
  region?: string
  category?: string
  statusLabel?: string
  coverUrl?: string
  scheduleText?: string
  deadlineMs?: number
  videoStatus?: string
  videoRejectReason?: string
  canUploadVideo?: boolean
  isIce?: boolean
  iceActionLabel?: string
  progressId?: string
  progressLabel?: string
  videoStatusLabel?: string
  selectionNotified?: boolean
  displayStatus?: ReturnType<typeof resolveApplicationDisplayStatus>
  _progressMp?: Record<string, unknown> | null
  _progressMe?: Record<string, unknown> | null
}

function formatScheduleText(deadlineMs?: number, publishedAtMs?: number): string {
  const fmt = (ms: number) => {
    const d = new Date(ms)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  if (deadlineMs && publishedAtMs) return `${fmt(publishedAtMs)} ~ ${fmt(deadlineMs)}`
  if (deadlineMs) return fmt(deadlineMs)
  return '档期协商中'
}

/** 达人：我的报名；PR：我的发单 */
export default function OrdersPage() {
  const role = getActiveRole()
  if (role === 'pr') return <PrOrdersPage />
  return <TalentApplicationsPage />
}

function TalentApplicationsPage() {
  const [apps, setApps] = useState<EnrichedApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadingKey, setUploadingKey] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const pendingUpload = useRef<EnrichedApplication | null>(null)
  const [filterTab, setFilterTab] = useState<TalentAppTabId>('registered')
  const [timeFilter, setTimeFilter] = useState<ApplicationTimeFilterId>('all')
  const [filterPlatform, setFilterPlatform] = useState('全部')
  const [filterCategory, setFilterCategory] = useState('全部')
  const [filterProvince, setFilterProvince] = useState('全部')
  const [filterCity, setFilterCity] = useState('全部')

  function enrichApplicationRow(a: ApplicationLocal, mp: Record<string, unknown> | undefined, reg: Record<string, unknown>) {
    const isIceFromId = /^MP-ICE-/i.test(String(a.mpOrderId || ''))
    if (!mp) {
      const displayStatus = resolveApplicationDisplayStatus(null, null, a.mpOrderId, { isIce: isIceFromId })
      const progress = resolveTalentApplicationProgress(null, null, a.mpOrderId)
      return {
        ...a,
        title: a.title || a.mpOrderId,
        isIce: isIceFromId,
        progressId: progress.id,
        progressLabel: progress.label,
        displayStatus,
        selectionNotified: false,
        _progressMp: null,
        _progressMe: null,
      }
    }
    const row = mapMpOrderRow(mp, reg)
    let applicantId = String(a.applicantId || '').trim()
    if (!applicantId) {
      const found = findMyApplicant(mp, a.mpOrderId)
      if (found && found.id) applicantId = String(found.id)
    }
    const applicants = Array.isArray(mp.applicants) ? (mp.applicants as Record<string, unknown>[]) : []
    let me = applicants.find((x) => x && String(x.id) === applicantId) || null
    if (!me) {
      const found = findMyApplicant(mp, a.mpOrderId)
      if (found) me = found as Record<string, unknown>
    }
    const videoStatus = me ? String(me.videoStatus || '') : ''
    const videoRejectReason = me && me.videoRejectReason ? String(me.videoRejectReason) : ''
    const isIce = row.isIce
    const canUploadVideo = canTalentUploadRecruitmentVideo(mp, me, isIce)
    const progress = resolveTalentApplicationProgress(mp, me, a.mpOrderId)
    const notifiedIds = buildNotifiedApplicantIdSet(reg as MpRegistry, a.mpOrderId, mp)
    const selectionNotified = !!(me && notifiedIds.has(String(me.id || '')))
    const displayStatus = resolveApplicationDisplayStatus(mp, me, a.mpOrderId, {
      selectionNotified,
      isIce,
    })
    let iceActionLabel = ''
    if (isIce) {
      if (progress.id === 'completed') iceActionLabel = ''
      else if (me && me.taskStatus === 'pending_confirm') iceActionLabel = '确认档期'
      else if (
        me &&
        String(me.assignedVideoDownloadUrl || '').trim() &&
        me.aiVerifyStatus !== 'passed' &&
        me.videoStatus !== 'passed'
      ) {
        iceActionLabel =
          me.aiVerifyStatus === 'failed' || me.videoStatus === 'rejected' ? '重新提交链接' : '提交链接'
      } else iceActionLabel = '查看云剪任务'
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
      coverUrl: resolveOrderCoverUrl(mp),
      scheduleText: formatScheduleText(row.deadlineMs, row.publishedAtMs),
      deadlineMs: row.deadlineMs,
      videoStatus,
      videoRejectReason,
      canUploadVideo,
      isIce,
      iceActionLabel,
      progressId: progress.id,
      progressLabel: progress.label,
      selectionNotified,
      displayStatus,
      _progressMp: mp,
      _progressMe: me,
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
      const reg = await fetchRegistryAndReconcileApplications({ includeLocalContext: true })
      const localAfter = readApplications()
      const mpList = (Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []) as Record<string, unknown>[]
      const enriched: EnrichedApplication[] = localAfter.map((a) => {
        const mp = mpList.find((o) => o && String(o.id) === a.mpOrderId)
        const row = enrichApplicationRow(a, mp, reg as Record<string, unknown>)
        if (row.applicantId && row.applicantId !== a.applicantId) {
          updateApplicationApplicantId(a.mpOrderId, row.applicantId)
        }
        return row
      })
      setApps(enriched)
    } catch {
      setApps(local.map((a) => enrichApplicationRow(a, undefined, {})))
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
      try {
        const reg = await fetchRegistryAndReconcileApplications({ includeLocalContext: true })
        const local = readApplications()
        const mpList = (Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []) as Record<
          string,
          unknown
        >[]
        const enriched: EnrichedApplication[] = local.map((a) => {
          const mp = mpList.find((o) => o && String(o.id) === a.mpOrderId)
          const row = enrichApplicationRow(a, mp, reg as Record<string, unknown>)
          if (row.applicantId && row.applicantId !== a.applicantId) {
            updateApplicationApplicantId(a.mpOrderId, row.applicantId)
          }
          return row
        })
        if (!cancelled) setApps(enriched)
      } catch {
        const local = readApplications()
        if (!cancelled) setApps(local.map((a) => enrichApplicationRow(a, undefined, {})))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const byTab = apps.filter((a) =>
      matchTalentApplicationTab(filterTab, a._progressMp || null, a._progressMe || null, a.mpOrderId, {
        selectionNotified: a.selectionNotified,
        isIce: a.isIce,
      }),
    )
    return filterApplicationRows(byTab, {
      timeFilter,
      platform: filterPlatform,
      category: filterCategory,
      province: filterProvince,
      city: filterCity,
    })
  }, [apps, filterTab, timeFilter, filterPlatform, filterCategory, filterProvince, filterCity])

  const timeFilterLabel =
    APPLICATION_TIME_FILTERS.find((t) => t.id === timeFilter)?.label.replace('全部时间', '时间') || '时间'

  const detailHref = (mpOrderId: string) => `/recruitment/${encodeURIComponent(mpOrderId)}?applied=1`
  const detailReturnState = { returnTo: '/orders' }

  return (
    <div className="page-content-shell page-content-shell--wide orders-page">
      <input
        ref={fileRef}
        type="file"
        accept="video/mp4,video/quicktime,video/*"
        className="hidden"
        onChange={(e) => void onVideoFileChange(e)}
      />

      <header className="orders-page__head">
        <div>
          <h1 className="orders-page__title">我的报名</h1>
          <p className="orders-page__subtitle">MY APPLICATIONS</p>
        </div>
        <Link to="/hall?tab=hall" className="orders-page__hall-link">
          去招募大厅
        </Link>
      </header>

      <div className="orders-page__tabs" role="tablist">
        {TALENT_APPLICATION_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={filterTab === t.id}
            className={`orders-page__tab ${filterTab === t.id ? 'orders-page__tab--active' : ''}`}
            onClick={() => setFilterTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {apps.length > 0 ? (
        <div className="orders-page__filters">
          <label className="orders-page__filter-cell">
            <span className="orders-page__filter-label">{timeFilterLabel}</span>
            <select
              className="orders-page__filter-select"
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value as ApplicationTimeFilterId)}
            >
              {APPLICATION_TIME_FILTERS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="orders-page__filter-cell">
            <span className="orders-page__filter-label">平台</span>
            <select
              className="orders-page__filter-select"
              value={filterPlatform}
              onChange={(e) => setFilterPlatform(e.target.value)}
            >
              {PLATFORM_FILTERS.map((p) => (
                <option key={p} value={p}>
                  {p === '全部' ? '平台' : p}
                </option>
              ))}
            </select>
          </label>
          <label className="orders-page__filter-cell">
            <span className="orders-page__filter-label">类目</span>
            <select
              className="orders-page__filter-select"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              {CATEGORY_FILTERS.map((c) => (
                <option key={c} value={c}>
                  {c === '全部' ? '类目' : c}
                </option>
              ))}
            </select>
          </label>
          <div className="orders-page__filter-cell orders-page__filter-cell--region">
            <span className="orders-page__filter-label">城市</span>
            <HallCityFilter
              bare
              province={filterProvince}
              city={filterCity}
              onChange={(province, city) => {
                setFilterProvince(province)
                setFilterCity(city)
              }}
            />
          </div>
        </div>
      ) : null}

      {loading ? <p className="orders-page__hint">加载报名记录…</p> : null}

      {!loading && !apps.length ? (
        <EmptyState
          title="暂无报名记录"
          desc="去招募大厅挑选商单，一键提交报名后会出现在这里"
          action={
            <Link to="/hall?tab=hall" className="btn-mockup btn-mockup--primary no-underline">
              浏览招募大厅
            </Link>
          }
        />
      ) : null}

      {!loading && apps.length && !filtered.length ? (
        <EmptyState title="当前筛选下暂无报名" desc="可切换状态 Tab 或调整筛选条件后重试" />
      ) : null}

      <div className="orders-page__list">
        {filtered.map((a) => {
          const ds = a.displayStatus || resolveApplicationDisplayStatus(a._progressMp || null, a._progressMe || null, a.mpOrderId)
          const href = detailHref(a.mpOrderId)
          const confirmLabel =
            ds.showCheckInBtn
              ? '到店签到'
              : ds.showAssignConfirmBtn
                ? '确认排期'
                : ds.showConfirmBtn
                  ? '确认档期'
                  : a.isIce && a.iceActionLabel && a.progressId !== 'completed'
                    ? a.iceActionLabel
                    : undefined
          const extraAction =
            a.canUploadVideo ? (
              <button
                type="button"
                className="app-order-card__btn app-order-card__btn--primary"
                disabled={uploadingKey === `${a.mpOrderId}-${a.applicantId}`}
                onClick={() => onPickVideo(a)}
              >
                {uploadingKey === `${a.mpOrderId}-${a.applicantId}`
                  ? '上传中…'
                  : a.videoStatus === 'rejected'
                    ? '重新上传视频'
                    : '上传视频'}
              </button>
            ) : null
          return (
            <ApplicationOrderCard
              key={`${a.mpOrderId}-${a.applicantId}`}
              title={a.title || a.mpOrderId}
              coverUrl={a.coverUrl}
              region={a.region}
              scheduleText={a.scheduleText}
              statusLabel={ds.label}
              statusTone={ds.tone}
              appliedAt={a.appliedAt}
              detailHref={href}
              detailState={detailReturnState}
              confirmLabel={confirmLabel}
              confirmHref={confirmLabel ? href : undefined}
              confirmState={confirmLabel ? detailReturnState : undefined}
              extraAction={extraAction}
            />
          )
        })}
      </div>
    </div>
  )
}
