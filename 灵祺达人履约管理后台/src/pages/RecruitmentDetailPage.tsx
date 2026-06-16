import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { fetchMpRegistry, clearMpRegistryCache } from '../lib/mpApi'
import { getAccount, getActiveRole } from '../lib/mpSession'
import { hasAppliedToOrder, upsertApplication } from '../lib/mpSync/applicationsStore'
import {
  applicationFromMpOrder,
  reconcileApplicationsFromRegistry,
} from '../lib/mpSync/applicationsRegistrySync'
import { mpOrderOwnedByCurrentPr } from '../lib/mpRecruitment/publishedOrders'
import { enrichMpOrder } from '../lib/mpSync/recruitmentDisplay'
import { uploadAndSubmitRecruitmentVideo, videoStatusLabel } from '../lib/mpSync/recruitmentVideo'
import {
  applicationStatusLabel,
  evaluateContactPrGate,
  extractPrChatMeta,
} from '../lib/mpSync/talentContactPrGate'
import {
  canChat,
  ensureSessionWithPr,
  formatChatError,
  syncProfile,
} from '../lib/mpSync/talentChat'
import { prepareRecruitmentSharePayload } from '../lib/mpSync/recruitmentShareCopy'
import PrRecruitQrCard from '../components/mp/PrRecruitQrCard'
import RecruitmentInfoBody from '../components/mp/RecruitmentInfoBody'
import IceTaskPanel from '../components/mp/IceTaskPanel'
import RecruitmentShareSheet from '../components/mp/RecruitmentShareSheet'
import { resolveIceApplicantState } from '../lib/mpSync/iceTaskRuntime'
import { canTalentUploadRecruitmentVideo, canTalentSubmitVisitPublishLink, resolveApplicationDisplayStatus } from '../lib/mpRecruitment/talentApplicationStatus'
import { buildNotifiedApplicantIdSet } from '../lib/mpSync/applicantListExtras'
import VisitScheduleTalentPanel from '../components/mp/VisitScheduleTalentPanel'
import VisitPublishLinkPanel from '../components/mp/VisitPublishLinkPanel'
import TalentUploadedVideoPreviewModal from '../components/mp/TalentUploadedVideoPreviewModal'
import { getWorkIdentity } from '../lib/mpWorkIdentity'
import { isEditTeamIceMpOrder, isPackSlotIceOrder } from '../lib/mpSync/iceOrderDetect'
import { claimBlockHint } from '../lib/mpSync/recruitApplyGate'
import { isIceSlotsFull } from '../lib/mpRecruitment/iceOrderStats'
import {
  formatSignupCountdownText,
  parseIceSlotTotalFromMp,
  resolvePublishedMs,
  resolveSignupClosed,
  resolveSignupCountdownTone,
  SIGNUP_COUNTDOWN_TONE_CLASS,
} from '../lib/mpRecruitment/listFilters'
import { HALL_RECRUITMENT_LIST_PATH } from '../lib/useRecruitmentNav'
import {
  BtnOutline,
  BtnPrimary,
  FormSection,
  StickyActionBar,
  TipsCard,
  TwoColumnLayout,
} from '../components/ui/MockupLayouts'
import {
  openFormRelaySourceLinkWeb,
  pickFormRelaySourceMpCache,
  resolveFormRelaySourceMpLink,
} from '@merchant/lib/formRelaySourceMpLink'
import { readExternalFormRelay, isFormRelayGroupQrRelay } from '@merchant/lib/formRelayPlatforms'
import {
  isFormRelayGroupQrFeatureEnabled,
  FORM_RELAY_GROUP_QR_COMING_SOON_MSG,
} from '@merchant/lib/formRelayGroupQrFeature'

