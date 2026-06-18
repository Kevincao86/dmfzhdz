import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { appendMpRecruitmentOrder, clearMpRegistryCache, fetchMpRegistry, updateMpRecruitmentOrder } from '../../lib/mpApi'
import { addPublishedOrder } from '../../lib/mpSync/applicationsStore'
import {
  saveApplyFormForMpOrder,
  setActiveTemplateId,
  templateKindFromRecruitTarget,
  type ApplyField,
} from '../../lib/mpSync/applyFormTemplates'
import PublishWizardSheets, { type PickerView } from './PublishWizardSheets'
import RecruitCoverField from './RecruitCoverField'
import PublishLinkeAttachSection from './PublishLinkeAttachSection'
import { formatSignupDeadlineDisplay } from './SignupDeadlineSheet'
import { formPatchFromMpOrder } from '../../lib/mpSync/mpOrderPublishRestore'
import { initModalState } from '../../lib/mpSync/publishCityPicker'
import {
  computePublishDisplay,
  defaultSignupDate,
  emptyPublishForm,
  validatePublishForm,
  buildPublishOrder,
  type PublishForm,
} from '../../lib/mpSync/publishOrder'
import { clampNonNegativeInput } from '../../lib/mpSync/publishNumeric'
import {
  DELIVERY_WINDOWS,
  newFansTier,
  newLevelTier,
  RECRUIT_MODES,
  RECRUIT_TARGETS,
  ICE_VERIFY_MODES,
  modesForTarget,
} from '../../lib/mpSync/publishFormOptions'
import {
  ASPECT_RATIOS,
  DELIVERABLES,
  EDIT_STYLES,
  MATERIAL_SOURCES,
  PACKAGE_TAGS,
  SHOOT_EQUIPMENT,
  TARGET_DURATIONS,
  toggleMultiTagList,
  toggleSingleTagList,
} from '../../lib/mpSync/supplierPublishForm'
import {
  defaultLiveApplyFields,
  LIVE_DURATIONS,
  LIVE_PLATFORMS,
  LIVE_TYPES,
  SAMPLE_POLICIES,
} from '../../lib/mpSync/livePublishForm'
import {
  clearPublishDraft,
  getLatestPublishDraftForMode,
  getPublishDraftById,
  savePublishDraft,
  type PublishWizardDraft,
} from '../../lib/mpSync/publishDraft'
import { readPrProfile } from '../../lib/mpSync/userProfile'
import { readImageFileAsDataUrl } from '../../lib/mpSync/mpGroupQr'
import {
  BtnOutline,
  BtnPrimary,
  BtnSecondary,
  StickyActionBar,
  TipsCard,
  TwoColumnLayout,
} from '../ui/MockupLayouts'
import PageHero from '../ui/PageHero'

const PUBLISH_EDIT_KEY = 'meoo_publish_edit_mp_id'

const PUBLISH_TIPS = [
  { title: '标题简洁清晰', desc: '突出合作主题与品牌，便于达人快速理解。' },
  { title: '选择合适的平台', desc: '按实际投放渠道选择，影响大厅推荐与匹配。' },
  { title: '预算设置合理', desc: '填写真实预算区间，提升报名转化率。' },
  { title: '封面吸引眼球', desc: '建议 1200×675，清晰展示产品或场景。' },
  { title: '信息真实完整', desc: '需求、档期、交付说明写全，减少沟通成本。' },
]

function PubLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-1">
      <span className="form-field-label" style={{ marginBottom: 0 }}>
        {children}
      </span>
      {hint ? <p className="text-xs text-[var(--shell-muted)] mt-0.5">{hint}</p> : null}
    </div>
  )
}

function PubSelectRow({
  label,
  hint,
  value,
  placeholder,
  onClick,
}: {
  label: string
  hint?: string
  value: string
  placeholder?: boolean
  onClick: () => void
}) {
  return (
    <div className="pub-field">
      <PubLabel hint={hint}>{label}</PubLabel>
      <button
        type="button"
        onClick={onClick}
        className="w-full flex justify-between items-center rounded-lg panel-input border px-3 py-2.5 text-left text-sm"
      >
        <span className={placeholder ? 'text-slate-500' : ''}>{value}</span>
        <span className="text-slate-500">›</span>
      </button>
    </div>
  )
}

