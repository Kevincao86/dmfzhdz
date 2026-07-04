import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { readApplications, markApplicationWithdrawn, updateApplicationApplicantId, type ApplicationLocal } from '../lib/mpSync/applicationsStore'
import { fetchRegistryAndReconcileApplications } from '../lib/mpSync/applicationsRegistrySync'
import { flushClientStateSync } from '../lib/mpAccountClientSync'
import { cancelMpRecruitmentApply, clearMpRegistryCache } from '../lib/mpApi'
import { uploadRecruitmentVideoDraft, submitRecruitmentVideo } from '../lib/mpSync/recruitmentVideo'
import {
  openRecruitmentScriptUrl,
  readScriptTextForAi,
  saveRecruitmentScriptLinkDraft,
  submitRecruitmentScriptForReview,
  uploadRecruitmentScriptFile,
} from '../lib/mpSync/recruitmentScript'
import {
  checkScriptCompliance,
  formatInlineStatus as formatScriptAiStatus,
  getCheckingInlineStatus as getScriptCheckingStatus,
  type ScriptAiInlineStatus,
} from '../lib/mpSync/recruitmentScriptAiCompliance'
import {
  checkVideoCompliance,
  formatInlineStatus as formatVideoAiStatus,
  getCheckingInlineStatus as getVideoCheckingStatus,
  type VideoAiInlineStatus,
} from '../lib/mpSync/recruitmentVideoAiCompliance'
import { resolveOrderCoverUrl } from '../lib/mpSync/recruitCoverLibrary'
import {
  APPLICATION_TIME_FILTERS,
  CATEGORY_FILTERS,
  filterApplicationRows,
  type ApplicationTimeFilterId,
} from '../lib/mpRecruitment/applicationFilters'
import {
  isScriptReviewPlatform,
  matchPrPlatformGroup,
  normalizePlatformFilterForGroup,
  platformFilterOptionsForGroup,
  PR_PLATFORM_GROUP_OPTIONS,
  resolveOrderPlatformForRow,
  type PrDeliveryPlatformGroup,
} from '../lib/mpRecruitment/deliveryReviewPlatform'
import {
  canTalentSubmitRecruitmentScript,
  canTalentSubmitRecruitmentVideo,
  canTalentUploadRecruitmentScript,
  canTalentUploadRecruitmentVideo,
  isTalentVisitCheckedIn,
  matchTalentApplicationTab,
  resolveApplicationDisplayStatus,
  resolveTalentApplicationProgress,
  talentApplicationTabsForGroup,
  type TalentAppTabId,
} from '../lib/mpRecruitment/talentApplicationStatus'
import { findMyApplicant } from '../lib/mpSync/talentContactPrGate'
import { visitCheckIn } from '../lib/mpSync/visitScheduleRuntime'
import { buildNotifiedApplicantIdSet } from '../lib/mpSync/applicantListExtras'
import { mapMpOrderRow } from '../lib/mpRecruitment/orderCard'
import type { MpRegistry } from '../lib/mpRecruitment/types'
import PrOrdersPage from './PrOrdersPage'
import ApplicationOrderCard from '../components/mp/ApplicationOrderCard'
import TalentApplicationDeliveryActions from '../components/mp/TalentApplicationDeliveryActions'
import TalentUploadedVideoPreviewModal from '../components/mp/TalentUploadedVideoPreviewModal'
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
  visitVideoUrl?: string
  canViewVideo?: boolean
  canUploadVideo?: boolean
  canSubmitVideo?: boolean
  scriptStatus?: string
  scriptRejectReason?: string
  scriptUrl?: string
  scriptLinkUrl?: string
  canUploadScript?: boolean
  canSubmitScript?: boolean
  aiCheckStatusText?: string
  aiCheckStatusTone?: ScriptAiInlineStatus['tone'] | VideoAiInlineStatus['tone']
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
  const [searchParams] = useSearchParams()
  const [apps, setApps] = useState<EnrichedApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadingKey, setUploadingKey] = useState('')
  const [submittingKey, setSubmittingKey] = useState('')
  const [aiDetectBusyKey, setAiDetectBusyKey] = useState('')
  const [aiCheckStatusMap, setAiCheckStatusMap] = useState<
    Record<string, { text: string; tone: ScriptAiInlineStatus['tone'] | VideoAiInlineStatus['tone'] }>
  >({})
  const [visitConfirmKey, setVisitConfirmKey] = useState('')
  const [cancelApplyKey, setCancelApplyKey] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const scriptFileRef = useRef<HTMLInputElement>(null)
  const pendingUpload = useRef<EnrichedApplication | null>(null)
  const pendingScriptUpload = useRef<EnrichedApplication | null>(null)
  const [filterTab, setFilterTab] = useState<TalentAppTabId>(() => {
    const tab = String(searchParams.get('tab') || '').trim() as TalentAppTabId
    const valid = talentApplicationTabsForGroup('video').some((t) => t.id === tab)
    return valid ? tab : 'registered'
  })
  const [platformGroup, setPlatformGroup] = useState<PrDeliveryPlatformGroup>('video')
  const [timeFilter, setTimeFilter] = useState<ApplicationTimeFilterId>('all')
  const [filterPlatform, setFilterPlatform] = useState('全部')
  const [filterCategory, setFilterCategory] = useState('全部')
  const [filterProvince, setFilterProvince] = useState('全部')
  const [filterCity, setFilterCity] = useState('全部')
  const [previewVideoUrl, setPreviewVideoUrl] = useState('')

  function enrichApplicationRow(a: ApplicationLocal, mp: Record<string, unknown> | undefined, reg: Record<string, unknown>) {
    const isIceFromId = /^MP-ICE-/i.test(String(a.mpOrderId || ''))
    if (!mp) {
      const withdrawn = !!String(a.withdrawnAt || '').trim()
      const displayStatus = resolveApplicationDisplayStatus(null, null, a.mpOrderId, {
        isIce: isIceFromId,
        withdrawnAt: withdrawn,
      })
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
    const visitVideoUrl = me ? String(me.videoUrl || '').trim() : ''
    const canViewVideo = !isIce && !!visitVideoUrl
    const canUploadVideo = canTalentUploadRecruitmentVideo(mp, me, isIce)
    const canSubmitVideo = canTalentSubmitRecruitmentVideo(mp, me, isIce)
    const scriptStatus = me ? String(me.scriptStatus || '') : ''
    const scriptRejectReason = me && me.scriptRejectReason ? String(me.scriptRejectReason) : ''
    const scriptUrl = me ? String(me.scriptUrl || '').trim() : ''
    const scriptLinkUrl = me ? String(me.scriptLinkUrl || '').trim() : ''
    const canUploadScript = canTalentUploadRecruitmentScript(mp, me, isIce)
    const canSubmitScript = canTalentSubmitRecruitmentScript(mp, me, isIce)
    const progress = resolveTalentApplicationProgress(mp, me, a.mpOrderId)
    const notifiedIds = buildNotifiedApplicantIdSet(reg as MpRegistry, a.mpOrderId, mp)
    const selectionNotified = !!(me && notifiedIds.has(String(me.id || '')))
    const registryWithdrawn = !!String(a.applicantId || '').trim() && !me
    const withdrawnAt = !!String(a.withdrawnAt || '').trim() || registryWithdrawn
    const displayStatus = resolveApplicationDisplayStatus(mp, me, a.mpOrderId, {
      selectionNotified,
      isIce,
      withdrawnAt,
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
      platform: row.platform,
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
      visitVideoUrl,
      canViewVideo,
      canUploadVideo,
      canSubmitVideo,
      scriptStatus,
      scriptRejectReason,
      scriptUrl,
      scriptLinkUrl,
      canUploadScript,
      canSubmitScript,
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
      setApps(
        enriched.map((r) => {
          const st = aiCheckStatusMap[rowKey(r)]
          return st ? { ...r, aiCheckStatusText: st.text, aiCheckStatusTone: st.tone } : r
        }),
      )
      maybeSwitchToPendingVideoTab(enriched)
    } catch {
      setApps(local.map((a) => enrichApplicationRow(a, undefined, {})))
    }
  }

  function rowKey(app: EnrichedApplication) {
    return `${app.mpOrderId}-${app.applicantId}`
  }

  function maybeSwitchToPendingVideoTab(rows: EnrichedApplication[]) {
    setFilterTab((current) => {
      if (current !== 'pending_visit') return current
      const shouldSwitch = rows.some((r) => {
        const st =
          r.displayStatus ||
          resolveApplicationDisplayStatus(r._progressMp || null, r._progressMe || null, r.mpOrderId, {
            selectionNotified: r.selectionNotified,
            isIce: r.isIce,
          })
        return st.tabId === 'pending_video' && isTalentVisitCheckedIn(r._progressMp || null, r._progressMe || null)
      })
      return shouldSwitch ? 'pending_video' : current
    })
  }

  function updateRowAiStatus(key: string, status: { text: string; tone: ScriptAiInlineStatus['tone'] | VideoAiInlineStatus['tone'] }) {
    setAiCheckStatusMap((prev) => ({ ...prev, [key]: status }))
    setApps((prev) =>
      prev.map((r) =>
        rowKey(r) === key ? { ...r, aiCheckStatusText: status.text, aiCheckStatusTone: status.tone } : r,
      ),
    )
  }

  function onPickVideo(app: EnrichedApplication) {
    if (!app.applicantId) {
      alert('缺少报名 ID，请重新报名后再上传')
      return
    }
    pendingUpload.current = app
    fileRef.current?.click()
  }

  function onPickScript(app: EnrichedApplication) {
    if (!app.applicantId) {
      alert('缺少报名 ID，请重新报名后再上传')
      return
    }
    pendingScriptUpload.current = app
    scriptFileRef.current?.click()
  }

  async function onCancelApply(app: EnrichedApplication) {
    if (!app.mpOrderId || !app.applicantId) {
      alert('缺少报名信息')
      return
    }
    const key = `${app.mpOrderId}-${app.applicantId}`
    if (cancelApplyKey === key) return
    const ok = window.confirm('确定取消该商单的报名吗？取消后可重新报名。')
    if (!ok) return
    setCancelApplyKey(key)
    try {
      await cancelMpRecruitmentApply(app.mpOrderId, app.applicantId)
      markApplicationWithdrawn(app.mpOrderId)
      clearMpRegistryCache()
      await flushClientStateSync()
      await reloadApps()
    } catch (err) {
      alert(err instanceof Error ? err.message : '取消报名失败')
    } finally {
      setCancelApplyKey('')
    }
  }

  async function onConfirmVisit(app: EnrichedApplication) {
    if (!app.mpOrderId || !app.applicantId) {
      alert('缺少报名信息')
      return
    }
    const key = `${app.mpOrderId}-${app.applicantId}`
    if (visitConfirmKey === key) return
    setVisitConfirmKey(key)
    try {
      await visitCheckIn(app.mpOrderId, app.applicantId, 'manual')
      clearMpRegistryCache()
      await reloadApps()
      setFilterTab('pending_video')
      alert('已确认探店，请上传视频')
    } catch (err) {
      alert(err instanceof Error ? err.message : '确认失败')
    } finally {
      setVisitConfirmKey('')
    }
  }

  async function onVideoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const app = pendingUpload.current
    e.target.value = ''
    pendingUpload.current = null
    if (!file || !app?.mpOrderId || !app.applicantId) return
    const key = rowKey(app)
    setUploadingKey(key)
    try {
      await uploadRecruitmentVideoDraft(file, app.mpOrderId, app.applicantId)
      updateRowAiStatus(key, { text: '', tone: '' })
      alert('视频已上传，可 AI 检测后点击提交')
      clearMpRegistryCache()
      await reloadApps()
    } catch (err) {
      alert(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploadingKey('')
    }
  }

  async function onScriptFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const app = pendingScriptUpload.current
    e.target.value = ''
    pendingScriptUpload.current = null
    if (!file || !app?.mpOrderId || !app.applicantId) return
    const key = rowKey(app)
    setUploadingKey(key)
    try {
      await uploadRecruitmentScriptFile(file, app.mpOrderId, app.applicantId)
      updateRowAiStatus(key, { text: '', tone: '' })
      alert('文稿已上传，可 AI 检测后点击提交')
      clearMpRegistryCache()
      await reloadApps()
    } catch (err) {
      alert(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploadingKey('')
    }
  }

  async function onSubmitVideo(app: EnrichedApplication) {
    if (!app.mpOrderId || !app.applicantId) {
      alert('缺少报名信息')
      return
    }
    const key = rowKey(app)
    if (submittingKey === key) return
    const videoUrl = String(app.visitVideoUrl || '').trim()
    if (!videoUrl) {
      alert('请先上传视频')
      return
    }
    setSubmittingKey(key)
    try {
      await submitRecruitmentVideo(app.mpOrderId, app.applicantId, videoUrl)
      alert('已提交审核')
      clearMpRegistryCache()
      await reloadApps()
    } catch (err) {
      alert(err instanceof Error ? err.message : '提交失败')
    } finally {
      setSubmittingKey('')
    }
  }

  async function onSubmitScript(app: EnrichedApplication) {
    if (!app.mpOrderId || !app.applicantId) {
      alert('缺少报名信息')
      return
    }
    const key = rowKey(app)
    if (submittingKey === key) return
    const scriptUrl = String(app.scriptUrl || '').trim()
    const scriptLinkUrl = String(app.scriptLinkUrl || '').trim()
    if (!scriptUrl && !scriptLinkUrl) {
      alert('请先上传文稿或粘贴链接')
      return
    }
    setSubmittingKey(key)
    try {
      await submitRecruitmentScriptForReview(app.mpOrderId, app.applicantId, {
        ...(scriptUrl ? { scriptUrl } : {}),
        ...(scriptLinkUrl ? { scriptLinkUrl } : {}),
      })
      alert('已提交审核')
      clearMpRegistryCache()
      await reloadApps()
    } catch (err) {
      alert(err instanceof Error ? err.message : '提交失败')
    } finally {
      setSubmittingKey('')
    }
  }

  async function onPasteScriptLink(app: EnrichedApplication) {
    if (!app.mpOrderId || !app.applicantId) {
      alert('缺少报名信息')
      return
    }
    const link = window.prompt('请粘贴文档链接（飞书/腾讯文档等）', app.scriptLinkUrl || '')
    if (link == null) return
    const trimmed = String(link).trim()
    if (!trimmed) {
      alert('请填写文档链接')
      return
    }
    const key = rowKey(app)
    setUploadingKey(key)
    try {
      await saveRecruitmentScriptLinkDraft(app.mpOrderId, app.applicantId, trimmed)
      updateRowAiStatus(key, { text: '', tone: '' })
      alert('链接已保存，可 AI 检测后点击提交')
      clearMpRegistryCache()
      await reloadApps()
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败')
    } finally {
      setUploadingKey('')
    }
  }

  async function onAiDetect(app: EnrichedApplication) {
    if (!app.mpOrderId) return
    const key = rowKey(app)
    if (aiDetectBusyKey === key) return
    const isScript = isScriptReviewPlatform(app.platform || app._progressMp?.platform)
    setAiDetectBusyKey(key)
    updateRowAiStatus(key, isScript ? getScriptCheckingStatus() : getVideoCheckingStatus())
    try {
      const mp = app._progressMp
      const me = app._progressMe
      let payload: Record<string, unknown> = {
        mpOrderId: app.mpOrderId,
        applicantId: app.applicantId,
        orderTitle: app.title,
        platform: app.platform || '抖音',
      }
      if (mp) {
        payload = {
          ...payload,
          recruitmentInfo: String(mp.recruitmentInfo || mp.taskDetail || ''),
          merchantRequirements: String(mp.merchantRequirements || ''),
          taskDetail: String(mp.taskDetail || ''),
          category: String(mp.category || app.category || ''),
          region: String(mp.region || app.region || ''),
          applicantName: String(me?.nickname || app.title || ''),
        }
      }
      if (isScript) {
        const scriptUrl = String(me?.scriptUrl || app.scriptUrl || '').trim()
        const scriptLinkUrl = String(me?.scriptLinkUrl || app.scriptLinkUrl || '').trim()
        if (!scriptUrl && !scriptLinkUrl) {
          updateRowAiStatus(key, { text: '', tone: '' })
          alert('请先上传文稿或粘贴链接')
          return
        }
        payload.scriptUrl = scriptUrl
        payload.scriptLinkUrl = scriptLinkUrl
        payload.scriptText = await readScriptTextForAi(scriptUrl, scriptLinkUrl)
        const res = await checkScriptCompliance(payload as Parameters<typeof checkScriptCompliance>[0])
        updateRowAiStatus(key, formatScriptAiStatus(res as Record<string, unknown>))
      } else {
        const videoUrl = String(me?.videoUrl || app.visitVideoUrl || '').trim()
        if (!videoUrl) {
          updateRowAiStatus(key, { text: '', tone: '' })
          alert('请先上传视频')
          return
        }
        payload.videoUrl = videoUrl
        payload.douyinPublishUrl = String(me?.douyinPublishUrl || '')
        const res = await checkVideoCompliance(payload as Parameters<typeof checkVideoCompliance>[0])
        updateRowAiStatus(key, formatVideoAiStatus(res as Record<string, unknown>))
      }
    } catch (err) {
      updateRowAiStatus(key, { text: '', tone: '' })
      alert(err instanceof Error ? err.message : 'AI 检测失败')
    } finally {
      setAiDetectBusyKey('')
    }
  }

  function renderDeliveryActions(a: EnrichedApplication) {
    const key = rowKey(a)
    const busyUpload = uploadingKey === key
    const busySubmit = submittingKey === key
    const busyAi = aiDetectBusyKey === key

    if (a.canSubmitScript) {
      return (
        <TalentApplicationDeliveryActions
          mode="script-submit"
          busyUpload={busyUpload}
          busySubmit={busySubmit}
          busyAi={busyAi}
          onView={() => openRecruitmentScriptUrl(a.scriptUrl, a.scriptLinkUrl)}
          onAi={() => void onAiDetect(a)}
          onSubmit={() => void onSubmitScript(a)}
          onUpload={() => onPickScript(a)}
        />
      )
    }
    if (a.canUploadScript) {
      return (
        <TalentApplicationDeliveryActions
          mode="script-upload"
          busyUpload={busyUpload}
          busyAi={busyAi}
          uploadLabel={a.scriptStatus === 'rejected' ? '重新上传' : '上传文稿'}
          onView={() => openRecruitmentScriptUrl(a.scriptUrl, a.scriptLinkUrl)}
          onAi={() => void onAiDetect(a)}
          onUpload={() => onPickScript(a)}
          onPasteLink={() => void onPasteScriptLink(a)}
        />
      )
    }
    if (a.canSubmitVideo) {
      return (
        <TalentApplicationDeliveryActions
          mode="video-submit"
          busyUpload={busyUpload}
          busySubmit={busySubmit}
          busyAi={busyAi}
          onView={() => setPreviewVideoUrl(a.visitVideoUrl || '')}
          onAi={() => void onAiDetect(a)}
          onSubmit={() => void onSubmitVideo(a)}
          onUpload={() => onPickVideo(a)}
        />
      )
    }
    if (a.canViewVideo && a.videoStatus === 'pending') {
      return (
        <div className="app-order-card__btn-row">
          <button
            type="button"
            className="app-order-card__btn app-order-card__btn--grid app-order-card__btn--view"
            onClick={() => setPreviewVideoUrl(a.visitVideoUrl || '')}
          >
            查看视频
          </button>
          <button
            type="button"
            className="app-order-card__btn app-order-card__btn--grid app-order-card__btn--ai"
            disabled={busyAi}
            onClick={() => void onAiDetect(a)}
          >
            {busyAi ? '检测中…' : 'AI检测'}
          </button>
        </div>
      )
    }
    if (a.canUploadVideo) {
      return (
        <TalentApplicationDeliveryActions
          mode="video-upload-only"
          busyUpload={busyUpload}
          uploadLabel={a.videoStatus === 'rejected' ? '重新上传视频' : '上传视频'}
          onView={() => setPreviewVideoUrl(a.visitVideoUrl || '')}
          onAi={() => void onAiDetect(a)}
          onUpload={() => onPickVideo(a)}
        />
      )
    }
    if (a.canViewVideo) {
      return (
        <button
          type="button"
          className="app-order-card__btn app-order-card__btn--outline"
          onClick={() => setPreviewVideoUrl(a.visitVideoUrl || '')}
        >
          查看视频
        </button>
      )
    }
    return null
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
        if (!cancelled) {
          const nextApps = enriched.map((r) => {
            const st = aiCheckStatusMap[rowKey(r)]
            return st ? { ...r, aiCheckStatusText: st.text, aiCheckStatusTone: st.tone } : r
          })
          setApps(nextApps)
          maybeSwitchToPendingVideoTab(nextApps)
        }
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

  const platformOptions = useMemo(() => platformFilterOptionsForGroup(platformGroup), [platformGroup])

  const filtered = useMemo(() => {
    const byGroup = apps.filter((a) =>
      matchPrPlatformGroup(resolveOrderPlatformForRow(a), platformGroup),
    )
    const byTab = byGroup.filter((a) =>
      matchTalentApplicationTab(filterTab, a._progressMp || null, a._progressMe || null, a.mpOrderId, {
        selectionNotified: a.selectionNotified,
        isIce: a.isIce,
        withdrawnAt: !!String(a.withdrawnAt || '').trim(),
      }),
    )
    return filterApplicationRows(byTab, {
      filterTab,
      timeFilter,
      platform: filterPlatform,
      category: filterCategory,
      province: filterProvince,
      city: filterCity,
    })
  }, [apps, filterTab, platformGroup, timeFilter, filterPlatform, filterCategory, filterProvince, filterCity])

  function onPlatformGroupChange(group: PrDeliveryPlatformGroup) {
    if (group === platformGroup) return
    setPlatformGroup(group)
    setFilterPlatform(normalizePlatformFilterForGroup(filterPlatform, group))
  }

  const tabOptions = useMemo(() => talentApplicationTabsForGroup(platformGroup), [platformGroup])

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
      <input
        ref={scriptFileRef}
        type="file"
        accept=".txt,.doc,.docx,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => void onScriptFileChange(e)}
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

      <div className="pr-orders-platform-group orders-page__platform-group">
        {PR_PLATFORM_GROUP_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`pr-orders-platform-chip${platformGroup === opt.id ? ' pr-orders-platform-chip--on' : ''}`}
            onClick={() => onPlatformGroupChange(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="orders-page__tabs" role="tablist">
        {tabOptions.map((t) => (
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
              {platformOptions.map((p) => (
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
            ds.showConfirmVisitBtn
              ? undefined
              : ds.showCheckInBtn
              ? '到店签到'
              : ds.showAssignConfirmBtn
                ? '确认排期'
                : ds.showConfirmBtn
                  ? '确认档期'
                  : a.isIce && a.iceActionLabel && a.progressId !== 'completed'
                    ? a.iceActionLabel
                    : undefined
          const extraAction = (
            <>
              {ds.showCancelBtn ? (
                <button
                  type="button"
                  className="app-order-card__btn app-order-card__btn--outline"
                  disabled={cancelApplyKey === `${a.mpOrderId}-${a.applicantId}`}
                  onClick={() => void onCancelApply(a)}
                >
                  {cancelApplyKey === `${a.mpOrderId}-${a.applicantId}` ? '取消中…' : '取消报名'}
                </button>
              ) : null}
              {ds.showConfirmVisitBtn ? (
                <button
                  type="button"
                  className="app-order-card__btn app-order-card__btn--primary"
                  disabled={visitConfirmKey === `${a.mpOrderId}-${a.applicantId}`}
                  onClick={() => void onConfirmVisit(a)}
                >
                  {visitConfirmKey === `${a.mpOrderId}-${a.applicantId}`
                    ? '确认中…'
                    : ds.checkInReady
                      ? '确认已探店'
                      : '确认已探店'}
                </button>
              ) : null}
              {renderDeliveryActions(a)}
            </>
          )
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
              aiStatusText={a.aiCheckStatusText}
              aiStatusTone={a.aiCheckStatusTone}
            />
          )
        })}
      </div>
      <TalentUploadedVideoPreviewModal
        url={previewVideoUrl}
        onClose={() => setPreviewVideoUrl('')}
      />
    </div>
  )
}
