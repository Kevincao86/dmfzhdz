import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { appendMpRecruitmentOrder, fetchMpRegistry, updateMpRecruitmentOrder } from '../../lib/mpApi'
import { addPublishedOrder } from '../../lib/mpSync/applicationsStore'
import {
  buildEditorRows,
  emptyCustomTemplate,
  listCustomTemplates,
  saveApplyFormForMpOrder,
  saveCustomTemplate,
  setActiveTemplateId,
  validateTemplateFields,
  type ApplyField,
} from '../../lib/mpSync/applyFormTemplates'
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
import {
  DELIVERY_WINDOWS,
  DOUYIN_SALES_LEVELS,
  DOUYIN_TIER_LEVELS,
  FANS_TIER_RANGES,
  FEE_TYPES,
  newFansTier,
  newLevelTier,
  PLATFORMS,
  RECRUIT_MODES,
  TALENT_TAGS,
} from '../../lib/mpSync/publishFormOptions'
import { readPrProfile } from '../../lib/mpSync/userProfile'

type PickerView = '' | 'platform' | 'tag' | 'city' | 'reqLevel' | 'fee' | 'tierLevel' | 'fansTier' | 'applyForm'

const PUBLISH_EDIT_KEY = 'meoo_publish_edit_mp_id'

function PubLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-1">
      <span className="text-slate-300 text-sm font-medium">{children}</span>
      {hint ? <p className="text-xs text-slate-500 mt-0.5">{hint}</p> : null}
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
        className="w-full flex justify-between items-center rounded-lg bg-black/30 border border-white/10 px-3 py-2.5 text-left text-sm"
      >
        <span className={placeholder ? 'text-slate-500' : ''}>{value}</span>
        <span className="text-slate-500">›</span>
      </button>
    </div>
  )
}

function FullPicker({
  title,
  onBack,
  onConfirm,
  confirmLabel = '确认',
  children,
}: {
  title: string
  onBack: () => void
  onConfirm?: () => void
  confirmLabel?: string
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#12121c]">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0">
        <button type="button" className="text-slate-400 hover:text-white" onClick={onBack}>
          ‹ 返回
        </button>
        <h3 className="font-semibold flex-1">{title}</h3>
      </header>
      <div className="flex-1 overflow-auto p-4">{children}</div>
      {onConfirm ? (
        <footer className="p-4 border-t border-white/10 shrink-0">
          <button type="button" className="w-full py-3 rounded-xl bg-violet-600 font-medium" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </footer>
      ) : null}
    </div>
  )
}

