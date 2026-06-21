import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import RegionSelect from '../components/mp/RegionSelect'
import { applyToMpOrder, fetchMpRegistry, registerTalentMember } from '../lib/mpApi'
import { getActiveRole } from '../lib/mpSession'
import { addApplication, hasAppliedToOrder } from '../lib/mpSync/applicationsStore'
import { canReclaimIceOrder, clearLocalIceApplyState } from '../lib/mpSync/talentContactPrGate'
import {
  getApplyConfigForMpOrder,
  normalizeTemplateKind,
  resolveApplyRows,
} from '../lib/mpSync/applyFormTemplates'
import {
  applyFieldsFromMember,
  applyFieldsFromSupplierMember,
  emptyApplyFields,
  emptySupplierApplyFields,
  enrichApplicantFromMember,
  memberSyncAvailable,
  persistApplicantToMemberProfile,
  supplierMemberSyncAvailable,
} from '../lib/mpSync/applyFormState'
import { buildApplicantFromRows, validateApplyRows } from '../lib/mpSync/applyTemplateRuntime'
import { isValidVisitTimeRange } from '../lib/mpSync/visitScheduleRuntime'
import type { ApplyRow } from '../lib/mpSync/applyFormTemplates'
import { labels, normalizePlatform } from '../lib/mpSync/platformLabels'
import { DOUYIN_LEVELS } from '../lib/mpSync/platformForm'
import { readMember, writeMember } from '../lib/mpSync/talentMember'
import { pushNotification } from '../lib/mpSync/messagesStore'
import { getWorkIdentity } from '../lib/mpWorkIdentity'
import { isEditTeamIceMpOrder, isIceMpOrder, isPackSlotIceOrder } from '../lib/mpSync/iceOrderDetect'
import { claimBlockHint, recruitTargetFromMpOrder, validateRecruitmentClaim } from '../lib/mpSync/recruitApplyGate'
import { countFreeEditPackSlots } from '../lib/mpSync/editIceSlots'
import { evaluateContactPrGate } from '../lib/mpSync/talentContactPrGate'
import {
  parseIceSlotTotalFromMp,
  resolveApplicantCountFromMp,
  resolveSignupClosed,
} from '../lib/mpRecruitment/listFilters'
import { countIceClaimedSlots } from '../lib/mpRecruitment/iceOrderStats'
import PageHero from '../components/ui/PageHero'
import { BtnPrimary, FormSection, StickyActionBar } from '../components/ui/MockupLayouts'
import { resolveDefaultApplyQuotePrice, getExclusiveQuoteOffer, getExclusiveQuoteOfferForSupplier } from '../lib/mpSync/talentPrQuotes'