export default function PublishWizard() {
  const nav = useNavigate()
  const [search] = useSearchParams()
  const pr = readPrProfile()

  const [step, setStep] = useState<'target' | 'mode' | 'placeholder' | 'form' | 'done'>('target')
  const [recruitTarget, setRecruitTarget] = useState('')
  const [recruitTargetLabel, setRecruitTargetLabel] = useState('')
  const [recruitMode, setRecruitMode] = useState('')
  const [recruitModeLabel, setRecruitModeLabel] = useState('')
  const [form, setForm] = useState<PublishForm>(emptyPublishForm)
  const [pickerView, setPickerView] = useState<PickerView>('')
  const [todayDate] = useState(defaultSignupDate)
  const [signupDeadlineDate, setSignupDeadlineDate] = useState('')
  const [signupDeadlineTime, setSignupDeadlineTime] = useState('23:59')
  const [submitting, setSubmitting] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [draftHint, setDraftHint] = useState('')
  const [err, setErr] = useState('')
  const draftRestoredRef = useRef(false)
  const [draftId, setDraftId] = useState('')
  const [doneId, setDoneId] = useState('')

  const [editMpId, setEditMpId] = useState('')
  const [editingOrder, setEditingOrder] = useState<Record<string, unknown> | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)

  const [cityKeyword, setCityKeyword] = useState('')
  const [cityActiveProvince, setCityActiveProvince] = useState('')
  const [cityProvinceRows, setCityProvinceRows] = useState<{ name: string; active: boolean }[]>([])
  const [cityCheckGrid, setCityCheckGrid] = useState<{ name: string; on: boolean }[]>([])

  const [tagSelected, setTagSelected] = useState<Set<string>>(new Set())
  const [reqLevelSelected, setReqLevelSelected] = useState<Set<string>>(new Set(['不限']))
  const [editingTierIndex, setEditingTierIndex] = useState(-1)
  const [tierLevelSelected, setTierLevelSelected] = useState<Set<string>>(new Set())

  const [applyEditorFields, setApplyEditorFields] = useState<ApplyField[]>([])
  const [applyEditorName, setApplyEditorName] = useState('')
  const [applyEditorTplId, setApplyEditorTplId] = useState('')
  const [applyEditorMode, setApplyEditorMode] = useState<'new' | 'template'>('new')
  const [showDeadlineSheet, setShowDeadlineSheet] = useState(false)
  const [deliveryDeadlineDate, setDeliveryDeadlineDate] = useState('')
  const [deliveryDeadlineTime, setDeliveryDeadlineTime] = useState('18:00')
  const [showDeliveryDeadlineSheet, setShowDeliveryDeadlineSheet] = useState(false)
  const groupQrInputRef = useRef<HTMLInputElement>(null)
  const editGroupQrInputRef = useRef<HTMLInputElement>(null)
  const [groupQrUploading, setGroupQrUploading] = useState(false)
  const [editGroupQrUploading, setEditGroupQrUploading] = useState(false)

  const display = useMemo(() => computePublishDisplay(form, recruitMode), [form, recruitMode])
  const isSupplierPublish = recruitTarget === 'shoot' || recruitTarget === 'edit'
  const filteredModes = useMemo(() => modesForTarget(recruitTarget || 'talent'), [recruitTarget])

  const syncDeadline = useCallback((date: string, time: string) => {
    if (!date) {
      setForm((f) => ({ ...f, signupDeadline: '' }))
      return
    }
    setForm((f) => ({ ...f, signupDeadline: `${date} ${time || '23:59'}:00` }))
  }, [])

  const syncDeliveryDeadline = useCallback((date: string, time: string) => {
    if (!date) {
      setForm((f) => ({ ...f, deliveryDeadline: '' }))
      return
    }
    setForm((f) => ({ ...f, deliveryDeadline: `${date} ${time || '18:00'}:00` }))
  }, [])

  const refreshCityUi = useCallback(
    (hint?: string) => {
      const st = initModalState(cityKeyword, hint ?? cityActiveProvince, form.selectedCities)
      setCityActiveProvince(st.activeProvince)
      setCityProvinceRows(st.provinceRows)
      setCityCheckGrid(st.cityCheckGrid)
    },
    [cityKeyword, cityActiveProvince, form.selectedCities],
  )

  useEffect(() => {
    if (pickerView === 'city') refreshCityUi()
  }, [cityKeyword, pickerView, refreshCityUi])

  const applyDraftToForm = useCallback((draft: PublishWizardDraft) => {
    setForm(draft.form)
    setSignupDeadlineDate(draft.signupDeadlineDate || '')
    setSignupDeadlineTime(draft.signupDeadlineTime || '23:59')
    setDeliveryDeadlineDate(draft.deliveryDeadlineDate || '')
    setDeliveryDeadlineTime(draft.deliveryDeadlineTime || '18:00')
    setTagSelected(new Set(draft.talentTags || []))
    setReqLevelSelected(new Set(draft.douyinSalesLevels?.length ? draft.douyinSalesLevels : ['不限']))
    if (draft.recruitModeLabel) setRecruitModeLabel(draft.recruitModeLabel)
    setDraftId(draft.id)
  }, [])

  useEffect(() => {
    const draftParam = search.get('draft') || ''
    if (!draftParam || isEditMode || search.get('edit')) return
    const draft = getPublishDraftById(draftParam)
    if (!draft) {
      setErr('草稿不存在或已删除')
      return
    }
    draftRestoredRef.current = true
    setRecruitMode(draft.recruitMode)
    applyDraftToForm(draft)
    setStep('form')
    setDraftHint('已从草稿箱恢复')
  }, [search, isEditMode, applyDraftToForm])

  useEffect(() => {
    if (step !== 'form' || isEditMode || draftRestoredRef.current || !recruitMode) return
    if (search.get('draft')) return
    const draft = getLatestPublishDraftForMode(recruitMode)
    if (!draft) return
    draftRestoredRef.current = true
    applyDraftToForm(draft)
    setDraftHint('已恢复该模式下最近保存的草稿')
  }, [step, isEditMode, recruitMode, search, applyDraftToForm])

  const loadEdit = useCallback(async (mpId: string) => {
    const reg = await fetchMpRegistry()
    const mp = ((reg.mpRecruitmentOrders as Record<string, unknown>[]) || []).find((o) => o?.id === mpId)
    if (!mp) throw new Error('订单不存在')
    const restored = formPatchFromMpOrder(mp)
    setStep('form')
    setRecruitMode(restored.recruitMode)
    setRecruitModeLabel(restored.recruitModeLabel)
    setForm(restored.patch)
    setSignupDeadlineDate(restored.signupDeadlineDate)
    setSignupDeadlineTime(restored.signupDeadlineTime)
    setDeliveryDeadlineDate(restored.deliveryDeadlineDate)
    setDeliveryDeadlineTime(restored.deliveryDeadlineTime)
    setTagSelected(new Set(restored.patch.talentTags))
    setReqLevelSelected(new Set(restored.patch.douyinSalesLevels))
    setEditMpId(mpId)
    setEditingOrder(mp)
    setIsEditMode(true)
  }, [])

  useEffect(() => {
    let id = search.get('edit') || ''
    if (!id) {
      try {
        id = String(localStorage.getItem(PUBLISH_EDIT_KEY) || '').trim()
        if (id) localStorage.removeItem(PUBLISH_EDIT_KEY)
      } catch {
        /* ignore */
      }
    }
    if (id) void loadEdit(id).catch((e) => setErr(e instanceof Error ? e.message : '加载失败'))
  }, [search, loadEdit])

  if (!pr?.contactPhone && !pr?.companyName && !pr?.personalName) {
    return (
      <div className="page-content-shell page-content-shell--narrow space-y-4">
        <h2 className="text-xl font-bold">发布招募</h2>
        <p className="text-amber-400 text-sm">请先完善 PR 资料后再发单。</p>
        <Link to="/profile/pr" className="text-violet-400 underline text-sm">
          去填写 PR 信息
        </Link>
      </div>
    )
  }

  function patchForm(patch: Partial<PublishForm>) {
    setForm((f) => ({ ...f, ...patch }))
  }

  function patchNumericField(key: keyof PublishForm, raw: string) {
    patchForm({ [key]: clampNonNegativeInput(raw) } as Partial<PublishForm>)
  }

  async function onUploadGroupQr(file: File) {
    if (groupQrUploading) return
    setGroupQrUploading(true)
    setErr('')
    try {
      const dataUrl = await readImageFileAsDataUrl(file)
      patchForm({ groupQrImage: dataUrl })
    } catch (e) {
      setErr(e instanceof Error ? e.message : '群二维码上传失败')
    } finally {
      setGroupQrUploading(false)
    }
  }

  async function onUploadEditGroupQr(file: File) {
    if (editGroupQrUploading) return
    setEditGroupQrUploading(true)
    setErr('')
    try {
      const dataUrl = await readImageFileAsDataUrl(file)
      patchForm({ editGroupQrImage: dataUrl })
    } catch (e) {
      setErr(e instanceof Error ? e.message : '剪辑师群二维码上传失败')
    } finally {
      setEditGroupQrUploading(false)
    }
  }

  function openPicker(view: PickerView) {
    setErr('')
    if (view === 'applyMenu' && !form.platform) {
      setErr('请先选择招募平台')
      return
    }
    if (view === 'city') refreshCityUi('')
    if (view === 'tag') setTagSelected(new Set(form.talentTags))
    if (view === 'reqLevel') setReqLevelSelected(new Set(form.douyinSalesLevels.length ? form.douyinSalesLevels : ['不限']))
    setPickerView(view)
  }

  const deadlineDisplayText = signupDeadlineDate
    ? formatSignupDeadlineDisplay(signupDeadlineDate, signupDeadlineTime)
    : display.signupDeadlineDisplay

  const deliveryDeadlineDisplayText = deliveryDeadlineDate
    ? formatSignupDeadlineDisplay(deliveryDeadlineDate, deliveryDeadlineTime)
    : form.deliveryDeadline
      ? String(form.deliveryDeadline).slice(0, 16)
      : ''

  async function onSubmit() {
    const vErr = validatePublishForm(form, recruitMode, recruitTarget || 'talent')
    if (vErr) {
      setErr(vErr)
      return
    }
    setSubmitting(true)
    setErr('')
    setDraftHint('')
    try {
      const order = buildPublishOrder(form, recruitMode, {
        editId: editMpId || undefined,
        existing: editingOrder || undefined,
        recruitTarget: recruitTarget || 'talent',
      })
      if (isEditMode && editMpId) {
        await updateMpRecruitmentOrder(order)
      } else {
        await appendMpRecruitmentOrder(order)
        clearMpRegistryCache()
        const pubHall =
          recruitMode === 'ice' || recruitMode === 'edit_ice'
            ? 'ice'
            : form.deliveryWindow === 'urgent'
              ? 'urgent'
              : 'normal'
        addPublishedOrder({ mpOrderId: String(order.id), title: String(order.title), hall: pubHall })
        if (draftId) clearPublishDraft(draftId)
      }
      saveApplyFormForMpOrder(String(order.id), {
        templateId: form.applyFormTemplateId,
        templateName: form.applyFormTemplateName,
        fields: form.applyFormFields,
      })
      if (form.applyFormTemplateId) {
        setActiveTemplateId(form.applyFormTemplateId, templateKindFromRecruitTarget(recruitTarget))
      }
      setDoneId(String(order.id))
      setStep('done')
    } catch (e) {
      setErr(e instanceof Error ? e.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function onSaveDraft() {
    if (isEditMode) return
    setSavingDraft(true)
    setErr('')
    try {
      const id = savePublishDraft(
        {
          recruitMode,
          recruitModeLabel,
          form,
          signupDeadlineDate,
          signupDeadlineTime,
          deliveryDeadlineDate,
          deliveryDeadlineTime,
          talentTags: [...tagSelected],
          douyinSalesLevels: [...reqLevelSelected],
        },
        draftId || undefined,
      )
      setDraftId(id)
      setDraftHint('草稿已保存，可在「我的发单 → 草稿箱」查看与继续编辑')
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存草稿失败')
    } finally {
      setSavingDraft(false)
    }
  }

  if (step === 'done' && doneId) {
    return (
      <div className="page-content-shell page-content-shell--narrow space-y-4">
        <h2 className="text-xl font-bold text-emerald-400">{isEditMode ? '已保存' : '发布成功'}</h2>
        <p className="text-sm text-slate-400">单号 {doneId}</p>
        <div className="flex gap-3">
          <button type="button" className="px-4 py-2 rounded-lg bg-violet-600" onClick={() => nav('/orders')}>
            已发布招募单
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-lg border border-white/20"
            onClick={() => {
              setDoneId('')
              setStep('target')
              setForm(emptyPublishForm())
              setIsEditMode(false)
              setEditMpId('')
              setDraftId('')
              draftRestoredRef.current = false
            }}
          >
            再发一单
          </button>
        </div>
      </div>
    )
  }

  if (step === 'target') {
    return (
      <div className="page-content-shell page-content-shell--narrow space-y-5">
        <PageHero
          title="发布招募"
          subtitle="先选择招募对象，再进入探店 / 品宣 / 直播等模式填写表单。"
          badge="步骤 1/4"
        />
        <p className="text-sm text-[var(--shell-muted)] px-1">选择招募对象 · 达人 · 拍摄 · 剪辑</p>
        <div className="grid gap-3 sm:grid-cols-1">
          {RECRUIT_TARGETS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`choice-card w-full text-left rounded-xl border p-5 ${
                'placeholder' in t && t.placeholder
                  ? 'border-white/5 opacity-80'
                  : 'surface-card border hover-panel'
              }`}
              onClick={() => {
                setRecruitTarget(t.id)
                setRecruitTargetLabel(t.label)
                setForm(emptyPublishForm(t.id))
                setStep('mode')
              }}
            >
              <div className="font-semibold text-lg text-[var(--shell-text)]">{t.label}</div>
              <div className="text-sm text-[var(--shell-muted)] mt-1.5 leading-relaxed">{t.sub}</div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (step === 'mode') {
    return (
      <div className="page-content-shell page-content-shell--narrow space-y-4">
        <button type="button" className="text-slate-400 text-sm" onClick={() => setStep('target')}>
          ‹ 返回
        </button>
        <h2 className="text-xl font-bold">选择招募模式</h2>
        <p className="text-sm text-slate-400">探店 · 品宣 · 直播达人</p>
        <div className="space-y-3">
          {filteredModes.map((m) => (
            <button
              key={m.id}
              type="button"
              className="choice-card w-full text-left surface-card rounded-xl border p-4"
              onClick={() => {
                setRecruitMode(m.id)
                setRecruitModeLabel(m.label)
                setSignupDeadlineDate('')
                setSignupDeadlineTime('23:59')
                setDraftId('')
                draftRestoredRef.current = false
                if (m.id === 'live') {
                  setForm((prev) => ({
                    ...prev,
                    applyFormFields: defaultLiveApplyFields(),
                    applyFormTemplateName: '直播达人报名默认项',
                  }))
                }
                setStep('form')
              }}
            >
              <div className="font-semibold">{m.label}</div>
              <div className="text-sm text-slate-400 mt-1">{m.sub}</div>
            </button>
          ))}
        </div>
      </div>
    )
  }


  return (
    <>
    <div className="page-content-shell page-content-shell--wide space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="text-[var(--shell-muted)] text-sm hover:text-[var(--shell-text)]"
          onClick={() => (isEditMode ? nav('/orders') : setStep('mode'))}
        >
          ‹ 返回
        </button>
        <div>
          <h2 className="text-xl font-bold text-[var(--shell-text)]">
            {isEditMode ? '编辑招募' : '填写招募信息'}
          </h2>
          <p className="text-sm text-[var(--shell-muted)] mt-0.5">
            {recruitTargetLabel} · {recruitModeLabel}
          </p>
        </div>
      </div>

      <TwoColumnLayout
        aside={<TipsCard title="填写小贴士" items={PUBLISH_TIPS} />}
        main={
      <section className="pub-form-card space-y-4 text-sm">
        <div>
          <PubLabel>投放窗口 *</PubLabel>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {DELIVERY_WINDOWS.map((w) => (
              <button
                key={w.id}
                type="button"
                className={`p-3 rounded-lg text-left border ${form.deliveryWindow === w.id ? 'border-violet-500 bg-violet-600/15' : 'border-[var(--shell-border)]'}`}
                onClick={() => {
                  patchForm({
                    deliveryWindow: w.id,
                    signupDeadline: w.id === 'urgent' ? '' : form.signupDeadline,
                  })
                  if (w.id === 'urgent') {
                    setSignupDeadlineDate('')
                  }
                }}
              >
                <div className="font-medium text-xs">{w.label}</div>
                <div className="text-[10px] text-slate-500 mt-1">{w.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {display.showSignupDeadline ? (
          <PubSelectRow
            label="招募报名截止时间 *"
            value={deadlineDisplayText}
            placeholder={!signupDeadlineDate}
            onClick={() => setShowDeadlineSheet(true)}
          />
        ) : (
          <p className="text-xs text-amber-500/90">急单大厅：发布后 24 小时内截止报名（无需填写）</p>
        )}

        <div>
          <PubLabel>招募标题 *</PubLabel>
          <input
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            placeholder={recruitMode === 'live' ? '如：火锅专场直播带货招募' : '如：春季火锅探店招募'}
            value={form.title}
            onChange={(e) => patchForm({ title: e.target.value })}
          />
        </div>

        {recruitMode === 'live' ? (
          <div className="space-y-3 rounded-lg border border-[var(--shell-border)] p-3">
            <PubLabel>直播平台 *</PubLabel>
            <div className="flex flex-wrap gap-2">
              {LIVE_PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`px-2 py-1 rounded text-xs ${form.livePlatform === p ? 'bg-violet-600' : 'bg-white/10'}`}
                  onClick={() =>
                    patchForm({
                      livePlatform: p,
                      platform: p.replace(/直播$/, ''),
                    })
                  }
                >
                  {p}
                </button>
              ))}
            </div>
            <PubLabel>直播日期 *</PubLabel>
            <input
              type="date"
              className="w-full rounded-lg panel-input border px-3 py-2"
              value={form.liveDate}
              onChange={(e) => patchForm({ liveDate: e.target.value })}
            />
            <PubLabel>开播时间 *</PubLabel>
            <input
              type="time"
              className="w-full rounded-lg panel-input border px-3 py-2"
              value={form.liveTimeStart}
              onChange={(e) => patchForm({ liveTimeStart: e.target.value })}
            />
            <PubLabel>预计时长 *</PubLabel>
            <div className="flex flex-wrap gap-2">
              {LIVE_DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`px-2 py-1 rounded text-xs ${form.liveDuration === d ? 'bg-violet-600' : 'bg-white/10'}`}
                  onClick={() => patchForm({ liveDuration: d })}
                >
                  {d}
                </button>
              ))}
            </div>
            <PubLabel>直播类型 *</PubLabel>
            <div className="flex flex-wrap gap-2">
              {LIVE_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`px-2 py-1 rounded text-xs ${form.liveType === t ? 'bg-violet-600' : 'bg-white/10'}`}
                  onClick={() => patchForm({ liveType: t })}
                >
                  {t}
                </button>
              ))}
            </div>
            <PubLabel>带货商品/套餐说明 *</PubLabel>
            <textarea
              className="w-full rounded-lg panel-input border px-3 py-2 min-h-[88px]"
              placeholder="商品名称、规格、团购价、佣金空间、是否独家等"
              value={form.productSummary}
              onChange={(e) => patchForm({ productSummary: e.target.value })}
            />
            <PubLabel>样品/寄样方式 *</PubLabel>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_POLICIES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`px-2 py-1 rounded text-xs ${form.samplePolicy === s ? 'bg-violet-600' : 'bg-white/10'}`}
                  onClick={() => patchForm({ samplePolicy: s })}
                >
                  {s}
                </button>
              ))}
            </div>
            <PubLabel>脚本/话术要求</PubLabel>
            <textarea
              className="w-full rounded-lg panel-input border px-3 py-2 min-h-[72px]"
              placeholder="口播要点、禁说词、优惠机制、挂车链接说明等"
              value={form.scriptRequirement}
              onChange={(e) => patchForm({ scriptRequirement: e.target.value })}
            />
          </div>
        ) : null}

        {!isSupplierPublish && recruitMode !== 'live' ? (
          <PubSelectRow
            label="招募平台 *"
            value={display.platformDisplayText}
            placeholder={!form.platform}
            onClick={() => openPicker('platform')}
          />
        ) : null}
        <PubSelectRow
          label="招募城市 *"
          value={display.cityDisplayText}
          placeholder={display.cityDisplayText === '请选择招募城市'}
          onClick={() => openPicker('city')}
        />
        <PubSelectRow
          label={isSupplierPublish ? '需求品类标签 *' : '需求达人标签 *'}
          hint="最多 2 个，不可重复"
          value={display.tagsDisplayText}
          placeholder={!form.talentTags.length}
          onClick={() => openPicker('tag')}
        />

        {isSupplierPublish && recruitTarget === 'shoot' ? (
          <div className="space-y-3 rounded-lg border border-[var(--shell-border)] p-3">
            <PubLabel>拍摄日期 *</PubLabel>
            <input type="date" className="w-full rounded-lg panel-input border px-3 py-2" value={form.shootDate} onChange={(e) => patchForm({ shootDate: e.target.value })} />
            <PubLabel>拍摄时段 *</PubLabel>
            <div className="flex gap-2">
              <input type="time" className="flex-1 rounded-lg panel-input border px-3 py-2" value={form.shootTimeStart} onChange={(e) => patchForm({ shootTimeStart: e.target.value })} />
              <input type="time" className="flex-1 rounded-lg panel-input border px-3 py-2" value={form.shootTimeEnd} onChange={(e) => patchForm({ shootTimeEnd: e.target.value })} />
            </div>
            <PubLabel>拍摄地点 *</PubLabel>
            <input className="w-full rounded-lg panel-input border px-3 py-2" value={form.shootLocation} onChange={(e) => patchForm({ shootLocation: e.target.value })} />
            <PubLabel>成片交付 *</PubLabel>
            <div className="flex flex-wrap gap-2">
              {DELIVERABLES.map((d) => (
                <button key={d} type="button" className={`px-2 py-1 rounded text-xs ${form.deliverables.includes(d) ? 'bg-violet-600' : 'bg-white/10'}`} onClick={() => patchForm({ deliverables: toggleMultiTagList(form.deliverables, d) })}>{d}</button>
              ))}
            </div>
            <PubLabel>设备要求</PubLabel>
            <div className="flex flex-wrap gap-2">
              {SHOOT_EQUIPMENT.map((d) => (
                <button key={d} type="button" className={`px-2 py-1 rounded text-xs ${form.equipmentRequired.includes(d) ? 'bg-violet-600' : 'bg-white/10'}`} onClick={() => patchForm({ equipmentRequired: toggleMultiTagList(form.equipmentRequired, d) })}>{d}</button>
              ))}
            </div>
          </div>
        ) : null}

        {isSupplierPublish && recruitTarget === 'edit' ? (
          <div className="space-y-3 rounded-lg border border-[var(--shell-border)] p-3">
            <PubLabel>素材来源 *</PubLabel>
            <div className="flex flex-wrap gap-2">
              {MATERIAL_SOURCES.map((s) => (
                <button key={s} type="button" className={`px-2 py-1 rounded text-xs ${form.materialSource === s ? 'bg-violet-600' : 'bg-white/10'}`} onClick={() => patchForm({ materialSource: s })}>{s}</button>
              ))}
            </div>
            <PubLabel>素材链接</PubLabel>
            <input className="w-full rounded-lg panel-input border px-3 py-2" placeholder="网盘/链接（选填）" value={form.materialUrl} onChange={(e) => patchForm({ materialUrl: e.target.value })} />
            <PubLabel>成片画幅 *</PubLabel>
            <div className="flex flex-wrap gap-2">
              {ASPECT_RATIOS.map((a) => (
                <button key={a} type="button" className={`px-2 py-1 rounded text-xs ${form.aspectRatio === a ? 'bg-violet-600' : 'bg-white/10'}`} onClick={() => patchForm({ aspectRatio: a })}>{a}</button>
              ))}
            </div>
            <PubLabel>目标时长 *</PubLabel>
            <div className="flex flex-wrap gap-2">
              {TARGET_DURATIONS.map((d) => (
                <button key={d} type="button" className={`px-2 py-1 rounded text-xs ${form.targetDuration === d ? 'bg-violet-600' : 'bg-white/10'}`} onClick={() => patchForm({ targetDuration: d })}>{d}</button>
              ))}
            </div>
            <PubLabel>剪辑风格 *</PubLabel>
            <div className="flex flex-wrap gap-2">
              {EDIT_STYLES.map((s) => (
                <button key={s} type="button" className={`px-2 py-1 rounded text-xs ${form.styleTags.includes(s) ? 'bg-violet-600' : 'bg-white/10'}`} onClick={() => patchForm({ styleTags: toggleSingleTagList(form.styleTags, s) })}>{s}</button>
              ))}
            </div>
            <PubLabel>包装要求</PubLabel>
            <p className="text-xs text-slate-500 mb-1">可多选，选填</p>
            <div className="flex flex-wrap gap-2">
              {PACKAGE_TAGS.map((s) => (
                <button key={s} type="button" className={`px-2 py-1 rounded text-xs ${form.packageTags.includes(s) ? 'bg-violet-600' : 'bg-white/10'}`} onClick={() => patchForm({ packageTags: toggleMultiTagList(form.packageTags, s) })}>{s}</button>
              ))}
            </div>
            {recruitMode !== 'edit_ice' ? (
              <>
                <PubLabel>参考片链接</PubLabel>
                <input className="w-full rounded-lg panel-input border px-3 py-2" value={form.referenceUrl} onChange={(e) => patchForm({ referenceUrl: e.target.value })} />
              </>
            ) : null}
            <PubSelectRow
              label="交付截止时间 *"
              value={deliveryDeadlineDisplayText}
              placeholder={!deliveryDeadlineDate}
              onClick={() => setShowDeliveryDeadlineSheet(true)}
            />
          </div>
        ) : null}

        {!isSupplierPublish ? (
        <div>
          <PubLabel>达人粉丝要求 *</PubLabel>
          <div className="flex gap-2 mt-1">
            {(['unlimited', 'limit'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`flex-1 py-2 rounded-lg text-sm ${form.fansLimitMode === mode ? 'bg-violet-600' : 'bg-white/10'}`}
                onClick={() =>
                  patchForm({
                    fansLimitMode: mode,
                    fansMin: mode === 'unlimited' ? '' : form.fansMin,
                    fansRequirement: mode === 'unlimited' ? '不限' : form.fansRequirement,
                  })
                }
              >
                {mode === 'unlimited' ? '不限' : '限制'}
              </button>
            ))}
          </div>
          {form.fansLimitMode === 'limit' ? (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-slate-400 shrink-0">粉丝 ≥</span>
              <input
                className="flex-1 rounded-lg panel-input border px-3 py-2"
                placeholder="如：10000 或 1万"
                value={form.fansMin}
                onChange={(e) =>
                  patchForm({
                    fansMin: e.target.value,
                    fansRequirement: e.target.value ? `粉丝≥${e.target.value}` : '',
                  })
                }
              />
            </div>
          ) : null}
        </div>
        ) : null}

        {display.showDouyinLevel && !isSupplierPublish ? (
          <PubSelectRow label="达人带货等级 *" value={display.levelDisplayText} onClick={() => openPicker('reqLevel')} />
        ) : null}

        <PubSelectRow
          label="费用模式 *"
          value={display.feeTypeLabel}
          placeholder={!form.feeTypeId}
          onClick={() => openPicker('fee')}
        />

        {form.feeTypeId === 'fixed' ? (
          <div>
            <PubLabel>一口价金额 *</PubLabel>
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
              placeholder="请填写，0 代表置换"
              value={form.fixedPrice}
              onChange={(e) => patchNumericField('fixedPrice', e.target.value)}
            />
          </div>
        ) : null}

        {form.feeTypeId === 'self_quote' ? (
          <div>
            <PubLabel>可接受报价区间 *</PubLabel>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                min={0}
                className="flex-1 rounded-lg panel-input border px-3 py-2"
                placeholder="最低"
                value={form.selfQuoteMin}
                onChange={(e) => patchNumericField('selfQuoteMin', e.target.value)}
              />
              <span className="text-slate-500">-</span>
              <input
                type="number"
                min={0}
                className="flex-1 rounded-lg panel-input border px-3 py-2"
                placeholder="最高"
                value={form.selfQuoteMax}
                onChange={(e) => patchNumericField('selfQuoteMax', e.target.value)}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">如 0-2000，单位为元</p>
          </div>
        ) : null}

        {form.feeTypeId === 'level_tier' ? (
          <div className="space-y-3">
            <p className="text-slate-400 text-sm">请继续设置费用阶梯</p>
            {form.levelTiers.map((tier, idx) => (
              <div key={tier.id} className="rounded-lg border border-[var(--shell-border)] p-3 space-y-2 relative">
                {form.levelTiers.length > 1 ? (
                  <button
                    type="button"
                    className="absolute top-2 right-2 text-xs text-red-400"
                    onClick={() => {
                      if (form.levelTiers.length <= 1) return
                      patchForm({ levelTiers: form.levelTiers.filter((_, i) => i !== idx) })
                    }}
                  >
                    删除
                  </button>
                ) : null}
                <button
                  type="button"
                  className="w-full flex justify-between rounded-lg bg-black/20 px-3 py-2 text-sm"
                  onClick={() => {
                    setEditingTierIndex(idx)
                    setTierLevelSelected(new Set(tier.levels || []))
                    setPickerView('tierLevel')
                  }}
                >
                  <span className="text-slate-400">达人等级</span>
                  <span className={tier.levelsText === '请选择等级' ? 'text-slate-500' : ''}>{tier.levelsText}</span>
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 shrink-0">达人价格</span>
                  <input
                    type="number"
                    min={0}
                    className="flex-1 rounded-lg panel-input border px-3 py-2"
                    placeholder="0代表置换"
                    value={tier.price}
                    onChange={(e) => {
                      const tiers = form.levelTiers.map((t) => ({ ...t }))
                      tiers[idx] = { ...tiers[idx], price: clampNonNegativeInput(e.target.value) }
                      patchForm({ levelTiers: tiers })
                    }}
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              className="text-sm text-violet-400"
              onClick={() => patchForm({ levelTiers: [...form.levelTiers, newLevelTier()] })}
            >
              + 添加阶梯
            </button>
          </div>
        ) : null}

        {form.feeTypeId === 'fans_tier' ? (
          <div className="space-y-3">
            <p className="text-slate-400 text-sm">粉丝阶梯费用</p>
            {form.fansTiers.map((tier, idx) => (
              <div key={tier.id} className="rounded-lg border border-[var(--shell-border)] p-3 space-y-2 relative">
                {form.fansTiers.length > 1 ? (
                  <button
                    type="button"
                    className="absolute top-2 right-2 text-xs text-red-400"
                    onClick={() => {
                      if (form.fansTiers.length <= 1) return
                      patchForm({ fansTiers: form.fansTiers.filter((_, i) => i !== idx) })
                    }}
                  >
                    删除
                  </button>
                ) : null}
                <button
                  type="button"
                  className="w-full flex justify-between rounded-lg bg-black/20 px-3 py-2 text-sm"
                  onClick={() => {
                    setEditingTierIndex(idx)
                    setPickerView('fansTier')
                  }}
                >
                  <span className="text-slate-400">粉丝档位</span>
                  <span className={!tier.fansRange ? 'text-slate-500' : ''}>{tier.fansRangeText || '请选择粉丝档位'}</span>
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 shrink-0">达人价格</span>
                  <input
                    type="number"
                    min={0}
                    className="flex-1 rounded-lg panel-input border px-3 py-2"
                    value={tier.price}
                    onChange={(e) => {
                      const tiers = form.fansTiers.map((t) => ({ ...t }))
                      tiers[idx] = { ...tiers[idx], price: clampNonNegativeInput(e.target.value) }
                      patchForm({ fansTiers: tiers })
                    }}
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              className="text-sm text-violet-400"
              onClick={() => patchForm({ fansTiers: [...form.fansTiers, newFansTier()] })}
            >
              + 添加阶梯
            </button>
          </div>
        ) : null}

        <div>
          <PubLabel>佣金 CPS（%）</PubLabel>
          <input
            type="number"
            min={0}
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            placeholder="选填"
            value={form.cpsPercent}
            onChange={(e) => patchNumericField('cpsPercent', e.target.value)}
          />
        </div>

        <div>
          <PubLabel>{recruitMode === 'edit_ice' ? '成片位总数 *' : '招募人数 *'}</PubLabel>
          <input
            type="number"
            min={0}
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={form.recruitCount}
            onChange={(e) => patchNumericField('recruitCount', e.target.value)}
          />
        </div>

        <div>
          <PubLabel>招募详情 *</PubLabel>
          <textarea
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2 min-h-[120px]"
            placeholder="合作要求、交付内容、档期说明、注意事项等"
            maxLength={2000}
            value={form.recruitDetail}
            onChange={(e) => patchForm({ recruitDetail: e.target.value })}
          />
        </div>

        {recruitMode === 'ice' || recruitMode === 'edit_ice' ? (
          <div>
            <PubLabel>云剪审核方式 *</PubLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              {ICE_VERIFY_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`text-sm px-3 py-1.5 rounded-lg border ${
                    (form.iceVerifyMode || 'ai') === m.id
                      ? 'border-violet-500 bg-violet-600 text-white'
                      : 'border-[var(--shell-border)] text-[var(--shell-muted)] hover:bg-white/5'
                  }`}
                  onClick={() => patchForm({ iceVerifyMode: m.id as 'ai' | 'pr' })}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-[var(--shell-muted)]">
              {recruitMode === 'edit_ice'
                ? '剪辑师确认认领后可见群码，并批量回传成片链接。'
                : 'AI 核查：达人提交抖音链接后自动校验关联度；PR 审核：由招募方人工审核链接。参考片链接见上方「参考片链接」。'}
            </p>
            {recruitMode === 'ice' && (form.iceVerifyMode || 'ai') === 'ai' ? (
              <div className="mt-3">
                <PubLabel hint="订单完成后用于群结算，达人入选通知将附带此二维码">
                  上传群二维码 *
                </PubLabel>
                <input
                  ref={groupQrInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) void onUploadGroupQr(file)
                  }}
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={groupQrUploading}
                    className={`text-sm px-3 py-1.5 rounded-lg border ${
                      form.groupQrImage ? 'border-green-500 text-green-700' : ''
                    }`}
                    onClick={() => groupQrInputRef.current?.click()}
                  >
                    {groupQrUploading ? '上传中…' : form.groupQrImage ? '已上传群码' : '选择群二维码图片'}
                  </button>
                  {form.groupQrImage ? (
                    <button
                      type="button"
                      className="text-xs text-[var(--shell-muted)] underline"
                      onClick={() => patchForm({ groupQrImage: '' })}
                    >
                      清除
                    </button>
                  ) : null}
                </div>
                {form.groupQrImage ? (
                  <button
                    type="button"
                    className="mt-2 block"
                    onClick={() => window.open(form.groupQrImage, '_blank')}
                  >
                    <img src={form.groupQrImage} alt="群二维码" className="h-16 rounded border" />
                  </button>
                ) : null}
              </div>
            ) : null}
            {recruitMode === 'edit_ice' && (form.iceVerifyMode || 'ai') === 'ai' ? (
              <div className="mt-3">
                <PubLabel hint="剪辑师确认认领后可见，用于素材沟通">
                  上传剪辑师群二维码 *
                </PubLabel>
                <input
                  ref={editGroupQrInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) void onUploadEditGroupQr(file)
                  }}
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={editGroupQrUploading}
                    className={`text-sm px-3 py-1.5 rounded-lg border ${
                      form.editGroupQrImage ? 'border-green-500 text-green-700' : ''
                    }`}
                    onClick={() => editGroupQrInputRef.current?.click()}
                  >
                    {editGroupQrUploading ? '上传中…' : form.editGroupQrImage ? '已上传群码' : '选择剪辑师群二维码'}
                  </button>
                  {form.editGroupQrImage ? (
                    <button
                      type="button"
                      className="text-xs text-[var(--shell-muted)] underline"
                      onClick={() => patchForm({ editGroupQrImage: '' })}
                    >
                      清除
                    </button>
                  ) : null}
                </div>
                {form.editGroupQrImage ? (
                  <button
                    type="button"
                    className="mt-2 block"
                    onClick={() => window.open(form.editGroupQrImage, '_blank')}
                  >
                    <img src={form.editGroupQrImage} alt="剪辑师群二维码" className="h-16 rounded border" />
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <PubSelectRow
          label={isSupplierPublish ? '团队报名必填信息 *' : '达人报名必填信息 *'}
          value={display.applyFormDisplayText}
          placeholder={display.applyFormPlaceholder}
          onClick={() => openPicker('applyMenu')}
        />

        <RecruitCoverField
          platform={form.platform}
          talentTags={form.talentTags}
          coverImage={form.coverImage}
          coverLibraryId={form.coverLibraryId}
          onChange={(patch) => patchForm(patch)}
        />

        <PublishLinkeAttachSection
          platform={form.platform}
          value={form.linkeAttach}
          onChange={(linkeAttach) => patchForm({ linkeAttach })}
        />

        {err ? <p className="text-red-500 text-sm">{err}</p> : null}
        {draftHint ? <p className="text-emerald-600 text-sm">{draftHint}</p> : null}
      </section>
        }
      />

      <StickyActionBar
        left={
          <BtnOutline onClick={() => (isEditMode ? nav('/orders') : setStep('mode'))}>取消</BtnOutline>
        }
        right={
          <>
            {!isEditMode ? (
              <BtnSecondary disabled={submitting || savingDraft} onClick={() => void onSaveDraft()}>
                {savingDraft ? '保存中…' : '保存草稿'}
              </BtnSecondary>
            ) : null}
            <BtnPrimary disabled={submitting || savingDraft} onClick={() => void onSubmit()}>
              {submitting ? '提交中…' : isEditMode ? '保存修改' : '发布招募'}
            </BtnPrimary>
          </>
        }
      />
    </div>

    <PublishWizardSheets
      pickerView={pickerView}
      setPickerView={setPickerView}
      showDeadlineSheet={showDeadlineSheet}
      setShowDeadlineSheet={setShowDeadlineSheet}
      todayDate={todayDate}
      signupDeadlineDate={signupDeadlineDate}
      signupDeadlineTime={signupDeadlineTime}
      onDeadlineConfirm={(date, time) => {
        setSignupDeadlineDate(date)
        setSignupDeadlineTime(time)
        syncDeadline(date, time)
      }}
      showDeliveryDeadlineSheet={showDeliveryDeadlineSheet}
      setShowDeliveryDeadlineSheet={setShowDeliveryDeadlineSheet}
      deliveryDeadlineDate={deliveryDeadlineDate}
      deliveryDeadlineTime={deliveryDeadlineTime}
      onDeliveryDeadlineConfirm={(date, time) => {
        setDeliveryDeadlineDate(date)
        setDeliveryDeadlineTime(time)
        syncDeliveryDeadline(date, time)
      }}
      form={form}
      patchForm={patchForm}
      setErr={setErr}
      tagSelected={tagSelected}
      setTagSelected={setTagSelected}
      reqLevelSelected={reqLevelSelected}
      setReqLevelSelected={setReqLevelSelected}
      cityKeyword={cityKeyword}
      setCityKeyword={setCityKeyword}
      cityProvinceRows={cityProvinceRows}
      cityCheckGrid={cityCheckGrid}
      refreshCityUi={refreshCityUi}
      editingTierIndex={editingTierIndex}
      setEditingTierIndex={setEditingTierIndex}
      tierLevelSelected={tierLevelSelected}
      setTierLevelSelected={setTierLevelSelected}
      applyEditorFields={applyEditorFields}
      setApplyEditorFields={setApplyEditorFields}
      applyEditorName={applyEditorName}
      setApplyEditorName={setApplyEditorName}
      applyEditorTplId={applyEditorTplId}
      setApplyEditorTplId={setApplyEditorTplId}
      applyEditorMode={applyEditorMode}
      setApplyEditorMode={setApplyEditorMode}
      recruitTarget={recruitTarget}
    />
    </>
  )
}