export default function PublishWizard() {
  const nav = useNavigate()
  const [search] = useSearchParams()
  const pr = readPrProfile()

  const [step, setStep] = useState<'mode' | 'form' | 'done'>('mode')
  const [recruitMode, setRecruitMode] = useState('')
  const [recruitModeLabel, setRecruitModeLabel] = useState('')
  const [form, setForm] = useState<PublishForm>(emptyPublishForm)
  const [pickerView, setPickerView] = useState<PickerView>('')
  const [todayDate] = useState(defaultSignupDate)
  const [signupDeadlineDate, setSignupDeadlineDate] = useState('')
  const [signupDeadlineTime, setSignupDeadlineTime] = useState('23:59')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')
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
  const [showApplyTplModal, setShowApplyTplModal] = useState(false)

  const display = useMemo(() => computePublishDisplay(form), [form])

  const syncDeadline = useCallback((date: string, time: string) => {
    if (!date) {
      setForm((f) => ({ ...f, signupDeadline: '' }))
      return
    }
    setForm((f) => ({ ...f, signupDeadline: `${date} ${time || '23:59'}:00` }))
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
      <div className="max-w-xl space-y-4">
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

  function openPicker(view: PickerView) {
    if (view === 'applyForm' && !form.platform) {
      setErr('请先选择招募平台')
      return
    }
    if (view === 'city') refreshCityUi('')
    if (view === 'tag') setTagSelected(new Set(form.talentTags))
    if (view === 'reqLevel') setReqLevelSelected(new Set(form.douyinSalesLevels.length ? form.douyinSalesLevels : ['不限']))
    setPickerView(view)
  }

  async function onSubmit() {
    const vErr = validatePublishForm(form, recruitMode)
    if (vErr) {
      setErr(vErr)
      return
    }
    setSubmitting(true)
    setErr('')
    try {
      const order = buildPublishOrder(form, recruitMode, { editId: editMpId || undefined, existing: editingOrder || undefined })
      if (isEditMode && editMpId) {
        await updateMpRecruitmentOrder(order)
      } else {
        await appendMpRecruitmentOrder(order)
        const pubHall = form.deliveryWindow === 'urgent' ? 'urgent' : 'normal'
        addPublishedOrder({ mpOrderId: String(order.id), title: String(order.title), hall: pubHall })
      }
      saveApplyFormForMpOrder(String(order.id), {
        templateId: form.applyFormTemplateId,
        templateName: form.applyFormTemplateName,
        fields: form.applyFormFields,
      })
      if (form.applyFormTemplateId) setActiveTemplateId(form.applyFormTemplateId)
      setDoneId(String(order.id))
      setStep('done')
    } catch (e) {
      setErr(e instanceof Error ? e.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 'done' && doneId) {
    return (
      <div className="max-w-xl space-y-4">
        <h2 className="text-xl font-bold text-emerald-400">{isEditMode ? '已保存' : '发布成功'}</h2>
        <p className="text-sm text-slate-400">单号 {doneId}</p>
        <div className="flex gap-3">
          <button type="button" className="px-4 py-2 rounded-lg bg-violet-600" onClick={() => nav('/orders')}>
            我的发单
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-lg border border-white/20"
            onClick={() => {
              setDoneId('')
              setStep('mode')
              setForm(emptyPublishForm())
              setIsEditMode(false)
              setEditMpId('')
            }}
          >
            再发一单
          </button>
        </div>
      </div>
    )
  }

  if (step === 'mode') {
    return (
      <div className="max-w-xl space-y-4">
        <h2 className="text-xl font-bold">选择招募模式</h2>
        <p className="text-sm text-slate-400">探店 · 品宣 · 云剪</p>
        <div className="space-y-3">
          {RECRUIT_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={m.disabled}
              className={`w-full text-left rounded-xl border p-4 transition-colors ${
                m.disabled ? 'border-white/5 opacity-50 cursor-not-allowed' : 'border-white/10 hover:border-violet-500/40 bg-[#1a1a28]'
              }`}
              onClick={() => {
                if (m.disabled) {
                  setErr('云剪任务功能搭建中')
                  return
                }
                setRecruitMode(m.id)
                setRecruitModeLabel(m.label)
                setSignupDeadlineDate('')
                setSignupDeadlineTime('23:59')
                setStep('form')
              }}
            >
              <div className="font-semibold">{m.label}</div>
              <div className="text-sm text-slate-400 mt-1">{m.sub}</div>
              {m.disabled ? <span className="text-xs text-amber-500 mt-2 inline-block">搭建中</span> : null}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (pickerView === 'platform') {
    return (
      <FullPicker title="招募平台" onBack={() => setPickerView('')} onConfirm={() => setPickerView('')}>
        <div className="space-y-2">
          {PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              className={`w-full py-3 rounded-lg text-sm ${form.platform === p ? 'bg-violet-600' : 'bg-white/10'}`}
              onClick={() => {
                patchForm({
                  platform: p,
                  douyinSalesLevels: p === '抖音' ? form.douyinSalesLevels : [],
                })
                setPickerView('')
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </FullPicker>
    )
  }

  if (pickerView === 'tag') {
    return (
      <FullPicker
        title="需求达人标签"
        onBack={() => setPickerView('')}
        onConfirm={() => {
          const tags = [...tagSelected]
          if (!tags.length) {
            setErr('请至少选择1个标签')
            return
          }
          patchForm({ talentTags: tags })
          setPickerView('')
        }}
      >
        <p className="text-xs text-slate-500 mb-3">最多可选 2 个</p>
        <div className="flex flex-wrap gap-2">
          {TALENT_TAGS.map((name) => {
            const on = tagSelected.has(name)
            const disabled = !on && tagSelected.size >= 2
            return (
              <button
                key={name}
                type="button"
                disabled={disabled}
                className={`px-3 py-1.5 rounded-full text-sm ${on ? 'bg-violet-600' : disabled ? 'bg-white/5 text-slate-600' : 'bg-white/10'}`}
                onClick={() => {
                  setTagSelected((prev) => {
                    const next = new Set(prev)
                    if (next.has(name)) next.delete(name)
                    else if (next.size < 2) next.add(name)
                    return next
                  })
                }}
              >
                {name}
              </button>
            )
          })}
        </div>
      </FullPicker>
    )
  }

  if (pickerView === 'city') {
    return (
      <FullPicker
        title="招募城市"
        onBack={() => setPickerView('')}
        onConfirm={() => {
          if (!form.cityNational && !form.selectedCities.length) {
            setErr('请选择全国或添加城市')
            return
          }
          setPickerView('')
        }}
      >
        <p className="text-xs text-slate-500 mb-3">可多选城市；选「全国」则不限地域</p>
        <button
          type="button"
          className={`w-full mb-3 py-2 rounded-lg ${form.cityNational ? 'bg-violet-600' : 'bg-white/10'}`}
          onClick={() => patchForm({ cityNational: true, selectedCities: [] })}
        >
          全国
        </button>
        <input
          className="w-full mb-3 rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm"
          placeholder="搜索省、市"
          value={cityKeyword}
          onChange={(e) => setCityKeyword(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2 h-64">
          <div className="overflow-auto border border-white/10 rounded-lg">
            {cityProvinceRows.map((p) => (
              <button
                key={p.name}
                type="button"
                className={`block w-full text-left px-2 py-2 text-sm ${p.active ? 'bg-violet-600/30' : ''}`}
                onClick={() => refreshCityUi(p.name)}
              >
                {p.name}
              </button>
            ))}
          </div>
          <div className="overflow-auto border border-white/10 rounded-lg">
            {cityCheckGrid.map((c) => (
              <button
                key={c.name}
                type="button"
                className="flex w-full items-center gap-2 px-2 py-2 text-sm hover:bg-white/5"
                onClick={() => {
                  const cities = [...form.selectedCities]
                  const idx = cities.indexOf(c.name)
                  if (idx >= 0) cities.splice(idx, 1)
                  else cities.push(c.name)
                  patchForm({ selectedCities: cities, cityNational: false })
                  refreshCityUi()
                }}
              >
                <span className={`w-4 h-4 border rounded text-xs flex items-center justify-center ${c.on ? 'bg-violet-600 border-violet-600' : 'border-white/30'}`}>
                  {c.on ? '✓' : ''}
                </span>
                {c.name}
              </button>
            ))}
          </div>
        </div>
        {form.selectedCities.length ? (
          <div className="flex flex-wrap gap-1 mt-3">
            {form.selectedCities.map((c) => (
              <span key={c} className="text-xs px-2 py-0.5 rounded bg-violet-500/20">
                {c}
                <button type="button" className="ml-1" onClick={() => patchForm({ selectedCities: form.selectedCities.filter((x) => x !== c) })}>
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </FullPicker>
    )
  }

  if (pickerView === 'reqLevel') {
    return (
      <FullPicker
        title="达人带货等级"
        onBack={() => setPickerView('')}
        onConfirm={() => {
          const levels = [...reqLevelSelected]
          patchForm({ douyinSalesLevels: levels.length ? levels : ['不限'] })
          setPickerView('')
        }}
      >
        <p className="text-xs text-slate-500 mb-3">请选择等级（可多选）</p>
        <div className="flex flex-wrap gap-2">
          {DOUYIN_SALES_LEVELS.map((name) => {
            const on = reqLevelSelected.has(name)
            return (
              <button
                key={name}
                type="button"
                className={`px-3 py-1.5 rounded-full text-sm ${on ? 'bg-violet-600' : 'bg-white/10'}`}
                onClick={() => {
                  setReqLevelSelected((prev) => {
                    const next = new Set(prev)
                    if (name === '不限') return new Set(['不限'])
                    next.delete('不限')
                    if (next.has(name)) next.delete(name)
                    else next.add(name)
                    if (!next.size) next.add('不限')
                    return next
                  })
                }}
              >
                {name}
              </button>
            )
          })}
        </div>
      </FullPicker>
    )
  }

  if (pickerView === 'fee') {
    return (
      <FullPicker title="费用模式" onBack={() => setPickerView('')}>
        <div className="space-y-3">
          {FEE_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`w-full text-left rounded-xl border p-4 ${form.feeTypeId === t.id ? 'border-violet-500 bg-violet-600/10' : 'border-white/10'}`}
              onClick={() => {
                const patch: Partial<PublishForm> = { feeTypeId: t.id }
                if (t.id === 'level_tier' && !form.levelTiers.length) patch.levelTiers = [newLevelTier()]
                if (t.id === 'fans_tier' && !form.fansTiers.length) patch.fansTiers = [newFansTier()]
                patchForm(patch)
                setPickerView('')
              }}
            >
              <div className="font-medium">{t.label}</div>
              <div className="text-xs text-slate-400 mt-1">{t.desc}</div>
            </button>
          ))}
        </div>
      </FullPicker>
    )
  }

  if (pickerView === 'tierLevel' && editingTierIndex >= 0) {
    const tier = form.levelTiers[editingTierIndex]
    const used = new Set<string>()
    form.levelTiers.forEach((t, i) => {
      if (i === editingTierIndex) return
      ;(t.levels || []).forEach((lv) => used.add(lv))
    })
    return (
      <FullPicker
        title="选择达人等级"
        onBack={() => {
          setEditingTierIndex(-1)
          setPickerView('')
        }}
        onConfirm={() => {
          const levels = [...tierLevelSelected]
          if (!levels.length) {
            setErr('请至少选择一个等级')
            return
          }
          const tiers = form.levelTiers.map((t) => ({ ...t }))
          tiers[editingTierIndex] = {
            ...tiers[editingTierIndex],
            levels,
            levelsText: levels.join('、'),
          }
          patchForm({ levelTiers: tiers })
          setEditingTierIndex(-1)
          setPickerView('')
        }}
      >
        <div className="flex flex-wrap gap-2">
          {DOUYIN_TIER_LEVELS.map((name) => {
            const on = tierLevelSelected.has(name)
            const disabled = !on && used.has(name)
            return (
              <button
                key={name}
                type="button"
                disabled={disabled}
                className={`px-3 py-1.5 rounded-full text-sm ${on ? 'bg-violet-600' : disabled ? 'opacity-40' : 'bg-white/10'}`}
                onClick={() => {
                  setTierLevelSelected((prev) => {
                    const next = new Set(prev)
                    if (next.has(name)) next.delete(name)
                    else next.add(name)
                    return next
                  })
                }}
              >
                {name}
              </button>
            )
          })}
        </div>
        {tier ? <p className="text-xs text-slate-500 mt-2">当前阶梯：{tier.levelsText}</p> : null}
      </FullPicker>
    )
  }

  if (pickerView === 'fansTier' && editingTierIndex >= 0) {
    const used = new Set(form.fansTiers.filter((_, j) => j !== editingTierIndex).map((t) => t.fansRange).filter(Boolean))
    return (
      <FullPicker title="粉丝档位" onBack={() => setPickerView('')}>
        <div className="space-y-2">
          {FANS_TIER_RANGES.map((range) => (
            <button
              key={range}
              type="button"
              disabled={used.has(range)}
              className={`w-full py-2 rounded-lg text-sm ${used.has(range) ? 'opacity-40' : 'bg-white/10 hover:bg-violet-600'}`}
              onClick={() => {
                const tiers = form.fansTiers.map((t) => ({ ...t }))
                tiers[editingTierIndex] = { ...tiers[editingTierIndex], fansRange: range, fansRangeText: range }
                patchForm({ fansTiers: tiers })
                setEditingTierIndex(-1)
                setPickerView('')
              }}
            >
              {range}
            </button>
          ))}
        </div>
      </FullPicker>
    )
  }

  if (pickerView === 'applyForm') {
    const previewPlatform = form.platform || '抖音'
    const editorRows = buildEditorRows(applyEditorFields, previewPlatform)
    return (
      <FullPicker
        title="达人报名必填信息"
        onBack={() => setPickerView('')}
        onConfirm={() => {
          const v = validateTemplateFields(applyEditorFields)
          if (v) {
            setErr(v)
            return
          }
          const name = applyEditorName.trim() || '已配置报名项'
          patchForm({
            applyFormTemplateId: applyEditorTplId,
            applyFormTemplateName: name,
            applyFormFields: applyEditorFields,
          })
          if (window.confirm('是否同时保存为「我的模版」？')) {
            saveCustomTemplate({ id: applyEditorTplId, name, kind: 'apply', fields: applyEditorFields })
          }
          setPickerView('')
        }}
      >
        <label className="block text-sm mb-3">
          <span className="text-slate-400">模版名称</span>
          <input
            className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
            value={applyEditorName}
            onChange={(e) => setApplyEditorName(e.target.value)}
          />
        </label>
        <ul className="text-sm space-y-2">
          {editorRows.map((row) => (
            <li key={row.id} className="flex justify-between py-2 border-b border-white/5">
              <span>
                {row.displayLabel}
                {row.required ? ' *' : ''}
              </span>
              <label className="text-xs text-slate-400 flex items-center gap-1">
                必填
                <input
                  type="checkbox"
                  checked={!!row.required}
                  disabled={row.locked}
                  onChange={(e) => {
                    setApplyEditorFields((list) =>
                      list.map((f) => (f.id === row.id ? { ...f, required: e.target.checked } : f)),
                    )
                  }}
                />
              </label>
            </li>
          ))}
        </ul>
      </FullPicker>
    )
  }

  if (showApplyTplModal) {
    const list = listCustomTemplates()
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
        <div className="w-full max-w-md rounded-2xl bg-[#1a1a28] border border-white/10 p-4 max-h-[70vh] overflow-auto">
          <h3 className="font-semibold mb-3">选择报名模版</h3>
          {list.map((t) => (
            <button
              key={t.id}
              type="button"
              className="w-full text-left py-3 border-b border-white/5 text-sm hover:text-violet-300"
              onClick={() => {
                setApplyEditorTplId(t.id)
                setApplyEditorName(t.name)
                setApplyEditorFields(t.fields.map((f) => ({ ...f })))
                setShowApplyTplModal(false)
                setPickerView('applyForm')
              }}
            >
              {t.name}
            </button>
          ))}
          <button type="button" className="mt-4 text-sm text-slate-400" onClick={() => setShowApplyTplModal(false)}>
            取消
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <button type="button" className="text-slate-400 text-sm" onClick={() => (isEditMode ? nav('/orders') : setStep('mode'))}>
          ‹ 返回
        </button>
        <div>
          <h2 className="text-xl font-bold">{isEditMode ? '编辑招募' : '填写招募信息'}</h2>
          <span className="text-xs px-2 py-0.5 rounded bg-violet-600/30 text-violet-200">{recruitModeLabel}</span>
        </div>
      </div>

      <section className="rounded-xl border border-white/10 bg-[#1a1a28] p-4 space-y-4 text-sm">
        <div>
          <PubLabel>投放窗口 *</PubLabel>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {DELIVERY_WINDOWS.map((w) => (
              <button
                key={w.id}
                type="button"
                className={`p-3 rounded-lg text-left border ${form.deliveryWindow === w.id ? 'border-violet-500 bg-violet-600/15' : 'border-white/10'}`}
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
          <div>
            <PubLabel>招募报名截止时间 *</PubLabel>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <input
                type="date"
                min={todayDate}
                className="rounded-lg bg-black/30 border border-white/10 px-3 py-2"
                value={signupDeadlineDate}
                onChange={(e) => {
                  setSignupDeadlineDate(e.target.value)
                  syncDeadline(e.target.value, signupDeadlineTime)
                }}
              />
              <input
                type="time"
                className="rounded-lg bg-black/30 border border-white/10 px-3 py-2"
                value={signupDeadlineTime}
                onChange={(e) => {
                  setSignupDeadlineTime(e.target.value)
                  syncDeadline(signupDeadlineDate, e.target.value)
                }}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-amber-500/90">急单大厅：发布后 24 小时内截止报名（无需填写）</p>
        )}

        <div>
          <PubLabel>招募标题 *</PubLabel>
          <input
            className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
            placeholder="如：春季火锅探店招募"
            value={form.title}
            onChange={(e) => patchForm({ title: e.target.value })}
          />
        </div>

        <PubSelectRow
          label="招募平台 *"
          value={display.platformDisplayText}
          placeholder={!form.platform}
          onClick={() => openPicker('platform')}
        />
        <PubSelectRow
          label="招募城市 *"
          value={display.cityDisplayText}
          placeholder={display.cityDisplayText === '请选择招募城市'}
          onClick={() => openPicker('city')}
        />
        <PubSelectRow
          label="需求达人标签 *"
          hint="最多 2 个，不可重复"
          value={display.tagsDisplayText}
          placeholder={!form.talentTags.length}
          onClick={() => openPicker('tag')}
        />

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
                className="flex-1 rounded-lg bg-black/30 border border-white/10 px-3 py-2"
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

        {display.showDouyinLevel ? (
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
              className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
              placeholder="请填写，0 代表置换"
              value={form.fixedPrice}
              onChange={(e) => patchForm({ fixedPrice: e.target.value })}
            />
          </div>
        ) : null}

        {form.feeTypeId === 'self_quote' ? (
          <div>
            <PubLabel>可接受报价区间 *</PubLabel>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                className="flex-1 rounded-lg bg-black/30 border border-white/10 px-3 py-2"
                placeholder="最低"
                value={form.selfQuoteMin}
                onChange={(e) => patchForm({ selfQuoteMin: e.target.value })}
              />
              <span className="text-slate-500">-</span>
              <input
                type="number"
                className="flex-1 rounded-lg bg-black/30 border border-white/10 px-3 py-2"
                placeholder="最高"
                value={form.selfQuoteMax}
                onChange={(e) => patchForm({ selfQuoteMax: e.target.value })}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">如 0-2000，单位为元</p>
          </div>
        ) : null}

        {form.feeTypeId === 'level_tier' ? (
          <div className="space-y-3">
            <p className="text-slate-400 text-sm">请继续设置费用阶梯</p>
            {form.levelTiers.map((tier, idx) => (
              <div key={tier.id} className="rounded-lg border border-white/10 p-3 space-y-2 relative">
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
                    className="flex-1 rounded-lg bg-black/30 border border-white/10 px-3 py-2"
                    placeholder="0代表置换"
                    value={tier.price}
                    onChange={(e) => {
                      const tiers = form.levelTiers.map((t) => ({ ...t }))
                      tiers[idx] = { ...tiers[idx], price: e.target.value }
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
              <div key={tier.id} className="rounded-lg border border-white/10 p-3 space-y-2 relative">
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
                    className="flex-1 rounded-lg bg-black/30 border border-white/10 px-3 py-2"
                    value={tier.price}
                    onChange={(e) => {
                      const tiers = form.fansTiers.map((t) => ({ ...t }))
                      tiers[idx] = { ...tiers[idx], price: e.target.value }
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
            className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
            placeholder="选填"
            value={form.cpsPercent}
            onChange={(e) => patchForm({ cpsPercent: e.target.value })}
          />
        </div>

        <div>
          <PubLabel>招募人数 *</PubLabel>
          <input
            type="number"
            min={1}
            className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
            value={form.recruitCount}
            onChange={(e) => patchForm({ recruitCount: e.target.value })}
          />
        </div>

        <div>
          <PubLabel>招募详情 *</PubLabel>
          <textarea
            className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 min-h-[120px]"
            placeholder="合作要求、交付内容、档期说明、注意事项等"
            maxLength={2000}
            value={form.recruitDetail}
            onChange={(e) => patchForm({ recruitDetail: e.target.value })}
          />
        </div>

        {recruitMode === 'ice' ? (
          <div>
            <PubLabel>云剪成片链接 *</PubLabel>
            <input
              className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
              placeholder="https://…mp4"
              value={form.iceVideoUrl}
              onChange={(e) => patchForm({ iceVideoUrl: e.target.value })}
            />
          </div>
        ) : null}

        <PubSelectRow
          label="达人报名必填信息 *"
          value={display.applyFormDisplayText}
          placeholder={display.applyFormPlaceholder}
          onClick={() => {
            setErr('')
            const choice = window.prompt('输入 1=新增报名表单，2=使用我的模版', '1')
            if (choice === '2') {
              const list = listCustomTemplates()
              if (!list.length) {
                setErr('请先在「我的模版」中新建自定义模版')
                return
              }
              setShowApplyTplModal(true)
            } else if (choice === '1') {
              const tpl = emptyCustomTemplate('我的报名模版')
              setApplyEditorTplId(tpl.id)
              setApplyEditorName(tpl.name)
              setApplyEditorFields(tpl.fields.map((f) => ({ ...f })))
              setPickerView('applyForm')
            }
          }}
        />
      </section>

      {err ? <p className="text-red-400 text-sm">{err}</p> : null}

      <button
        type="button"
        disabled={submitting}
        className="fixed bottom-6 left-56 right-6 max-w-2xl mx-auto py-3 rounded-xl bg-violet-600 font-medium disabled:opacity-50 shadow-lg z-10"
        onClick={() => void onSubmit()}
      >
        {submitting ? '提交中…' : isEditMode ? '保存修改' : '创建招募'}
      </button>
    </div>
  )
}