export default function RecruitmentDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const [search] = useSearchParams()
  const nav = useNavigate()
  const role = getActiveRole()
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [view, setView] = useState<ReturnType<typeof enrichMpOrder> | null>(null)
  const [mpRaw, setMpRaw] = useState<Record<string, unknown> | null>(null)
  const [mpRegistry, setMpRegistry] = useState<Record<string, unknown> | null>(null)
  const [contactGate, setContactGate] = useState(evaluateContactPrGate(null, id || ''))
  const [prChatMeta, setPrChatMeta] = useState<ReturnType<typeof extractPrChatMeta>>(null)
  const [contacting, setContacting] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shareSheet, setShareSheet] = useState<{ text: string; title: string; order: Record<string, unknown> } | null>(null)
  const [readOnlyEnded, setReadOnlyEnded] = useState(false)
  const [signupCountdownText, setSignupCountdownText] = useState('')
  const [signupCountdownToneClass, setSignupCountdownToneClass] = useState('signup-countdown signup-countdown--unknown')
  const [signupClosed, setSignupClosed] = useState(false)
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const [previewVideoUrl, setPreviewVideoUrl] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const appliedFromUrl = search.get('applied') === '1'
  const iceState = resolveIceApplicantState(mpRaw, id || '', mpRegistry)
  const canReclaimIce = iceState.isIce && iceState.iceRejected
  const applied =
    (appliedFromUrl || (id ? hasAppliedToOrder(id) : false) || contactGate.hasApplication) &&
    !canReclaimIce
  const myApplicant = contactGate.applicant
  const videoStatus = myApplicant ? String(myApplicant.videoStatus || '') : ''
  const videoRejectReason = myApplicant && myApplicant.videoRejectReason ? String(myApplicant.videoRejectReason) : ''
  const visitVideoUrl = myApplicant ? String(myApplicant.videoUrl || '').trim() : ''
  const canViewVideo = applied && !view?.isIce && !!visitVideoUrl
  const canUploadVideo =
    applied &&
    videoStatus !== 'pending' &&
    canTalentUploadRecruitmentVideo(
      mpRaw as Record<string, unknown> | null,
      myApplicant as Record<string, unknown> | null,
      !!view?.isIce,
    )
  const canSubmitPublishLink =
    applied &&
    !view?.isIce &&
    canTalentSubmitVisitPublishLink(
      mpRaw as Record<string, unknown> | null,
      myApplicant as Record<string, unknown> | null,
      false,
    )
  const visitPublishPhase = myApplicant
    ? String(
        (() => {
          const vs = String(myApplicant.videoStatus || '')
          if (vs !== 'passed' || String(myApplicant.completedAt || '').trim()) return ''
          const link = String(myApplicant.douyinPublishUrl || '').trim()
          if (myApplicant.aiVerifyStatus === 'pending' && link) return 'ai_pending'
          if (myApplicant.aiVerifyStatus === 'failed') return 'link_failed'
          return 'awaiting_link'
        })(),
      )
    : ''
  const workIdentity = getWorkIdentity()
  const visitApplicantId = myApplicant ? String(myApplicant.id || '').trim() : ''
  const visitSelectionNotified = !!(
    visitApplicantId &&
    mpRegistry &&
    buildNotifiedApplicantIdSet(mpRegistry as Record<string, unknown>, id || '', mpRaw).has(visitApplicantId)
  )
  const visitDisplay =
    role === 'talent' && applied && myApplicant && !view?.isIce
      ? resolveApplicationDisplayStatus(
          mpRaw as Record<string, unknown> | null,
          myApplicant as Record<string, unknown>,
          id || '',
          { selectionNotified: visitSelectionNotified, isIce: false },
        )
      : null
  const isEditIce = mpRaw ? isEditTeamIceMpOrder(mpRaw) : false
  const iceSlotsFull =
    !!view?.isIce && mpRaw ? isIceSlotsFull(mpRaw, parseIceSlotTotalFromMp(mpRaw)) : false
  const applyGateHint =
    mpRaw && role !== 'pr' && !canReclaimIce ? claimBlockHint(mpRaw, workIdentity) : ''
  const formRelaySourceUrl = (() => {
    const meta =
      mpRaw?.mpPublishMeta && typeof mpRaw.mpPublishMeta === 'object'
        ? (mpRaw.mpPublishMeta as Record<string, unknown>)
        : null
    const relay =
      meta?.externalFormRelay && typeof meta.externalFormRelay === 'object'
        ? (meta.externalFormRelay as Record<string, unknown>)
        : null
    return String(relay?.sourceUrl || '').trim()
  })()

  useEffect(() => {
    if (!id) {
      setErr('缺少招募单号')
      setLoading(false)
      return
    }
    void (async () => {
      setLoading(true)
      setErr('')
      try {
        const reg = await fetchMpRegistry({ includeMpOrderIds: [id] })
        reconcileApplicationsFromRegistry(reg)
        const list = (Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []) as Record<string, unknown>[]
        const mp = list.find((o) => o && o.id === id)
        if (!mp) {
          setErr('招募单不存在或已结束')
          return
        }
        const rawStatus = String(mp.status || '')
        const isEnded =
          rawStatus === 'closed' || rawStatus === 'done' || rawStatus === 'pending_settlement'
        const gate = evaluateContactPrGate(mp, id)
        if (gate.hasApplication && gate.applicant) {
          const entry = applicationFromMpOrder(mp, gate.applicant as Record<string, unknown>)
          if (entry) upsertApplication(entry)
        }
        const canViewEnded =
          gate.hasApplication ||
          hasAppliedToOrder(id) ||
          (role === 'pr' && mpOrderOwnedByCurrentPr(mp, getAccount()))
        if (isEnded && !canViewEnded) {
          setErr('该招募已结束')
          return
        }
        const enriched = enrichMpOrder(mp)
        setMpRegistry(reg as Record<string, unknown>)
        setMpRaw(mp)
        setView(enriched)
        setReadOnlyEnded(isEnded && canViewEnded)
        setContactGate(gate)
        setPrChatMeta(extractPrChatMeta(mp, enriched.merchantName || enriched.title))
      } catch (e) {
        setErr(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  useEffect(() => {
    if (!view) return
    const deadlineMs = view.deadlineMs
    const publishedMs = mpRaw ? resolvePublishedMs(mpRaw) : 0
    function refresh() {
      const now = Date.now()
      const text = deadlineMs
        ? formatSignupCountdownText(deadlineMs, now)
        : '截止日期待定'
      const tone = resolveSignupCountdownTone(deadlineMs, publishedMs, now)
      setSignupCountdownText(text)
      setSignupCountdownToneClass(SIGNUP_COUNTDOWN_TONE_CLASS[tone])
      setSignupClosed(
        resolveSignupClosed(mpRaw, { readOnlyEnded, nowMs: now }),
      )
    }
    refresh()
    if (!deadlineMs) return
    const timer = window.setInterval(refresh, 1000)
    return () => window.clearInterval(timer)
  }, [view, mpRaw, readOnlyEnded])

  function openFormRelaySource() {
    const relay = readExternalFormRelay(mpRaw)
    if (isFormRelayGroupQrRelay(relay)) {
      if (!isFormRelayGroupQrFeatureEnabled()) {
        window.alert(FORM_RELAY_GROUP_QR_COMING_SOON_MSG)
        return
      }
      if (!id) {
        window.alert('招募单无效')
        return
      }
      nav(`/recruitment/${encodeURIComponent(id)}/group-qr`)
      return
    }
    const sourceUrl = String(relay?.sourceUrl || formRelaySourceUrl || '').trim()
    if (!sourceUrl) {
      window.alert('原表链接缺失')
      return
    }
    const resolved = resolveFormRelaySourceMpLink(
      sourceUrl,
      relay?.sourcePlatform,
      pickFormRelaySourceMpCache(relay as Record<string, unknown> | null),
    )
    if (!openFormRelaySourceLinkWeb(resolved, sourceUrl)) {
      window.alert('当前原表链接无法在网页中直接打开，请联系招募方获取可用链接。')
    }
  }

  function goApply() {
    if (!view || !id) return
    if (view.isFormRelay) {
      if (role === 'pr') {
        window.alert('请切换达人身份再打开原表')
        return
      }
      openFormRelaySource()
      return
    }
    if (signupClosed) {
      window.alert('报名已截止')
      return
    }
    if (applyGateHint) {
      window.alert(applyGateHint)
      return
    }
    const meta = mpRaw?.mpPublishMeta as { applyFormTemplateId?: string } | undefined
    const q = new URLSearchParams({
      platform: view.platform,
      merchantOrderNo: view.merchantOrderNo,
    })
    if (view.isIce) q.set('ice', '1')
    if (meta?.applyFormTemplateId) q.set('templateId', meta.applyFormTemplateId)
    nav(`/recruitment/${encodeURIComponent(id)}/apply?${q}`)
  }

  async function onContactPr() {
    if (!prChatMeta?.prParticipantKey) {
      window.alert('该单暂不支持私信')
      return
    }
    if (!contactGate.canContact) {
      window.alert(contactGate.message || '请先报名并等待 PR 审核通过')
      return
    }
    if (!canChat()) {
      window.alert('未配置后台 API，无法发起私信')
      return
    }
    setContacting(true)
    try {
      await syncProfile()
      const sessionId = await ensureSessionWithPr(prChatMeta)
      nav(
        `/chat?sessionId=${encodeURIComponent(sessionId)}` +
          `&peerName=${encodeURIComponent(prChatMeta.prDisplayName || '招募方')}` +
          `&peerAvatar=${encodeURIComponent(prChatMeta.prWxAvatarUrl || '')}`,
      )
    } catch (e) {
      window.alert(formatChatError(e))
    } finally {
      setContacting(false)
    }
  }

  async function onShare() {
    if (!mpRaw || sharing) return
    setSharing(true)
    try {
      const payload = await prepareRecruitmentSharePayload(mpRaw)
      setShareSheet(payload)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '分享失败')
    } finally {
      setSharing(false)
    }
  }

  async function reloadOrder() {
    if (!id) return
    const reg = await fetchMpRegistry({ includeMpOrderIds: [id] })
    const list = (Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []) as Record<string, unknown>[]
    const mp = list.find((o) => o && o.id === id)
    if (!mp) return
    const rawStatus = String(mp.status || '')
    const isEnded =
      rawStatus === 'closed' || rawStatus === 'done' || rawStatus === 'pending_settlement'
    const gate = evaluateContactPrGate(mp, id)
    const canViewEnded =
      gate.hasApplication ||
      hasAppliedToOrder(id) ||
      (role === 'pr' && mpOrderOwnedByCurrentPr(mp, getAccount()))
    if (isEnded && !canViewEnded) return
    const enriched = enrichMpOrder(mp)
    setMpRegistry(reg as Record<string, unknown>)
    setMpRaw(mp)
    setView(enriched)
    setReadOnlyEnded(isEnded && canViewEnded)
    setContactGate(gate)
    setPrChatMeta(extractPrChatMeta(mp, enriched.merchantName || enriched.title))
  }

  function onPickVideo() {
    const applicantId = myApplicant ? String(myApplicant.id || '') : ''
    if (!id || !applicantId) {
      window.alert('缺少报名信息，请重新报名后再上传')
      return
    }
    fileRef.current?.click()
  }

  async function onVideoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const applicantId = myApplicant ? String(myApplicant.id || '') : ''
    if (!file || !id || !applicantId) return
    setUploadingVideo(true)
    try {
      await uploadAndSubmitRecruitmentVideo(file, id, applicantId)
      window.alert('视频已提交，请等待 PR 审核')
      clearMpRegistryCache()
      await reloadOrder()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploadingVideo(false)
    }
  }

  const statusLabel = applicationStatusLabel(contactGate)
  const chatEnabled = role === 'talent' && canChat() && !!prChatMeta
  const fromOrders =
    search.get('from') === 'orders' ||
    (typeof (location.state as { returnTo?: string } | null)?.returnTo === 'string' &&
      String((location.state as { returnTo: string }).returnTo).startsWith('/orders'))
  const defaultReturnTo = fromOrders ? '/orders' : HALL_RECRUITMENT_LIST_PATH
  const detailReturnTo =
    typeof (location.state as { returnTo?: string } | null)?.returnTo === 'string'
      ? String((location.state as { returnTo: string }).returnTo)
      : defaultReturnTo
  const detailBackLabel =
    detailReturnTo === '/orders' || detailReturnTo.startsWith('/orders?')
      ? '← 返回上一页'
      : detailReturnTo.startsWith('/hall')
        ? '← 返回招募大厅'
        : '← 返回上一页'

  return (
    <div className="page-content-shell page-content-shell--wide space-y-4">
      <input
        ref={fileRef}
        type="file"
        accept="video/mp4,video/quicktime,video/*"
        className="hidden"
        onChange={(e) => void onVideoFileChange(e)}
      />
      <Link to={detailReturnTo} className="recruitment-detail-back text-sm hover:underline">
        {detailBackLabel}
      </Link>
      {loading ? <p className="recruitment-detail-muted">加载中…</p> : null}
      {err ? <p className="text-red-600">{err}</p> : null}
      {view ? (
        <>
          <div className="detail-hero-card">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h2 className="detail-hero-card__title">
                  {view.title}
                  {view.region && view.region !== '—' ? (
                    <span className="recruitment-detail-city font-semibold"> · {view.region}</span>
                  ) : null}
                </h2>
                <p className="detail-hero-card__meta font-mono">招募单号 {view.mpOrderId}</p>
                {!view.isFormRelay ? (
                  <p className={`text-sm font-medium mt-1 ${signupCountdownToneClass}`}>
                    报名倒计时 {signupCountdownText || '—'}
                  </p>
                ) : null}
                <p className="text-amber-600 font-semibold mt-2">{view.budgetText}</p>
                <p className="detail-hero-card__meta mt-1">
                  {view.platform}
                  {!view.isFormRelay ? (
                    <>
                      {' · '}
                      招募 {view.recruitCount} 人 · 已报名 {view.applicantCount} 人
                    </>
                  ) : null}
                  {' · '}
                  粉丝要求：{view.fansRequirement}
                </p>
              </div>
              {id ? <PrRecruitQrCard mpOrderId={id} /> : null}
            </div>
          </div>

          <TwoColumnLayout
            className="mockup-two-col--wide-aside"
            aside={
              <TipsCard
                title="报名须知"
                items={
                  view.isIce
                    ? [
                        { title: '云剪任务', desc: '认领后请在 30 分钟内于「我的报名」确认，超时自动释放。' },
                        { title: '交片规范', desc: '按任务说明提交链接或成片，PR 审核通过后计入完成。' },
                      ]
                    : [
                        { title: '资料准确', desc: '平台账号、粉丝数须与真实资料一致，便于 PR 筛选。' },
                        { title: '及时沟通', desc: '入选后可通过「沟通」与招募方确认排期与交付要求。' },
                        { title: '成片上传', desc: '探店完成后在详情页或「我的报名」上传视频等待审核。' },
                      ]
                }
              />
            }
            main={
              <div className="space-y-4">
          {role === 'talent' && applied ? (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                contactGate.canContact
                  ? 'border-emerald-200 bg-emerald-50/80 text-emerald-800'
                  : 'border-amber-200 bg-amber-50/80 text-amber-900'
              }`}
            >
              <p className="font-medium">报名状态：{statusLabel}</p>
              {contactGate.reason === 'pending_pr_review' ? (
                <p className="mt-1 text-xs opacity-90">{contactGate.message}</p>
              ) : null}
              {contactGate.canContact ? (
                <p className="mt-1 text-xs opacity-90">PR 已通过您的报名，可联系招募方沟通排期。</p>
              ) : null}
            </div>
          ) : null}

          {role === 'talent' && applied && view.isIce && (isEditIce ? workIdentity === 'edit' : workIdentity === 'talent') ? (
            <IceTaskPanel mpOrderId={id || ''} state={iceState} onRefresh={reloadOrder} />
          ) : null}

          {role === 'talent' && applied && !view.isIce && visitDisplay ? (
            <VisitScheduleTalentPanel
              mpOrderId={id || ''}
              applicantId={visitApplicantId}
              display={visitDisplay}
              mpOrder={mpRaw}
              onRefresh={() => void reloadOrder()}
            />
          ) : null}

          {role === 'talent' && applied && !view.isIce ? (
            <section className="surface-card rounded-xl border p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium">探店成片</h3>
                {videoStatus ? (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      videoStatus === 'passed'
                        ? 'bg-emerald-500/10 text-emerald-700'
                        : videoStatus === 'rejected'
                          ? 'bg-red-500/10 text-red-700'
                          : videoStatus === 'pending'
                            ? 'bg-blue-500/10 text-blue-700'
                            : 'bg-amber-500/10 text-amber-700'
                    }`}
                  >
                    {videoStatus === 'pending' ? '已上传' : `视频${videoStatusLabel(videoStatus)}`}
                  </span>
                ) : null}
              </div>
              {videoStatus === 'rejected' && videoRejectReason ? (
                <p className="text-xs text-red-600 rounded-lg bg-red-50 px-3 py-2">驳回原因：{videoRejectReason}</p>
              ) : null}
              {videoStatus === 'pending' ? (
                <p className="text-xs text-[var(--shell-muted)]">视频已提交，请等待 PR 审核。审核结果将通过消息通知。</p>
              ) : null}
              {videoStatus === 'passed' && !canSubmitPublishLink ? (
                <p className="text-xs text-emerald-700">视频已通过 PR 审核，订单已完结。</p>
              ) : null}
              {videoStatus === 'passed' && canSubmitPublishLink ? (
                <p className="text-xs text-emerald-700">视频已通过 PR 审核，请回传平台发布链接。</p>
              ) : null}
              {canViewVideo ? (
                <button
                  type="button"
                  className="text-sm px-4 py-2 rounded-xl border border-sky-300 text-sky-700 hover:bg-sky-50"
                  onClick={() => setPreviewVideoUrl(visitVideoUrl)}
                >
                  查看已上传视频
                </button>
              ) : null}
              {canSubmitPublishLink ? (
                <VisitPublishLinkPanel
                  mpOrderId={id || ''}
                  applicantId={visitApplicantId}
                  platform={view?.platform}
                  publishPhase={visitPublishPhase}
                  initialUrl={myApplicant ? String(myApplicant.douyinPublishUrl || '') : ''}
                  hint={
                    myApplicant && myApplicant.aiVerifyStatus === 'failed'
                      ? String(myApplicant.videoRejectReason || myApplicant.aiVerifyNote || '')
                      : ''
                  }
                  onRefresh={() => void reloadOrder()}
                />
              ) : null}
              {canUploadVideo ? (
                <BtnPrimary disabled={uploadingVideo} onClick={onPickVideo}>
                  {uploadingVideo ? '上传中…' : videoStatus === 'rejected' ? '重新上传视频' : '上传视频'}
                </BtnPrimary>
              ) : null}
            </section>
          ) : null}

          <section className="surface-card rounded-xl border p-4">
            <h3 className="font-medium mb-2">招募说明</h3>
            <RecruitmentInfoBody
              text={view.recruitmentInfo}
              hideSourceLink={view.isFormRelay}
            />
          </section>
          {view.taskDetail !== view.recruitmentInfo ? (
            <FormSection title="任务说明">
              <RecruitmentInfoBody
                text={view.taskDetail}
                hideSourceLink={view.isFormRelay}
              />
            </FormSection>
          ) : null}

          {readOnlyEnded ? (
            <p className="text-sm text-amber-600 rounded-lg bg-amber-50 px-3 py-2 border border-amber-200">
              该招募已结束，当前为只读查看。
            </p>
          ) : null}

          {canReclaimIce ? (
            <p className="text-sm text-slate-500">任务已拒绝，名额已释放，可重新认领。</p>
          ) : null}

          <StickyActionBar
            left={
              role === 'talent' ? (
                <BtnOutline disabled={sharing} onClick={() => void onShare()}>
                  {sharing ? '生成中…' : '分享招募'}
                </BtnOutline>
              ) : null
            }
            right={
              <>
                {role === 'talent' && view.isFormRelay && !readOnlyEnded ? (
                  <BtnPrimary onClick={openFormRelaySource}>前往原表报名</BtnPrimary>
                ) : null}
                {role === 'talent' && !view.isFormRelay && !applied && !readOnlyEnded && !iceSlotsFull && !signupClosed && !applyGateHint ? (
                  <BtnPrimary onClick={goApply}>
                    {canReclaimIce
                      ? isEditIce
                        ? '重新认领剪辑云剪'
                        : '重新认领云剪'
                      : view.isIce
                        ? isEditIce
                          ? '认领剪辑云剪'
                          : '认领云剪任务'
                        : '立即报名'}
                  </BtnPrimary>
                ) : null}
                {role === 'talent' && !view.isFormRelay && canReclaimIce && !readOnlyEnded && !applyGateHint && !signupClosed ? (
                  <BtnPrimary onClick={goApply}>
                    {isEditIce ? '重新认领剪辑云剪' : '重新认领云剪'}
                  </BtnPrimary>
                ) : null}
                {chatEnabled && contactGate.canContact ? (
                  <BtnPrimary disabled={contacting} onClick={() => void onContactPr()}>
                    {contacting ? '连接中…' : '沟通'}
                  </BtnPrimary>
                ) : null}
              </>
            }
          />

          {role === 'talent' && !view.isFormRelay && !applied && !readOnlyEnded && signupClosed ? (
            <p className="text-sm text-center text-slate-500">报名已截止</p>
          ) : null}
          {role === 'talent' && !view.isFormRelay && !applied && !readOnlyEnded && iceSlotsFull && !canReclaimIce && !signupClosed ? (
            <p className="text-sm text-center text-slate-500">已收满</p>
          ) : null}
          {role === 'talent' && !view.isFormRelay && !applied && !readOnlyEnded && !iceSlotsFull && !signupClosed && applyGateHint ? (
            <p className="text-sm text-amber-600 rounded-lg bg-amber-50 px-3 py-2 border border-amber-200">
              {applyGateHint}
            </p>
          ) : null}

          {applied && role === 'talent' && !contactGate.canContact ? (
            <p className="text-sm text-emerald-600">您已报名该招募，可在「我的报名」查看记录。</p>
          ) : null}

          {chatEnabled && applied && prChatMeta && !contactGate.canContact ? (
            <p className="text-sm text-[var(--shell-muted)]">{contactGate.message}</p>
          ) : null}

          {role === 'pr' ? (
            <p className="text-sm text-slate-500">PR 账号仅可浏览大厅，报名请退出后以达人 / 拍摄 / 剪辑身份登录。</p>
          ) : null}
              </div>
            }
          />
        </>
      ) : null}

      {shareSheet ? (
        <RecruitmentShareSheet
          text={shareSheet.text}
          title={shareSheet.title}
          order={shareSheet.order}
          onClose={() => setShareSheet(null)}
        />
      ) : null}
      <TalentUploadedVideoPreviewModal url={previewVideoUrl} onClose={() => setPreviewVideoUrl('')} />
    </div>
  )
}