export default function RecruitmentApplyPage() {
  const { id: mpOrderId } = useParams()
  const [search] = useSearchParams()
  const nav = useNavigate()
  const role = getActiveRole()
  if (role === 'pr') return <Navigate to="/hall" replace />
  if (!mpOrderId) return <Navigate to="/hall" replace />
  const orderId = mpOrderId

  const platform = normalizePlatform(search.get('platform') || '抖音')
  const merchantOrderNo = search.get('merchantOrderNo') || mpOrderId
  const isIceMode = search.get('ice') === '1'
  const templateId = search.get('templateId') || ''
  const workIdentity = getWorkIdentity()

  const [mpOrder, setMpOrder] = useState<Record<string, unknown> | null>(null)
  const [orderMeta, setOrderMeta] = useState<Record<string, unknown> | null>(null)
  const recruitTarget = useMemo(() => {
    if (mpOrder) return recruitTargetFromMpOrder(mpOrder)
    return 'talent' as const
  }, [mpOrder])

  const tpl = useMemo(() => {
    const t = getApplyConfigForMpOrder(orderId, templateId, orderMeta)
    const kind = normalizeTemplateKind(t.kind || recruitTarget)
    return { ...t, kind }
  }, [orderId, templateId, orderMeta, recruitTarget])

  const effectiveRecruitTarget = useMemo(() => {
    const kind = normalizeTemplateKind(tpl.kind || recruitTarget)
    return kind === 'shoot' || kind === 'edit' ? kind : recruitTarget
  }, [tpl.kind, recruitTarget])

  const isSupplierApply = effectiveRecruitTarget === 'shoot' || effectiveRecruitTarget === 'edit'
  const supplierWorkId =
    effectiveRecruitTarget === 'edit' ? 'edit' : effectiveRecruitTarget === 'shoot' ? 'shoot' : 'talent'

  const isEditIce = mpOrder ? isEditTeamIceMpOrder(mpOrder) : false
  const isPackIce = mpOrder ? isPackSlotIceOrder(mpOrder) : false
  const freeSlots = mpOrder ? countFreeEditPackSlots(mpOrder) : 0

  const rows = useMemo(
    () => resolveApplyRows(tpl, platform, { isIceMode, recruitTarget: effectiveRecruitTarget }),
    [tpl, platform, isIceMode, effectiveRecruitTarget],
  )

  const recruitStats = useMemo(() => {
    if (!mpOrder) return null
    const isIce = isIceMode || isIceMpOrder(mpOrder)
    const recruitCap = parseIceSlotTotalFromMp(mpOrder)
    let applicantCount = resolveApplicantCountFromMp(mpOrder)
    if (isIce) {
      applicantCount = countIceClaimedSlots(mpOrder, recruitCap).claimed
    }
    return {
      recruitCountText: isIce ? `${recruitCap} 位` : `${recruitCap} 人`,
      applicantCountText: isIce
        ? `${Math.min(applicantCount, recruitCap > 0 ? recruitCap : applicantCount)} 位`
        : `${applicantCount} 人`,
    }
  }, [mpOrder, isIceMode])

  useEffect(() => {
    void (async () => {
      try {
        const reg = await fetchMpRegistry({ includeMpOrderIds: [orderId] })
        const list = (Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []) as Record<
          string,
          unknown
        >[]
        const mp = list.find((o) => o && o.id === orderId) || null
        setMpOrder(mp)
        const meta =
          mp?.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
            ? (mp.mpPublishMeta as Record<string, unknown>)
            : null
        setOrderMeta(meta)
      } catch {
        setMpOrder(null)
        setOrderMeta(null)
      }
    })()
  }, [orderId])

  const member = readMember()
  const canSyncMember = isSupplierApply
    ? supplierMemberSyncAvailable(member, supplierWorkId)
    : memberSyncAvailable(member, platform)

  const [form, setForm] = useState(() => ({
    ...emptyApplyFields(),
    ...(applyFieldsFromMember(readMember(), platform) || {}),
  }))
  const [formReady, setFormReady] = useState(false)
  const [exclusivePromptDone, setExclusivePromptDone] = useState(false)

  useEffect(() => {
    if (formReady) return
    if (!mpOrder && !orderMeta) return
    const memberFields = canSyncMember
      ? isSupplierApply
        ? applyFieldsFromSupplierMember(member, supplierWorkId)
        : applyFieldsFromMember(member, platform)
      : null
    const quoteFromPolicy =
      !isSupplierApply && memberFields ? resolveDefaultApplyQuotePrice(member, platform) : ''
    setForm({
      ...(isSupplierApply ? emptySupplierApplyFields() : emptyApplyFields()),
      ...(memberFields || {}),
      ...(quoteFromPolicy ? { quotePrice: quoteFromPolicy } : {}),
    })
    setFormReady(true)
  }, [mpOrder, orderMeta, canSyncMember, isSupplierApply, supplierWorkId, member, platform, formReady])

  useEffect(() => {
    if (!formReady || exclusivePromptDone) return
    const offer = isSupplierApply
      ? getExclusiveQuoteOfferForSupplier(member, orderMeta, supplierWorkId as 'shoot' | 'edit')
      : getExclusiveQuoteOffer(member, platform, orderMeta)
    if (!offer) return
    setExclusivePromptDone(true)
    const dimHint = offer.dimension ? `（${offer.dimension}）` : ''
    const useExclusive = window.confirm(
      `您已为 ${offer.prLabel} 设置专属价 ¥${offer.quoteYuan}${dimHint}，是否使用该价格？`,
    )
    if (useExclusive) {
      setForm((f) => ({ ...f, quotePrice: String(offer.quoteYuan) }))
    }
  }, [formReady, isSupplierApply, exclusivePromptDone, member, platform, orderMeta, supplierWorkId])

  const [claimSlotCount, setClaimSlotCount] = useState('1')
  const [syncMember, setSyncMember] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')
  const lb = labels(platform)
  const applyLabel = isSupplierApply
    ? supplierWorkId === 'shoot'
      ? '拍摄团队'
      : '剪辑团队'
    : platform

  const gate = mpOrder ? validateRecruitmentClaim(mpOrder, workIdentity) : { ok: true as const }
  const canReclaim = mpOrder ? canReclaimIceOrder(mpOrder, orderId) : false
  const applyBlockHint = mpOrder ? claimBlockHint(mpOrder, workIdentity) : ''
  const signupClosed = mpOrder ? resolveSignupClosed(mpOrder) : false
  const gateMessage = canReclaim
    ? ''
    : signupClosed
      ? '报名已截止'
      : applyBlockHint || (!gate.ok ? gate.message : '')

  function setField(key: string, value: string) {
    if (key === 'visitTimeStart' || key === 'visitTimeEnd') {
      const start = key === 'visitTimeStart' ? value : String(form.visitTimeStart || '')
      const end = key === 'visitTimeEnd' ? value : String(form.visitTimeEnd || '')
      if (start && end && !isValidVisitTimeRange(start, end)) {
        setErr('结束时间须晚于开始时间')
        return
      }
      setErr('')
    }
    if (key.startsWith('custom_')) {
      setForm((f) => ({
        ...f,
        customFields: { ...f.customFields, [key]: value },
      }))
    } else {
      setForm((f) => ({ ...f, [key]: value }))
    }
  }

  function fieldValue(row: ApplyRow) {
    if (row.bindKey.startsWith('custom_')) return form.customFields[row.bindKey] || ''
    return String((form as Record<string, unknown>)[row.bindKey] ?? '')
  }

  async function onSubmit() {
    if (gateMessage) {
      setErr(gateMessage)
      return
    }
    if (signupClosed) {
      setErr('报名已截止')
      return
    }
    const errMsg = validateApplyRows(rows, form as unknown as Record<string, unknown>, platform, {
      isIceMode,
      isSupplierApply,
    })
    if (errMsg) {
      setErr(errMsg)
      return
    }
    if (isPackIce) {
      const n = Math.max(1, Number.parseInt(String(claimSlotCount || '1'), 10) || 1)
      if (n > freeSlots) {
        setErr(`剩余可认领 ${freeSlots} 条，无法认领 ${n} 条`)
        return
      }
    }
    if (canReclaim) {
      clearLocalIceApplyState(orderId)
    } else if (hasAppliedToOrder(orderId)) {
      setErr('您已报名该招募，请勿重复提交')
      return
    }
    setSubmitting(true)
    setErr('')
    try {
      const applicantId = `app-${Date.now()}`
      let applicant = buildApplicantFromRows(rows, form as unknown as Record<string, unknown>, {
        platform,
        isIceMode,
        isSupplierApply,
        supplierWorkId,
        mpOrderId: orderId,
        merchantOrderNo,
        applicantId,
        appliedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      })
      applicant = enrichApplicantFromMember(applicant, readMember(), platform, {
        isSupplierApply,
        workId: supplierWorkId,
      })
      const displayName = isSupplierApply
        ? String(applicant.teamName || applicant.name || applicant.contact || '').trim()
        : String(applicant.platformNickname || applicant.name || '').trim()
      if (!displayName) {
        setErr(isSupplierApply ? '请填写团队名称或联系电话' : '请填写抖音昵称或完善我的信息')
        return
      }
      const slots = isPackIce ? Math.max(1, Number.parseInt(String(claimSlotCount || '1'), 10) || 1) : undefined
      await applyToMpOrder(orderId, applicant, workIdentity, slots)
      const persisted = persistApplicantToMemberProfile(readMember(), applicant, platform)
      if (persisted) writeMember(persisted)
      if (member && syncMember) {
        try {
          await registerTalentMember(member as unknown as Record<string, unknown>)
        } catch {
          /* ignore */
        }
      }
      addApplication({ mpOrderId: orderId, applicantId, title: merchantOrderNo, platform })
      pushNotification({
        category: 'order',
        title: isEditIce ? '认领已提交' : '报名已提交',
        body: isEditIce
          ? `请到「我的报名」确认接收 ${merchantOrderNo}`
          : `${merchantOrderNo} · ${applyLabel}`,
        mpOrderId: orderId,
        applicantId,
      })
      if (isIceMode) localStorage.setItem(`meoo_ice_applicant_v1_${orderId}`, applicantId)
      if (isEditIce || isPackIce) {
        window.alert(
          '剪辑认领成功，请在30分钟内去「我的报名」确认订单，超时将自动放弃并释放条数。',
        )
      } else if (isIceMode) {
        window.alert(
          '认领成功，请在30分钟内去「我的报名」确认订单，超时将自动放弃并释放条数。',
        )
      }
      nav(`/recruitment/${encodeURIComponent(orderId)}?applied=1`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '报名失败'
      if (/already_applied|已报名/i.test(msg)) {
        setErr('您已报名该招募，请勿重复提交')
      } else {
        setErr(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    if (!mpOrder || canReclaim) return
    if (gateMessage) {
      window.alert(gateMessage)
      nav(`/recruitment/${encodeURIComponent(orderId)}`, { replace: true })
      return
    }
    const contactGate = evaluateContactPrGate(mpOrder, orderId)
    if (contactGate.hasApplication) {
      window.alert('您已报名该招募')
      nav(`/recruitment/${encodeURIComponent(orderId)}`, { replace: true })
    }
  }, [mpOrder, canReclaim, gateMessage, orderId, nav])

  if (mpOrder && gateMessage && !canReclaim) {
    return (
      <div className="page-content-shell page-content-shell--narrow space-y-4">
        <Link to={`/recruitment/${encodeURIComponent(orderId)}`} className="text-sm text-slate-400 hover:text-white">
          ← 返回详情
        </Link>
        <p className="text-amber-400">{gateMessage}</p>
      </div>
    )
  }

  return (
    <div className="page-content-shell page-content-shell--narrow space-y-4">
      <Link to={`/recruitment/${encodeURIComponent(orderId)}`} className="text-sm text-[var(--shell-muted)] hover:text-violet-600">
        ← 返回详情
      </Link>
      <PageHero
        title={`${isEditIce ? '认领剪辑云剪' : '报名'} · ${tpl.name}`}
        subtitle={`${applyLabel} · ${merchantOrderNo}`}
        badge={isIceMode ? '云剪认领' : '在线报名'}
      />

      {recruitStats ? (
        <section className="surface-card rounded-xl border divide-y divide-slate-100">
          <div className="flex items-start gap-3 px-4 py-3">
            <span className="text-lg leading-none" aria-hidden>
              👤
            </span>
            <div className="min-w-0">
              <p className="text-xs text-[var(--shell-muted)]">招募人数</p>
              <p className="text-base font-semibold text-[var(--shell-text)]">{recruitStats.recruitCountText}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 px-4 py-3">
            <span className="text-lg leading-none" aria-hidden>
              ✓
            </span>
            <div className="min-w-0">
              <p className="text-xs text-[var(--shell-muted)]">已报名人数</p>
              <p className="text-base font-semibold text-[var(--shell-text)]">{recruitStats.applicantCountText}</p>
            </div>
          </div>
        </section>
      ) : null}

      {isPackIce ? (
        <FormSection title="认领条数" desc={`剩余可认领 ${freeSlots} 条成片位`}>
          <input
            className="w-full rounded-lg panel-input border px-3 py-2"
            type="number"
            min={1}
            max={Math.max(1, freeSlots)}
            value={claimSlotCount}
            onChange={(e) => setClaimSlotCount(e.target.value)}
          />
        </FormSection>
      ) : null}

      {canSyncMember ? (
        <label className="flex items-center gap-2 text-sm surface-card rounded-xl border p-3">
          <input
            type="checkbox"
            checked={syncMember}
            onChange={(e) => {
              const on = e.target.checked
              setSyncMember(on)
              if (on) {
                const fields = isSupplierApply
                  ? applyFieldsFromSupplierMember(member, supplierWorkId)
                  : applyFieldsFromMember(member, platform)
                if (fields) setForm((f) => ({ ...f, ...fields }))
              } else {
                setForm({
                  ...(isSupplierApply ? emptySupplierApplyFields() : emptyApplyFields()),
                  customFields: {},
                })
              }
            }}
          />
          同步{isSupplierApply ? '团队' : '我的'}信息到本单
        </label>
      ) : (
        <p className="text-sm text-amber-600 surface-card rounded-xl border p-3">
          <Link to={isSupplierApply ? '/profile/supplier' : '/profile/talent'} className="underline font-medium">
            {isSupplierApply ? '完善团队信息' : '完善我的信息'}
          </Link>
          后可一键填入
        </p>
      )}

      <FormSection
        title={
          isEditIce
            ? '剪辑师信息'
            : isSupplierApply
              ? supplierWorkId === 'shoot'
                ? '拍摄团队报名信息'
                : '剪辑团队报名信息'
              : '达人报名信息'
        }
      >
        {rows.map((row) => (
          <ApplyFieldInput key={row.id} row={row} value={fieldValue(row)} lb={lb} form={form} onChange={setField} />
        ))}
      </FormSection>

      {err ? <p className="text-red-500 text-sm">{err}</p> : null}

      <StickyActionBar
        right={
          <BtnPrimary disabled={submitting || signupClosed} onClick={() => void onSubmit()}>
            {submitting ? '提交中…' : isEditIce || isIceMode ? '认领任务' : '提交报名'}
          </BtnPrimary>
        }
      />
    </div>
  )
}

function ApplyFieldInput({
  row,
  value,
  lb,
  form,
  onChange,
}: {
  row: ApplyRow
  value: string
  lb: ReturnType<typeof labels>
  form: ReturnType<typeof emptyApplyFields>
  onChange: (k: string, v: string) => void
}) {
  if (row.isRegion && row.role === 'province') {
    return (
      <div key={row.id}>
        <span className="text-slate-400">{row.displayLabel}</span>
        <div className="mt-2">
          <RegionSelect
            province={form.province}
            city={form.city}
            onChange={(province, city) => {
              onChange('province', province)
              onChange('city', city)
            }}
          />
        </div>
      </div>
    )
  }
  if (row.isRegion && row.role === 'city') return null
  if (row.isPicker && row.role === 'douyinSalesLevel') {
    return (
      <label key={row.id} className="block">
        <span className="text-slate-400">{row.displayLabel}</span>
        <select
          className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
          value={value}
          onChange={(e) => onChange('douyinSalesLevel', e.target.value)}
        >
          <option value="">请选择</option>
          {DOUYIN_LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>
    )
  }
  if (row.isDate) {
    return (
      <label key={row.id} className="block">
        <span className="text-slate-400">{row.displayLabel}</span>
        <input
          type="date"
          className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
          value={value}
          onChange={(e) => onChange(row.bindKey, e.target.value)}
        />
      </label>
    )
  }
  if (row.isTime) {
    return (
      <label key={row.id} className="block">
        <span className="text-slate-400">{row.displayLabel}</span>
        <input
          type="time"
          className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
          value={value}
          onChange={(e) => onChange(row.bindKey, e.target.value)}
        />
      </label>
    )
  }
  return (
    <label key={row.id} className="block">
      <span className="text-slate-400">
        {row.displayLabel}
        {row.required ? ' *' : ''}
      </span>
      <input
        className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
        type={row.type === 'number' || row.type === 'digit' ? 'number' : 'text'}
        placeholder={row.placeholder || (row.role === 'platformAccount' ? `请输入${lb.accountId}` : '')}
        value={value}
        onChange={(e) => onChange(row.bindKey, e.target.value)}
      />
    </label>
  )
}
