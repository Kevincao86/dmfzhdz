import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { appendMpRecruitmentOrder, clearMpRegistryCache, fetchMpRegistry, updateMpRecruitmentOrder } from '../../lib/mpApi'
import { addPublishedOrder } from '../../lib/mpSync/applicationsStore'
import {
  saveApplyFormForMpOrder,
  setActiveTemplateId,
  resolveFieldLabel,
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
  buildRegionText,
  type PublishForm,
} from '../../lib/mpSync/publishOrder'
import { clampNonNegativeInput } from '../../lib/mpSync/publishNumeric'
import { uploadContentImage, uploadContentVideo } from '../../lib/mpContentUpload'
import {
  DELIVERY_WINDOWS,
  newFansTier,
  newLevelTier,
  PLATFORMS,
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
import { platformIconUrl } from '../../lib/mpRecruitment/hallFilters'
import {
  clearPublishDraft,
  getLatestPublishDraftForMode,
  getPublishDraftById,
  savePublishDraft,
  type PublishWizardDraft,
} from '../../lib/mpSync/publishDraft'
import { readPrProfile } from '../../lib/mpSync/userProfile'
import { canUseTargetedRecruit } from '../../lib/mpSync/mpTargetedRecruitAccess'
import {
  getActivePublishFormTemplate,
  listPublishFormTemplates,
  savePublishFormTemplate,
  setActivePublishFormTemplateId,
  type PublishFormTemplate,
} from '../../lib/mpSync/publishFormTemplates'
import { INVITE_HOUR_OPTIONS, RECRUIT_CHANNELS } from '../../lib/mpSync/mpTargetedRecruit'
import { readImageFileAsDataUrl, patchGroupQrImage } from '../../lib/mpSync/mpGroupQr'
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

const PUBLISH_FIELD_CATALOG = [
  { key: 'title', label: '招募标题' },
  { key: 'delivery', label: '投放窗口' },
  { key: 'deadline', label: '报名截止时间' },
  { key: 'city', label: '招募城市' },
  { key: 'location', label: '商家位置' },
  { key: 'tags', label: '需求标签' },
  { key: 'fans', label: '粉丝要求' },
  { key: 'level', label: '带货等级' },
  { key: 'fee', label: '费用模式' },
  { key: 'count', label: '招募人数' },
  { key: 'detail', label: '招募详情' },
  { key: 'apply', label: '报名必填信息' },
  { key: 'cover', label: '封面' },
]

const PUBLISH_FIELD_KEYS = PUBLISH_FIELD_CATALOG.map((item) => item.key)

const DEFAULT_PUBLISH_FIELD_ON: Record<string, boolean> = {
  title: false,
  delivery: false,
  deadline: false,
  platform: false,
  city: false,
  location: false,
  tags: false,
  fans: false,
  level: false,
  fee: false,
  count: false,
  detail: false,
  apply: false,
  cover: false,
}

function allPublishFieldsOn(): Record<string, boolean> {
  return {
    title: true,
    delivery: true,
    deadline: true,
    platform: true,
    city: true,
    location: true,
    tags: true,
    fans: true,
    level: true,
    fee: true,
    count: true,
    detail: true,
    apply: true,
    cover: true,
  }
}

function mergePublishFieldOrder(saved: string[] | undefined, customIds: string[]) {
  const known = new Set<string>([...PUBLISH_FIELD_KEYS, ...customIds.filter(Boolean)])
  const next: string[] = []
  for (const key of saved || []) {
    const id = String(key || '').trim()
    if (id && known.has(id) && !next.includes(id)) next.push(id)
  }
  if (!next.length) {
    next.push(...PUBLISH_FIELD_KEYS)
  } else {
    for (const key of PUBLISH_FIELD_KEYS) if (!next.includes(key)) next.push(key)
  }
  for (const id of customIds) if (id && !next.includes(id)) next.push(id)
  return next
}

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

function chipChoice(on: boolean) {
  return `px-3 py-1.5 rounded-full text-sm border ${on ? 'border-violet-500 bg-violet-600/15' : 'border-[var(--shell-border)]'}`
}

function PubSelectRow({
  label,
  hint,
  value,
  placeholder,
  iconUrl,
  onClick,
}: {
  label: string
  hint?: string
  value: string
  placeholder?: boolean
  iconUrl?: string
  onClick: () => void
}) {
  return (
    <div className="pub-field">
      <PubLabel hint={hint}>{label}</PubLabel>
      <button
        type="button"
        onClick={onClick}
        className="w-full flex justify-between items-center gap-2 rounded-lg panel-input border px-3 py-2.5 text-left text-sm"
      >
        <span className="flex items-center gap-2 min-w-0 flex-1">
          {iconUrl ? (
            <img src={iconUrl} alt="" className="w-5 h-5 rounded shrink-0 object-contain" />
          ) : null}
          <span className={`truncate ${placeholder ? 'text-slate-500' : ''}`}>{value}</span>
        </span>
        <span className="text-slate-500 shrink-0">›</span>
      </button>
    </div>
  )
}

type FieldDragSlot = { key: string; top: number; height: number; el: HTMLDivElement }
type FieldDragState = {
  key: string
  pointerId: number
  startX: number
  startY: number
  armed: boolean
  timer: number
  from: number
  target: number
  grabY: number
  slots: FieldDragSlot[]
}

export default function PublishWizard() {
  const nav = useNavigate()
  const [search] = useSearchParams()
  const pr = readPrProfile()

  const [step, setStep] = useState<'platform' | 'channel' | 'recruit' | 'target' | 'mode' | 'tpl' | 'tplCustom' | 'placeholder' | 'form' | 'done'>('platform')
  const [publishTemplateMode, setPublishTemplateMode] = useState<'system' | 'custom'>('custom')
  const [fieldOn, setFieldOn] = useState<Record<string, boolean>>({ ...DEFAULT_PUBLISH_FIELD_ON })
  const [customPublishFields, setCustomPublishFields] = useState<
    { id: string; label: string; value: string; format: 'text' | 'image' | 'video' }[]
  >([])
  const [fieldOrder, setFieldOrder] = useState<string[]>([...PUBLISH_FIELD_KEYS])
  const fieldRowEls = useRef<Record<string, HTMLDivElement | null>>({})
  const fieldDragRef = useRef<FieldDragState | null>(null)
  const fieldDropFlipRef = useRef<Map<string, number> | null>(null)
  const orderedKeysRef = useRef<string[]>([])
  const [customFieldFormat, setCustomFieldFormat] = useState<'text' | 'image' | 'video'>('text')
  const [customFieldDraft, setCustomFieldDraft] = useState('')
  const [recruitChannel, setRecruitChannel] = useState('')
  const [loopChosen, setLoopChosen] = useState(false)
  const [isTargetedRecruit, setIsTargetedRecruit] = useState(false)
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
  const [cityProvinceRows, setCityProvinceRows] = useState<{ name: string; active: boolean; whole?: boolean }[]>([])
  const [fieldEditorOpen, setFieldEditorOpen] = useState(false)
  const [fieldChooserOpen, setFieldChooserOpen] = useState(false)
  const [savedFormTemplates, setSavedFormTemplates] = useState<PublishFormTemplate[]>([])
  const [applyInfoOpen, setApplyInfoOpen] = useState(false)
  const [fieldPick, setFieldPick] = useState<Record<string, boolean>>({ ...DEFAULT_PUBLISH_FIELD_ON })
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
  const orderedKeys = useMemo(
    () => mergePublishFieldOrder(fieldOrder, customPublishFields.map((row) => row.id)),
    [fieldOrder, customPublishFields],
  )
  orderedKeysRef.current = orderedKeys
  useLayoutEffect(() => {
    const before = fieldDropFlipRef.current
    if (!before) return
    fieldDropFlipRef.current = null
    const nodes: HTMLDivElement[] = []
    before.forEach((top, key) => {
      const el = fieldRowEls.current[key]
      if (!el) return
      const dy = top - el.getBoundingClientRect().top
      if (Math.abs(dy) < 1) return
      el.style.transition = 'none'
      el.style.transform = `translateY(${dy}px)`
      nodes.push(el)
    })
    if (!nodes.length) return
    requestAnimationFrame(() => {
      nodes.forEach((el) => {
        el.style.transition = 'transform 220ms cubic-bezier(.2,.7,.2,1)'
        el.style.transform = ''
      })
      window.setTimeout(() => {
        nodes.forEach((el) => {
          if (el.style.transform) return
          el.style.transition = ''
        })
      }, 260)
    })
  }, [fieldOrder])
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
      const st = initModalState(cityKeyword, hint ?? cityActiveProvince, form.selectedCities, form.selectedProvinces || [])
      setCityActiveProvince(st.activeProvince)
      setCityProvinceRows(st.provinceRows)
      setCityCheckGrid(st.cityCheckGrid)
    },
    [cityKeyword, cityActiveProvince, form.selectedCities, form.selectedProvinces],
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
    const reg = await fetchMpRegistry({ includeMpOrderIds: [mpId] })
    const mp = ((reg.mpRecruitmentOrders as Record<string, unknown>[]) || []).find((o) => o?.id === mpId)
    if (!mp) throw new Error('订单不存在')
    const restored = formPatchFromMpOrder(mp)
    const meta = (mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}) as Record<
      string,
      unknown
    >
    const isTargeted = String(meta.recruitScope || '') === 'targeted'
    let recruitTargetId = String(meta.recruitTarget || '').trim() || 'talent'
    setStep('form')
    if (meta.publishFieldOn && typeof meta.publishFieldOn === 'object') {
      setPublishTemplateMode('custom')
      const saved = meta.publishFieldOn as Record<string, boolean>
      const next = { ...DEFAULT_PUBLISH_FIELD_ON, ...saved }
      if (saved.title == null) next.title = true
      setFieldOn(next)
    } else {
      setPublishTemplateMode(meta.publishTemplateMode === 'custom' ? 'custom' : 'system')
      setFieldOn(allPublishFieldsOn())
    }
    const restoredCustom = Array.isArray(meta.customPublishFields)
      ? (meta.customPublishFields as { id?: string; label?: string; value?: string; format?: string }[])
          .filter((row) => String(row?.label || '').trim())
          .map((row, i) => ({
            id: String(row.id || `c-${i}`),
            label: String(row.label || '').trim(),
            value: String(row.value || ''),
            format: (row.format === 'image' || row.format === 'video' ? row.format : 'text') as 'text' | 'image' | 'video',
          }))
      : []
    if (Array.isArray(meta.customPublishFields)) setCustomPublishFields(restoredCustom)
    setFieldOrder(
      mergePublishFieldOrder(
        Array.isArray(meta.fieldOrder) ? (meta.fieldOrder as unknown[]).map((key) => String(key || '')) : undefined,
        restoredCustom.map((row) => row.id),
      ),
    )
    setRecruitChannel(isTargeted ? 'targeted' : 'open')
    setIsTargetedRecruit(isTargeted)
    setRecruitTarget(recruitTargetId)
    setRecruitTargetLabel(
      recruitTargetId === 'shoot' ? '拍摄' : recruitTargetId === 'edit' ? '剪辑' : '达人',
    )
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
    const vErr = validatePublishForm(form, recruitMode, recruitTarget || 'talent', isTargetedRecruit, {
      mode: publishTemplateMode,
      fieldOn,
    })
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
        isTargetedRecruit,
        publishTemplateMode,
        publishFieldOn: fieldOn,
        customPublishFields,
        fieldOrder: orderedKeys,
      })
      if (isEditMode && editMpId) {
        await updateMpRecruitmentOrder(order)
      } else {
        await appendMpRecruitmentOrder(order)
        clearMpRegistryCache()
        if (order.fulfillmentLoop === 'open' && String(form.groupQrImage || '').trim()) {
          await patchGroupQrImage(String(order.id), form.groupQrImage || '')
        }
        if (isTargetedRecruit) {
          saveApplyFormForMpOrder(String(order.id), {
            templateId: form.applyFormTemplateId,
            templateName: form.applyFormTemplateName,
            fields: form.applyFormFields,
          })
          if (form.applyFormTemplateId) {
            setActiveTemplateId(form.applyFormTemplateId, templateKindFromRecruitTarget(recruitTarget))
          }
          nav(`/orders/${encodeURIComponent(String(order.id))}/targeted/pick?hours=${Number(form.inviteResponseHours) || 72}`)
          return
        }
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

  const fieldKeys = ['title', 'delivery', 'deadline', 'platform', 'city', 'location', 'tags', 'fans', 'level', 'fee', 'count', 'detail', 'apply', 'cover']
  const layoutIsCustom = (fieldMap: Record<string, boolean>, custom: { label: string }[]) =>
    custom.length > 0 || fieldKeys.some((key) => fieldMap[key] === false)

  const applyTemplateToState = (tpl: PublishFormTemplate, platform: string, keepContent: boolean) => {
    const target = tpl.recruitTarget || 'talent'
    const modes = modesForTarget(target)
    const mode = modes.find((m) => m.id === tpl.recruitMode) || modes[0]
    const targeted = !!(tpl.isTargeted && target === 'talent' && canUseTargetedRecruit())
    setRecruitTarget(target)
    setRecruitTargetLabel(target === 'shoot' ? '拍摄' : target === 'edit' ? '剪辑' : '达人')
    setRecruitMode(mode.id)
    setRecruitModeLabel(mode.label)
    setIsTargetedRecruit(targeted)
    setRecruitChannel(targeted ? 'targeted' : 'open')
    setLoopChosen(true)
    const loop = mode.id === 'edit_ice' ? 'closed' : tpl.fulfillmentLoop
    setFieldOn((prev) => ({ ...prev, ...tpl.fieldOn }))
    setCustomPublishFields(tpl.customFields.map((row) => ({ ...row, value: '' })))
    setFieldOrder(mergePublishFieldOrder(tpl.fieldOrder, tpl.customFields.map((row) => row.id)))
    setPublishTemplateMode(layoutIsCustom(tpl.fieldOn, tpl.customFields) ? 'custom' : 'system')
    setForm((prev) => {
      const base = emptyPublishForm(target)
      const kept = keepContent
        ? {
            title: prev.title,
            cityNational: prev.cityNational,
            selectedCities: prev.selectedCities,
            selectedProvinces: prev.selectedProvinces || [],
            talentTags: prev.talentTags,
            recruitDetail: prev.recruitDetail,
            feeTypeId: prev.feeTypeId,
            fixedPrice: prev.fixedPrice,
            recruitCount: prev.recruitCount,
            signupDeadline: prev.signupDeadline,
            deliveryWindow: prev.deliveryWindow,
            coverImage: prev.coverImage,
            coverLibraryId: prev.coverLibraryId,
            groupQrImage: prev.groupQrImage,
          }
        : {}
      return {
        ...base,
        ...kept,
        platform: target === 'talent' ? platform : '通用',
        fulfillmentLoop: loop,
        applyFormFields: mode.id === 'live' ? defaultLiveApplyFields() : base.applyFormFields,
        applyFormTemplateName: mode.id === 'live' ? '直播达人报名默认项' : base.applyFormTemplateName,
      }
    })
  }

  const enterFromPlatform = (platform: string) => {
    const active = getActivePublishFormTemplate()
    if (active) applyTemplateToState(active, platform, false)
    else {
      setRecruitTarget('talent')
      setRecruitTargetLabel('达人')
      setRecruitMode('visit')
      setRecruitModeLabel('探店')
      setIsTargetedRecruit(false)
      setRecruitChannel('open')
      setLoopChosen(true)
      setPublishTemplateMode('custom')
      setFieldOn({ ...DEFAULT_PUBLISH_FIELD_ON })
      setFieldOrder([...PUBLISH_FIELD_KEYS])
      setCustomPublishFields([])
      setForm({ ...emptyPublishForm('talent'), platform, fulfillmentLoop: 'closed' })
      setTagSelected(new Set())
    }
    setFieldOn({ ...DEFAULT_PUBLISH_FIELD_ON })
    setCustomPublishFields([])
    setFieldPick({ ...DEFAULT_PUBLISH_FIELD_ON })
    setFieldEditorOpen(false)
    setStep('form')
  }

  const onPickPlatform = (platform: string) => {
    if (recruitMode) {
      setForm((prev) => ({
        ...prev,
        platform: recruitTarget === 'shoot' || recruitTarget === 'edit' ? prev.platform : platform,
      }))
      setStep('form')
      return
    }
    enterFromPlatform(platform)
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
              setStep('platform')
              setRecruitMode('')
              setRecruitModeLabel('')
              setRecruitChannel('')
              setLoopChosen(false)
              setIsTargetedRecruit(false)
              setRecruitTarget('')
              setRecruitTargetLabel('')
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

  if (step === 'platform') {
    return (
      <div className="page-content-shell page-content-shell--narrow space-y-5">
        <PageHero title="发布招募" badge="选平台" />
        <div className="grid gap-3">
          {PLATFORMS.map((name) => (
            <button
              key={name}
              type="button"
              className="choice-card w-full text-left surface-card rounded-xl border px-5 py-4 hover-panel flex items-center gap-4"
              onClick={() => onPickPlatform(name)}
            >
              <img
                src={platformIconUrl(name)}
                alt=""
                className="w-11 h-11 rounded-xl object-contain shrink-0 bg-white"
              />
              <div className="font-semibold text-lg text-[var(--shell-text)]">{name}</div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (step === 'channel') {
    return (
      <div className="page-content-shell page-content-shell--narrow space-y-5">
        <PageHero
          title="发布招募"
          subtitle="选定后，再选择普通招募或定向邀约"
          badge="步骤 1/5"
        />
        <p className="text-sm text-[var(--shell-muted)] px-1">选择履约方式</p>
        <div className="grid gap-3">
          {(
            [
              {
                id: 'closed' as const,
                label: '闭环',
                sub: '达人在平台报名。你先定可探店日期和时段，达人只能从这些时间里选。排期确定后直接上传成片，你在平台审核。',
              },
              {
                id: 'open' as const,
                label: '开环',
                sub: '按通告发到微信群。你确认达人后发送群二维码，达人进群交付。交片和结算都在群里跟进，平台不排探店、不审视频。发布时需要上传群二维码。',
              },
            ]
          ).map((loop) => {
            const on = loopChosen && (form.fulfillmentLoop || 'closed') === loop.id
            return (
              <button
                key={loop.id}
                type="button"
                className={`choice-card w-full text-left surface-card rounded-xl border p-5 hover-panel ${
                  on ? 'border-violet-500 ring-2 ring-violet-500/40' : ''
                }`}
                onClick={() => {
                  setLoopChosen(true)
                  setForm((prev) => ({ ...prev, fulfillmentLoop: loop.id }))
                  setStep('recruit')
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="font-semibold text-lg text-[var(--shell-text)]">{loop.label}</div>
                  {on ? <span className="text-xs text-violet-600 shrink-0">已选</span> : null}
                </div>
                <div className="text-sm text-[var(--shell-muted)] mt-1.5 leading-relaxed">{loop.sub}</div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (step === 'recruit') {
    const loopLabel = form.fulfillmentLoop === 'open' ? '开环' : '闭环'
    return (
      <div className="page-content-shell page-content-shell--narrow space-y-5">
        <button type="button" className="text-slate-400 text-sm" onClick={() => setStep('channel')}>
          ‹ 返回
        </button>
        <PageHero
          title="发布招募"
          subtitle={`已选${loopLabel}。请选择普通招募或定向邀约`}
          badge="步骤 1/5"
        />
        <p className="text-sm text-[var(--shell-muted)] px-1">选择招募方式</p>
        <div className="grid gap-3 sm:grid-cols-1">
          {RECRUIT_CHANNELS.map((c) => (
            <button
              key={c.id}
              type="button"
              className="choice-card w-full text-left surface-card rounded-xl border p-5 hover-panel"
              onClick={() => {
                if (c.id === 'targeted' && !canUseTargetedRecruit()) {
                  window.alert('当前会员档位不含定向邀约，请升级会员或联系运营开通。')
                  return
                }
                setRecruitChannel(c.id)
                setIsTargetedRecruit(c.id === 'targeted')
                setRecruitTarget('')
                setRecruitTargetLabel('')
                setRecruitMode('')
                setRecruitModeLabel('')
                setStep('target')
              }}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden>
                  {c.iconGlyph}
                </span>
                <div>
                  <div className="font-semibold text-lg text-[var(--shell-text)]">{c.label}</div>
                  <div className="text-sm text-[var(--shell-muted)] mt-1.5 leading-relaxed">{c.sub}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (step === 'target') {
    return (
      <div className="page-content-shell page-content-shell--narrow space-y-5">
        <button type="button" className="text-slate-400 text-sm" onClick={() => setStep('recruit')}>
          ‹ 返回
        </button>
        <PageHero
          title="发布招募"
          subtitle={isTargetedRecruit ? '定向邀约 · 仅支持达人招募' : '选择招募对象，再进入探店 / 品宣 / 直播等模式填写表单。'}
          badge="步骤 2/5"
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
                const isSupplier = t.id === 'shoot' || t.id === 'edit'
                if (isSupplier && isTargetedRecruit) {
                  window.alert('定向邀约仅支持达人。拍摄/剪辑招募请使用普通招募。')
                  return
                }
                if (isSupplier) {
                  setRecruitChannel('open')
                  setIsTargetedRecruit(false)
                }
                setRecruitTarget(t.id)
                setRecruitTargetLabel(t.label)
                setForm((prev) => ({
                  ...emptyPublishForm(t.id),
                  fulfillmentLoop: prev.fulfillmentLoop,
                  groupQrImage: prev.groupQrImage,
                }))
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
                if (m.id === 'edit_ice') {
                  setForm((prev) => ({ ...prev, fulfillmentLoop: 'closed' }))
                }
                setPublishTemplateMode('system')
                setStep('tpl')
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


  const showField = (key: string) => fieldOn[key] === true
  const fieldRank = (key: string) => {
    const index = orderedKeys.indexOf(key)
    return index < 0 ? 200 : index
  }
  const editorRows: { key: string; kind: 'sys' | 'custom'; label: string }[] = []
  for (const key of orderedKeys) {
    const sys = PUBLISH_FIELD_CATALOG.find((item) => item.key === key)
    if (sys) {
      editorRows.push({ key, kind: 'sys', label: sys.label })
      continue
    }
    const row = customPublishFields.find((item) => item.id === key)
    if (!row) continue
    const formatLabel = row.format === 'image' ? '图片' : row.format === 'video' ? '视频' : '文字'
    editorRows.push({ key, kind: 'custom', label: `${row.label} · ${formatLabel}` })
  }
  function addCustomPublishField(label: string, format: 'text' | 'image' | 'video') {
    const name = label.trim()
    if (!name) {
      setErr('请填写字段名称')
      return
    }
    const id = `c-${Date.now()}`
    setCustomPublishFields((list) => list.concat([{ id, label: name, value: '', format }]))
    setFieldOrder((order) => mergePublishFieldOrder(order, customPublishFields.map((row) => row.id).concat(id)))
    setCustomFieldDraft('')
    setPublishTemplateMode('custom')
    setErr('')
  }
  function removeCustomPublishField(id: string) {
    const list = customPublishFields.filter((row) => row.id !== id)
    setCustomPublishFields(list)
    setFieldOrder((order) => order.filter((key) => key !== id))
    setPublishTemplateMode(layoutIsCustom(fieldOn, list) ? 'custom' : 'system')
  }
  function clearFieldDragMotion() {
    for (const el of Object.values(fieldRowEls.current)) {
      if (!el) continue
      el.style.transform = ''
      el.style.zIndex = ''
      el.style.boxShadow = ''
      el.style.background = ''
      el.style.transition = ''
      el.style.borderRadius = ''
    }
  }
  function moveFieldToIndex(key: string, target: number) {
    setFieldOrder(() => {
      const list = orderedKeysRef.current.slice()
      const from = list.indexOf(key)
      if (from < 0 || target < 0 || target >= list.length || from === target) return list
      const [item] = list.splice(from, 1)
      list.splice(target, 0, item)
      return list
    })
  }
  function paintFieldDrag(clientY: number) {
    const drag = fieldDragRef.current
    if (!drag?.armed || !drag.slots.length) return
    const from = drag.from
    let target = 0
    for (let i = 0; i < drag.slots.length; i += 1) {
      const mid = drag.slots[i].top + drag.slots[i].height / 2
      if (clientY >= mid) target = i
    }
    drag.target = target
    const dragged = drag.slots[from]
    if (!dragged) return
    const dy = clientY - drag.grabY - dragged.top
    dragged.el.style.zIndex = '3'
    dragged.el.style.borderRadius = '12px'
    dragged.el.style.background = 'var(--panel-card)'
    dragged.el.style.boxShadow = '0 14px 32px rgba(20, 16, 40, 0.18)'
    dragged.el.style.transition = 'box-shadow 160ms ease, background 160ms ease'
    dragged.el.style.transform = `translateY(${dy}px) scale(1.03)`
    drag.slots.forEach((slot, index) => {
      if (index === from) return
      let shift = 0
      if (target > from && index > from && index <= target) shift = -dragged.height
      if (target < from && index < from && index >= target) shift = dragged.height
      slot.el.style.zIndex = ''
      slot.el.style.transition = 'transform 200ms cubic-bezier(.2,.7,.2,1)'
      slot.el.style.transform = shift ? `translateY(${shift}px)` : 'translateY(0px)'
    })
  }
  function finishFieldDrag(ev: PointerEvent) {
    const drag = fieldDragRef.current
    fieldDragRef.current = null
    if (!drag) return
    window.clearTimeout(drag.timer)
    if (!drag.armed) {
      clearFieldDragMotion()
      return
    }
    if (drag.target !== drag.from && drag.target >= 0) {
      const before = new Map<string, number>()
      drag.slots.forEach((slot) => before.set(slot.key, slot.el.getBoundingClientRect().top))
      clearFieldDragMotion()
      fieldDropFlipRef.current = before
      moveFieldToIndex(drag.key, drag.target)
      return
    }
    drag.slots.forEach((slot) => {
      slot.el.style.transition = 'transform 200ms cubic-bezier(.2,.7,.2,1), box-shadow 200ms ease, background 200ms ease'
      slot.el.style.transform = ''
      slot.el.style.boxShadow = ''
      slot.el.style.background = ''
      slot.el.style.zIndex = ''
    })
    window.setTimeout(() => {
      if (fieldDragRef.current) return
      drag.slots.forEach((slot) => {
        slot.el.style.transition = ''
        slot.el.style.borderRadius = ''
      })
    }, 220)
    void ev
  }
  function startFieldDrag(e: React.PointerEvent<HTMLElement>, key: string) {
    if (e.button !== 0) return
    e.preventDefault()
    const row = fieldRowEls.current[key]
    if (!row) return
    window.clearTimeout(fieldDragRef.current?.timer)
    const pointerId = e.pointerId
    const startX = e.clientX
    const startY = e.clientY
    const timer = window.setTimeout(() => {
      const drag = fieldDragRef.current
      if (!drag || drag.pointerId !== pointerId || drag.key !== key) return
      row.style.transition = 'none'
      row.style.transform = ''
      row.style.background = ''
      const keys = orderedKeysRef.current
      const slots = keys
        .map((itemKey) => {
          const el = fieldRowEls.current[itemKey]
          if (!el) return null
          const rect = el.getBoundingClientRect()
          return { key: itemKey, top: rect.top, height: rect.height, el }
        })
        .filter((slot): slot is FieldDragSlot => Boolean(slot))
      const from = slots.findIndex((slot) => slot.key === key)
      if (from < 0) return
      drag.armed = true
      drag.slots = slots
      drag.from = from
      drag.target = from
      drag.grabY = startY - slots[from].top
      if (navigator.vibrate) navigator.vibrate(12)
      paintFieldDrag(startY)
    }, 320)
    fieldDragRef.current = {
      key,
      pointerId,
      startX,
      startY,
      armed: false,
      timer,
      from: -1,
      target: -1,
      grabY: 0,
      slots: [],
    }
    row.style.transition = 'transform 140ms ease, background 140ms ease'
    row.style.transform = 'scale(0.98)'
    row.style.background = 'rgba(91, 45, 204, 0.07)'
    const onMove = (ev: PointerEvent) => {
      const drag = fieldDragRef.current
      if (!drag || drag.pointerId !== pointerId) return
      if (!drag.armed) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 8) {
          window.clearTimeout(drag.timer)
          fieldDragRef.current = null
          clearFieldDragMotion()
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          window.removeEventListener('pointercancel', onUp)
        }
        return
      }
      ev.preventDefault()
      paintFieldDrag(ev.clientY)
    }
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (fieldDragRef.current?.pointerId === pointerId) finishFieldDrag(ev)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }
  function renderFieldEditor(useDraft = false) {
    const selected = useDraft ? fieldPick : fieldOn
    const rows = useDraft ? editorRows.filter((row) => row.key !== 'apply') : editorRows
    return rows.map((row) => (
      <div
        key={row.key}
        data-field-key={row.key}
        ref={(el) => {
          fieldRowEls.current[row.key] = el
        }}
        className="relative flex items-center gap-2 px-3 py-2.5 text-sm"
      >
        <span
          className="cursor-grab touch-none select-none px-1 text-base leading-none text-[#8B909A]"
          title="长按后拖动排序"
          onPointerDown={(e) => startFieldDrag(e, row.key)}
          onDragStart={(e) => e.preventDefault()}
        >
          ≡
        </span>
        <span className="min-w-0 flex-1">{row.label}</span>
        {row.kind === 'sys' ? (
          <input
            type="checkbox"
            checked={selected[row.key] === true}
            onChange={(e) => {
              const next = { ...selected, [row.key]: e.target.checked }
              if (useDraft) {
                setFieldPick(next)
                return
              }
              setFieldOn(next)
              setPublishTemplateMode(layoutIsCustom(next, customPublishFields) ? 'custom' : 'system')
            }}
          />
        ) : (
          <button type="button" className="text-xs text-slate-400" onClick={() => removeCustomPublishField(row.key)}>
            删除
          </button>
        )}
      </div>
    ))
  }
  function saveFieldPick() {
    setFieldOn({
      ...DEFAULT_PUBLISH_FIELD_ON,
      ...fieldPick,
    })
    setPublishTemplateMode('custom')
    setFieldEditorOpen(false)
    setFieldChooserOpen(false)
    setDraftHint('已保存字段')
    setErr('')
  }

  function applyRecruitFields(tpl: PublishFormTemplate) {
    const next = { ...DEFAULT_PUBLISH_FIELD_ON, ...tpl.fieldOn }
    const custom = tpl.customFields.map((row) => ({ ...row, value: '' }))
    setFieldOn(next)
    setFieldPick(next)
    setCustomPublishFields(custom)
    setFieldOrder(mergePublishFieldOrder(tpl.fieldOrder, custom.map((row) => row.id)))
    setPublishTemplateMode('custom')
    setActivePublishFormTemplateId(tpl.id)
    setFieldEditorOpen(false)
    setFieldChooserOpen(false)
    setDraftHint(`已使用模版「${tpl.name}」`)
    setErr('')
  }

  function saveCurrentAsTemplate() {
    const name = window.prompt('模版名称', '我的发单模版')
    if (name == null) return
    const trimmed = name.trim() || '我的发单模版'
    const next = { ...DEFAULT_PUBLISH_FIELD_ON, ...fieldPick }
    const row = savePublishFormTemplate({
      name: trimmed,
      recruitTarget,
      recruitMode,
      fulfillmentLoop: form.fulfillmentLoop === 'open' ? 'open' : 'closed',
      isTargeted: isTargetedRecruit,
      fieldOn: next,
      fieldOrder: orderedKeys,
      customFields: customPublishFields.map((item) => ({
        id: item.id,
        label: item.label,
        format: item.format || 'text',
      })),
    })
    setActivePublishFormTemplateId(row.id)
    setSavedFormTemplates(listPublishFormTemplates())
    setDraftHint('已存入我的模版')
    setErr('')
  }

  if (step === 'tpl' || step === 'tplCustom') {
    return (
      <div className="page-content-shell page-content-shell--narrow space-y-4">
        <button
          type="button"
          className="text-slate-400 text-sm"
          onClick={() => setStep(step === 'tplCustom' ? 'tpl' : 'mode')}
        >
          ‹ 返回
        </button>
        <h2 className="text-xl font-bold">选择招募模版</h2>
        <p className="text-sm text-slate-400">系统模版沿用现有表单，自定义可勾选字段并新增</p>
        {step === 'tpl' ? (
          <div className="space-y-3">
            <button type="button" className="choice-card w-full text-left surface-card rounded-xl border p-4" onClick={() => { setPublishTemplateMode('system'); setFieldOn(allPublishFieldsOn()); setStep('form') }}>
              <div className="font-semibold">系统模版</div>
              <div className="text-sm text-slate-400 mt-1">使用现在的完整招募表单</div>
            </button>
            <button type="button" className="choice-card w-full text-left surface-card rounded-xl border p-4" onClick={() => { setPublishTemplateMode('custom'); setStep('tplCustom') }}>
              <div className="font-semibold">自定义模版</div>
              <div className="text-sm text-slate-400 mt-1">勾选系统字段，或自己新增字段</div>
            </button>
          </div>
        ) : (
          <div className="surface-card rounded-xl border divide-y">
            <p className="px-4 py-2 text-xs text-slate-400">长按左侧 ≡ 再拖动排序，表单会跟着排</p>
            {renderFieldEditor()}
            <div className="flex items-center gap-2 px-4 py-2.5">
              <select
                className="rounded-lg panel-input border px-2 py-1.5 text-sm"
                value={customFieldFormat}
                onChange={(e) => setCustomFieldFormat(e.target.value as 'text' | 'image' | 'video')}
              >
                <option value="text">文字</option>
                <option value="image">图片</option>
                <option value="video">视频</option>
              </select>
              <input
                className="flex-1 rounded-lg panel-input border px-3 py-1.5 text-sm"
                placeholder="新增字段，如到店时间"
                value={customFieldDraft}
                onChange={(e) => setCustomFieldDraft(e.target.value)}
              />
              <button
                type="button"
                className="shrink-0 text-sm font-medium text-violet-600"
                onClick={() => addCustomPublishField(customFieldDraft, customFieldFormat)}
              >
                新增自定义字段
              </button>
            </div>
            <div className="px-4 py-3">
              <button
                type="button"
                className="w-full rounded-lg bg-violet-700 text-white text-sm py-2"
                onClick={() => {
                  const picked = Object.keys(fieldOn).filter((k) => fieldOn[k] !== false)
                  if (!picked.length && !customPublishFields.length) {
                    setErr('请至少保留一个字段')
                    return
                  }
                  setErr('')
                  setStep('form')
                }}
              >
                开始填写
              </button>
            </div>
          </div>
        )}
        {err ? <p className="text-red-500 text-sm">{err}</p> : null}
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
          onClick={() => (isEditMode ? nav('/orders') : setStep('platform'))}
        >
          ‹ 返回
        </button>
        <div>
          <h2 className="text-xl font-bold text-[var(--shell-text)]">
            {isEditMode ? '编辑招募' : isTargetedRecruit ? '填写定向邀约' : '填写招募信息'}
          </h2>
          <p className="text-sm text-[var(--shell-muted)] mt-0.5">
            {(isTargetedRecruit
              ? [form.platform, '定向邀约']
              : [!isSupplierPublish ? form.platform : '', recruitTargetLabel, recruitModeLabel]
            ).filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      <TwoColumnLayout
        aside={<TipsCard title="填写小贴士" items={PUBLISH_TIPS} />}
        main={
      <section className="pub-form-card space-y-4 text-sm">
        <div className="rounded-xl border border-[var(--shell-border)] p-4 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          <div>
            <div className="text-sm font-medium text-[var(--shell-text)]">招募对象</div>
            <p className="text-xs text-[var(--shell-muted)] mt-0.5 mb-2">
              {recruitTarget === 'shoot'
                ? '找拍摄团队到店或拍产品。'
                : recruitTarget === 'edit'
                  ? '找剪辑团队做成片。'
                  : '找达人做探店、品宣或直播。'}
            </p>
          <div className="flex flex-wrap gap-2">
            {RECRUIT_TARGETS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={chipChoice(recruitTarget === t.id)}
                onClick={() => {
                  const isSupplier = t.id === 'shoot' || t.id === 'edit'
                  if (isSupplier && isTargetedRecruit) {
                    setIsTargetedRecruit(false)
                    setRecruitChannel('open')
                  }
                  const modes = modesForTarget(t.id)
                  const mode = modes[0]
                  setRecruitTarget(t.id)
                  setRecruitTargetLabel(t.label)
                  setRecruitMode(mode.id)
                  setRecruitModeLabel(mode.label)
                  setForm((prev) => {
                    const next = emptyPublishForm(t.id)
                    return {
                      ...next,
                      title: prev.title,
                      platform: isSupplier ? '通用' : prev.platform,
                      cityNational: prev.cityNational,
                      selectedCities: prev.selectedCities,
                      selectedProvinces: prev.selectedProvinces || [],
                      talentTags: prev.talentTags,
                      recruitDetail: prev.recruitDetail,
                      feeTypeId: prev.feeTypeId,
                      fixedPrice: prev.fixedPrice,
                      recruitCount: prev.recruitCount,
                      fulfillmentLoop: mode.id === 'edit_ice' ? 'closed' : prev.fulfillmentLoop || 'closed',
                      groupQrImage: prev.groupQrImage,
                      coverImage: prev.coverImage,
                      coverLibraryId: prev.coverLibraryId,
                      signupDeadline: prev.signupDeadline,
                      deliveryWindow: prev.deliveryWindow,
                      applyFormFields: mode.id === 'live' ? defaultLiveApplyFields() : next.applyFormFields,
                      applyFormTemplateName: mode.id === 'live' ? '直播达人报名默认项' : next.applyFormTemplateName,
                    }
                  })
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          </div>
          <div>
            <div className="text-sm font-medium text-[var(--shell-text)]">合作模式</div>
            <p className="text-xs text-[var(--shell-muted)] mt-0.5 mb-2">
              {filteredModes.find((m) => m.id === recruitMode)?.sub || '选择这次怎么合作。'}
            </p>
          <div className="flex flex-wrap gap-2">
            {filteredModes.map((m) => (
              <button
                key={m.id}
                type="button"
                className={chipChoice(recruitMode === m.id)}
                onClick={() => {
                  setRecruitMode(m.id)
                  setRecruitModeLabel(m.label)
                  if (m.id === 'live') {
                    setForm((prev) => ({
                      ...prev,
                      applyFormFields: defaultLiveApplyFields(),
                      applyFormTemplateName: '直播达人报名默认项',
                    }))
                  }
                  if (m.id === 'edit_ice') setForm((prev) => ({ ...prev, fulfillmentLoop: 'closed' }))
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
          </div>
          <div>
            <div className="text-sm font-medium text-[var(--shell-text)]">履约方式</div>
            <p className="text-xs text-[var(--shell-muted)] mt-0.5 mb-2">
              {(form.fulfillmentLoop || 'closed') === 'open'
                ? '发到微信群。确认达人后发群二维码，交片和结算在群里完成。发布时要上传群二维码。'
                : '达人在平台报名并选择档期，成片上传后由你在平台审核。'}
            </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['closed', '闭环'],
                ['open', '开环'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                disabled={recruitMode === 'edit_ice'}
                className={chipChoice((form.fulfillmentLoop || 'closed') === id)}
                onClick={() => setForm((prev) => ({ ...prev, fulfillmentLoop: id }))}
              >
                {label}
              </button>
            ))}
          </div>
          </div>
          {recruitTarget === 'talent' ? (
            <div>
              <div className="text-sm font-medium text-[var(--shell-text)]">招募方式</div>
              <p className="text-xs text-[var(--shell-muted)] mt-0.5 mb-2">
                {isTargetedRecruit
                  ? '只发给你指定的达人，对方接受后才进入履约。需会员开通。'
                  : '公开在招募大厅报名，符合条件的达人都可以报。'}
              </p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['open', '普通招募'],
                    ['targeted', '定向邀约'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={chipChoice(id === 'targeted' ? isTargetedRecruit : !isTargetedRecruit)}
                    onClick={() => {
                      if (id === 'targeted' && !canUseTargetedRecruit()) {
                        window.alert('当前会员档位不含定向邀约，请升级会员或联系运营开通。')
                        return
                      }
                      setRecruitChannel(id)
                      setIsTargetedRecruit(id === 'targeted')
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="rounded-xl border border-[var(--shell-border)] p-4 space-y-4">
          <div>
            <button
              type="button"
              className="flex w-full items-center justify-between text-sm font-semibold text-[var(--shell-text)]"
              onClick={() => setApplyInfoOpen((open) => !open)}
            >
              <span>{isSupplierPublish ? '团队报名必填信息' : '达人必填信息'}</span>
              <span className="text-[#4c1d95]">{applyInfoOpen ? '收起' : '展开'}</span>
            </button>
            {applyInfoOpen ? (
              <div className="mt-2">
                <p className="text-xs leading-5 text-[var(--shell-muted)]">达人报名时要填这些内容。</p>
                {(form.applyFormFields || []).length ? (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {(form.applyFormFields || []).map((field) => (
                      <li
                        key={field.id}
                        className="rounded-full bg-[#f5f3ff] px-2.5 py-1 text-xs font-medium leading-5 text-[#4c1d95]"
                      >
                        {resolveFieldLabel(field, form.platform)}
                        {field.required === false ? <span className="ml-1 font-normal text-[#8b7cb8]">选填</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-[var(--shell-muted)]">还没有报名必填项</p>
                )}
                <button
                  type="button"
                  className="mt-2 text-xs font-medium text-[#6d28d9]"
                  onClick={() => openPicker('applyMenu')}
                >
                  配置报名项
                </button>
              </div>
            ) : (
              <p className="mt-1 text-xs text-[var(--shell-muted)]">{display.applyFormDisplayText}</p>
            )}
          </div>
          <div>
            <div className="text-sm font-semibold text-[var(--shell-text)]">是否需要达人交票</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className={`px-3 py-1.5 rounded-full text-sm border ${form.requireTalentInvoice ? 'border-[var(--shell-border)] text-[var(--shell-muted)]' : 'border-[#6d28d9] bg-[#f5f3ff] text-[#4c1d95] font-semibold'}`}
                onClick={() => patchForm({ requireTalentInvoice: false })}
              >
                不需要
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 rounded-full text-sm border ${form.requireTalentInvoice ? 'border-[#6d28d9] bg-[#f5f3ff] text-[#4c1d95] font-semibold' : 'border-[var(--shell-border)] text-[var(--shell-muted)]'}`}
                onClick={() => patchForm({ requireTalentInvoice: true })}
              >
                需要达人交票
              </button>
            </div>
            <p className="mt-1 text-xs text-[var(--shell-muted)]">需要时，达人完成该招募单后可提交发票，你可在本单查看并下载。</p>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          {showField('title') ? (
          <div style={{ order: fieldRank('title') }}>
            <PubLabel>招募标题</PubLabel>
            <input
              className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
              placeholder={recruitMode === 'live' ? '如：火锅专场直播带货招募' : '如：春季火锅探店招募'}
              value={form.title}
              onChange={(e) => patchForm({ title: e.target.value })}
            />
          </div>
          ) : null}
          {showField('cover') ? (
            <div style={{ order: fieldRank('cover') }}>
              <RecruitCoverField
                platform={form.platform}
                talentTags={form.talentTags}
                coverImage={form.coverImage}
                coverLibraryId={form.coverLibraryId}
                recruitTitle={form.title}
                region={buildRegionText(form)}
                onChange={(patch) => patchForm(patch)}
              />
            </div>
          ) : null}
          {showField('city') ? (
            <div style={{ order: fieldRank('city') }}>
              <PubSelectRow
                label="招募城市"
                value={display.cityDisplayText}
                placeholder={display.cityDisplayText === '请选择招募城市'}
                onClick={() => openPicker('city')}
              />
            </div>
          ) : null}
          {!isTargetedRecruit && showField('delivery') ? (
            <div style={{ order: fieldRank('delivery') }}>
              <PubLabel>投放窗口</PubLabel>
              <div className="mt-1 grid grid-cols-2 gap-2">
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
          ) : null}

        {!isTargetedRecruit ? (
          <div className="space-y-2" style={{ order: fieldRank('deadline') }}>
            {display.showSignupDeadline && showField('deadline') ? (
              <PubSelectRow
                label="招募报名截止时间"
                value={deadlineDisplayText}
                placeholder={!signupDeadlineDate}
                onClick={() => setShowDeadlineSheet(true)}
              />
            ) : null}
            {!display.showSignupDeadline ? (
              <p className="text-xs text-amber-500/90">急单大厅：发布后 24 小时内截止报名（无需填写）</p>
            ) : null}
          </div>
        ) : null}

        {isTargetedRecruit ? (
          <div style={{ order: 800 }}>
            <PubLabel hint="达人须在此时间内接受或拒绝邀约；可随时补邀更多人">邀约响应时间</PubLabel>
            <div className="flex flex-wrap gap-2 mt-1">
              {INVITE_HOUR_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-sm border ${
                    form.inviteResponseHours === opt.id
                      ? 'border-violet-500 bg-violet-600/15 text-violet-300'
                      : 'border-[var(--shell-border)]'
                  }`}
                  onClick={() => patchForm({ inviteResponseHours: opt.id })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {recruitMode === 'live' ? (
          <div className="space-y-3 rounded-lg border border-[var(--shell-border)] p-3" style={{ order: 800 }}>
            <PubLabel>直播平台</PubLabel>
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
            <PubLabel>直播日期</PubLabel>
            <input
              type="date"
              className="w-full rounded-lg panel-input border px-3 py-2"
              value={form.liveDate}
              onChange={(e) => patchForm({ liveDate: e.target.value })}
            />
            <PubLabel>开播时间</PubLabel>
            <input
              type="time"
              className="w-full rounded-lg panel-input border px-3 py-2"
              value={form.liveTimeStart}
              onChange={(e) => patchForm({ liveTimeStart: e.target.value })}
            />
            <PubLabel>预计时长</PubLabel>
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
            <PubLabel>直播类型</PubLabel>
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
            <PubLabel>带货商品/套餐说明</PubLabel>
            <textarea
              className="w-full rounded-lg panel-input border px-3 py-2 min-h-[88px]"
              placeholder="商品名称、规格、团购价、佣金空间、是否独家等"
              value={form.productSummary}
              onChange={(e) => patchForm({ productSummary: e.target.value })}
            />
            <PubLabel>样品/寄样方式</PubLabel>
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

        {!isSupplierPublish && recruitMode !== 'live' && showField('platform') && !form.platform ? (
          <div style={{ order: 800 }}>
            <PubSelectRow
              label="招募平台"
              value={display.platformDisplayText}
              placeholder={!form.platform}
              iconUrl={form.platform ? platformIconUrl(form.platform) : undefined}
              onClick={() => openPicker('platform')}
            />
          </div>
        ) : null}
        {showField('location') ? (
        <div style={{ order: fieldRank('location') }}>
          <PubLabel>商家位置</PubLabel>
          <p className="text-xs text-[var(--shell-muted)] mb-2">选填；Web 端暂仅文字，小程序端可地图选点导航</p>
          <input
            className="w-full rounded-lg panel-input border px-3 py-2"
            placeholder="门店名 + 详细地址"
            value={form.merchantLocationAddress}
            onChange={(e) =>
              patchForm({
                merchantLocationAddress: e.target.value,
                merchantLocationName: '',
                merchantLocationLat: '',
                merchantLocationLng: '',
              })
            }
          />
        </div>
        ) : null}
        {showField('tags') ? (
        <div style={{ order: fieldRank('tags') }}>
        <PubSelectRow
          label={isSupplierPublish ? '需求品类标签' : '需求达人标签'}
          hint="最多 2 个，不可重复"
          value={display.tagsDisplayText}
          placeholder={!form.talentTags.length}
          onClick={() => openPicker('tag')}
        />
        </div>
        ) : null}

        {isSupplierPublish && recruitTarget === 'shoot' ? (
          <div className="space-y-3 rounded-lg border border-[var(--shell-border)] p-3" style={{ order: 800 }}>
            <PubLabel>拍摄日期</PubLabel>
            <input type="date" className="w-full rounded-lg panel-input border px-3 py-2" value={form.shootDate} onChange={(e) => patchForm({ shootDate: e.target.value })} />
            <PubLabel>拍摄时段</PubLabel>
            <div className="flex gap-2">
              <input type="time" className="flex-1 rounded-lg panel-input border px-3 py-2" value={form.shootTimeStart} onChange={(e) => patchForm({ shootTimeStart: e.target.value })} />
              <input type="time" className="flex-1 rounded-lg panel-input border px-3 py-2" value={form.shootTimeEnd} onChange={(e) => patchForm({ shootTimeEnd: e.target.value })} />
            </div>
            <PubLabel>拍摄地点</PubLabel>
            <input className="w-full rounded-lg panel-input border px-3 py-2" value={form.shootLocation} onChange={(e) => patchForm({ shootLocation: e.target.value })} />
            <PubLabel>成片交付</PubLabel>
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
          <div className="space-y-3 rounded-lg border border-[var(--shell-border)] p-3" style={{ order: 800 }}>
            <PubLabel>素材来源</PubLabel>
            <div className="flex flex-wrap gap-2">
              {MATERIAL_SOURCES.map((s) => (
                <button key={s} type="button" className={`px-2 py-1 rounded text-xs ${form.materialSource === s ? 'bg-violet-600' : 'bg-white/10'}`} onClick={() => patchForm({ materialSource: s })}>{s}</button>
              ))}
            </div>
            <PubLabel>素材链接</PubLabel>
            <input className="w-full rounded-lg panel-input border px-3 py-2" placeholder="网盘/链接（选填）" value={form.materialUrl} onChange={(e) => patchForm({ materialUrl: e.target.value })} />
            <PubLabel>成片画幅</PubLabel>
            <div className="flex flex-wrap gap-2">
              {ASPECT_RATIOS.map((a) => (
                <button key={a} type="button" className={`px-2 py-1 rounded text-xs ${form.aspectRatio === a ? 'bg-violet-600' : 'bg-white/10'}`} onClick={() => patchForm({ aspectRatio: a })}>{a}</button>
              ))}
            </div>
            <PubLabel>目标时长</PubLabel>
            <div className="flex flex-wrap gap-2">
              {TARGET_DURATIONS.map((d) => (
                <button key={d} type="button" className={`px-2 py-1 rounded text-xs ${form.targetDuration === d ? 'bg-violet-600' : 'bg-white/10'}`} onClick={() => patchForm({ targetDuration: d })}>{d}</button>
              ))}
            </div>
            <PubLabel>剪辑风格</PubLabel>
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
              label="交付截止时间"
              value={deliveryDeadlineDisplayText}
              placeholder={!deliveryDeadlineDate}
              onClick={() => setShowDeliveryDeadlineSheet(true)}
            />
          </div>
        ) : null}

        {!isSupplierPublish && showField('fans') ? (
        <div style={{ order: fieldRank('fans') }}>
          <PubLabel>达人粉丝要求</PubLabel>
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

        {display.showDouyinLevel && !isSupplierPublish && showField('level') ? (
          <div style={{ order: fieldRank('level') }}>
            <PubSelectRow label="达人带货等级" value={display.levelDisplayText} onClick={() => openPicker('reqLevel')} />
          </div>
        ) : null}

        {showField('fee') ? (
        <div className="space-y-3" style={{ order: fieldRank('fee') }}>
        <PubSelectRow
          label="费用模式"
          value={display.feeTypeLabel}
          placeholder={!form.feeTypeId}
          onClick={() => openPicker('fee')}
        />

        {form.feeTypeId === 'fixed' ? (
          <div>
            <PubLabel>一口价金额</PubLabel>
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
            <PubLabel>可接受报价区间</PubLabel>
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
                  <span className="text-slate-400 shrink-0">价格类型</span>
                  <div className="flex flex-1 gap-2">
                    {(['fixed', 'self_quote'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                          (tier.priceMode || 'fixed') === mode
                            ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                            : 'border-[var(--shell-border)] text-slate-400'
                        }`}
                        onClick={() => {
                          const tiers = form.levelTiers.map((t) => ({ ...t }))
                          tiers[idx] = {
                            ...tiers[idx],
                            priceMode: mode,
                            price: mode === 'self_quote' ? '' : tiers[idx].price,
                          }
                          patchForm({ levelTiers: tiers })
                        }}
                      >
                        {mode === 'fixed' ? '固定价' : '自报价'}
                      </button>
                    ))}
                  </div>
                </div>
                {(tier.priceMode || 'fixed') === 'fixed' ? (
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
                ) : (
                  <p className="text-sm text-slate-500">达人报名时自行报价</p>
                )}
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
                  <span className="text-slate-400 shrink-0">价格类型</span>
                  <div className="flex flex-1 gap-2">
                    {(['fixed', 'self_quote'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                          (tier.priceMode || 'fixed') === mode
                            ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                            : 'border-[var(--shell-border)] text-slate-400'
                        }`}
                        onClick={() => {
                          const tiers = form.fansTiers.map((t) => ({ ...t }))
                          tiers[idx] = {
                            ...tiers[idx],
                            priceMode: mode,
                            price: mode === 'self_quote' ? '' : tiers[idx].price,
                          }
                          patchForm({ fansTiers: tiers })
                        }}
                      >
                        {mode === 'fixed' ? '固定价' : '自报价'}
                      </button>
                    ))}
                  </div>
                </div>
                {(tier.priceMode || 'fixed') === 'fixed' ? (
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
                ) : (
                  <p className="text-sm text-slate-500">达人报名时自行报价</p>
                )}
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
        </div>
        ) : null}

        {!isTargetedRecruit && showField('count') ? (
        <div style={{ order: fieldRank('count') }}>
          <PubLabel>{recruitMode === 'edit_ice' ? '成片位总数' : '招募人数'}</PubLabel>
          <input
            type="number"
            min={0}
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={form.recruitCount}
            onChange={(e) => patchNumericField('recruitCount', e.target.value)}
          />
        </div>
        ) : null}

        {showField('detail') ? (
        <div style={{ order: fieldRank('detail') }}>
          <PubLabel>招募详情</PubLabel>
          <textarea
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2 min-h-[120px]"
            placeholder="合作要求、交付内容、档期说明、注意事项等"
            maxLength={2000}
            value={form.recruitDetail}
            onChange={(e) => patchForm({ recruitDetail: e.target.value })}
          />
        </div>
        ) : null}

        {recruitMode !== 'ice' && recruitMode !== 'edit_ice' && (form.fulfillmentLoop || 'closed') === 'open' ? (
          <div style={{ order: 800 }}>
              <div className="mt-3">
                <PubLabel hint="本单已选开环。审核通过后，达人在我的报名详情里扫码进群">上传群二维码</PubLabel>
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
                    onClick={() =>
                      form.groupQrImage
                        ? window.open(form.groupQrImage, '_blank')
                        : groupQrInputRef.current?.click()
                    }
                  >
                    {groupQrUploading ? '上传中…' : form.groupQrImage ? '查看大图' : '选择群二维码图片'}
                  </button>
                  {form.groupQrImage ? (
                    <button
                      type="button"
                      className="text-sm px-3 py-1.5 rounded-lg border"
                      onClick={() => groupQrInputRef.current?.click()}
                    >
                      修改
                    </button>
                  ) : null}
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
          </div>
        ) : null}

        {recruitMode === 'ice' || recruitMode === 'edit_ice' ? (
          <div style={{ order: 800 }}>
            <PubLabel>云剪审核方式</PubLabel>
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
                  上传群二维码                </PubLabel>
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
                    onClick={() =>
                      form.groupQrImage
                        ? window.open(form.groupQrImage, '_blank')
                        : groupQrInputRef.current?.click()
                    }
                  >
                    {groupQrUploading ? '上传中…' : form.groupQrImage ? '查看大图' : '选择群二维码图片'}
                  </button>
                  {form.groupQrImage ? (
                    <button
                      type="button"
                      className="text-sm px-3 py-1.5 rounded-lg border"
                      onClick={() => groupQrInputRef.current?.click()}
                    >
                      修改
                    </button>
                  ) : null}
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
                  上传剪辑师群二维码                </PubLabel>
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

        {publishTemplateMode === 'custom'
          ? customPublishFields.map((row) => (
              <div key={row.id} className="space-y-2" style={{ order: fieldRank(row.id) }}>
                <PubLabel>
                  {row.label} · {row.format === 'image' ? '图片' : row.format === 'video' ? '视频' : '文字'}
                </PubLabel>
                {row.format === 'text' ? (
                  <input
                    className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
                    placeholder="请填写"
                    value={row.value}
                    onChange={(e) =>
                      setCustomPublishFields((list) =>
                        list.map((x) => (x.id === row.id ? { ...x, value: e.target.value } : x)),
                      )
                    }
                  />
                ) : (
                  <div className="mt-1 space-y-2">
                    <input
                      type="file"
                      accept={row.format === 'image' ? 'image/png,image/jpeg,image/webp' : 'video/mp4,video/quicktime'}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        e.target.value = ''
                        if (!file) return
                        const upload = row.format === 'image' ? uploadContentImage(file) : uploadContentVideo(file)
                        void upload
                          .then((url) =>
                            setCustomPublishFields((list) =>
                              list.map((x) => (x.id === row.id ? { ...x, value: url } : x)),
                            ),
                          )
                          .catch((err) => setErr(err instanceof Error ? err.message : '上传失败'))
                      }}
                    />
                    {row.value ? (
                      row.format === 'image' ? (
                        <img src={row.value} alt="" className="max-h-40 rounded-lg border" />
                      ) : (
                        <video src={row.value} controls className="max-h-40 rounded-lg border" />
                      )
                    ) : null}
                  </div>
                )}
              </div>
            ))
          : null}

        <div className="space-y-3" style={{ order: 700 }}>
          <style>{`@keyframes publish-add-plus{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(109,40,217,.4)}70%{transform:scale(1.18);box-shadow:0 0 0 8px rgba(109,40,217,0)}}`}</style>
          <button
            type="button"
            className={`group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-colors duration-200 ${
              fieldEditorOpen
                ? 'border-[#6d28d9] bg-white text-[#4c1d95]'
                : 'border-[#6d28d9] bg-white text-[#4c1d95] hover:bg-[#6d28d9] hover:text-white focus-visible:bg-[#6d28d9] focus-visible:text-white'
            }`}
            onClick={() => {
              if (fieldEditorOpen) {
                setFieldEditorOpen(false)
                setFieldChooserOpen(false)
                return
              }
              const openChooser = (saved: ReturnType<typeof listPublishFormTemplates>) => {
                setSavedFormTemplates(saved)
                setFieldPick({ ...fieldOn })
                setFieldChooserOpen(saved.length > 0)
                setFieldEditorOpen(true)
              }
              const saved = listPublishFormTemplates()
              if (saved.length) {
                openChooser(saved)
                void import('../../lib/mpAccountClientSync')
                  .then((m) => m.syncClientStateWithServer())
                  .then(() => setSavedFormTemplates(listPublishFormTemplates()))
                  .catch(() => {})
              } else {
                void import('../../lib/mpAccountClientSync')
                  .then((m) => m.syncClientStateWithServer())
                  .catch(() => null)
                  .then(() => openChooser(listPublishFormTemplates()))
              }
            }}
          >
            {fieldEditorOpen ? null : (
              <span
                aria-hidden
                className="relative inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#6d28d9] text-lg font-bold leading-none text-white transition-colors duration-200 group-hover:bg-white group-hover:text-[#6d28d9] group-focus-visible:bg-white group-focus-visible:text-[#6d28d9]"
                style={{ animation: 'publish-add-plus 1.4s ease-in-out infinite' }}
              >
                +
              </span>
            )}
            <span className="relative">{fieldEditorOpen ? '收起' : '添加字段'}</span>
          </button>
          {fieldEditorOpen && fieldChooserOpen ? (
            <div className="space-y-2 rounded-lg border border-[var(--shell-border)] p-3">
              <p className="text-xs text-[var(--shell-muted)]">已有商单招募模版。可以直接选用，或重新勾选字段。</p>
              {savedFormTemplates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border border-[var(--shell-border)] px-3 py-2 text-left text-sm"
                  onClick={() => applyRecruitFields(tpl)}
                >
                  <span className="font-medium text-[var(--shell-text)]">{tpl.name}</span>
                  <span className="text-xs text-[#6d28d9]">使用</span>
                </button>
              ))}
              <button
                type="button"
                className="w-full rounded-xl bg-[#6d28d9] py-3 text-base font-semibold text-white"
                onClick={() => setFieldChooserOpen(false)}
              >
                新选择字段
              </button>
            </div>
          ) : null}
          {fieldEditorOpen && !fieldChooserOpen ? (
            <div className="divide-y border border-[var(--shell-border)] rounded-lg">
              <p className="px-3 py-2 text-xs text-[var(--shell-muted)]">可一次勾选多个。勾选的系统字段在保存后显示；自己新增的字段需要填写内容。长按左侧 ≡ 再拖动排序。</p>
              {renderFieldEditor(true)}
              <div className="space-y-3 px-3 py-3">
                <div className="flex items-center gap-2">
                  <select
                    className="rounded-lg panel-input border px-2 py-1.5 text-sm"
                    value={customFieldFormat}
                    onChange={(e) => setCustomFieldFormat(e.target.value as 'text' | 'image' | 'video')}
                  >
                    <option value="text">文字</option>
                    <option value="image">图片</option>
                    <option value="video">视频</option>
                  </select>
                  <input
                    className="flex-1 rounded-lg panel-input border px-3 py-1.5 text-sm"
                    placeholder="字段名称，如到店时间"
                    value={customFieldDraft}
                    onChange={(e) => setCustomFieldDraft(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  aria-label="新增字段"
                  className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#6d28d9] text-3xl font-bold leading-none text-white shadow-md shadow-violet-500/30"
                  onClick={() => addCustomPublishField(customFieldDraft, customFieldFormat)}
                >
                  +
                </button>
              </div>
              <div className="space-y-2 px-3 py-3">
                <button type="button" className="w-full rounded-xl bg-[#6d28d9] py-3 text-base font-semibold text-white" onClick={saveFieldPick}>
                  保存字段
                </button>
                <button
                  type="button"
                  className="w-full rounded-xl border-2 border-[#6d28d9] bg-white py-3 text-base font-semibold text-[#4c1d95]"
                  onClick={saveCurrentAsTemplate}
                >
                  存入我的模版
                </button>
              </div>
            </div>
          ) : null}
        </div>

        </div>

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
          <BtnOutline onClick={() => (isEditMode ? nav('/orders') : setStep('platform'))}>取消</BtnOutline>
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
