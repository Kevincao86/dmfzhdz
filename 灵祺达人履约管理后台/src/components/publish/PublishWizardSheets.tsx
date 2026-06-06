import type { Dispatch, SetStateAction } from 'react'
import PublishSheet from './PublishSheet'
import SignupDeadlineSheet from './SignupDeadlineSheet'
import {
  buildEditorRows,
  emptyCustomTemplate,
  listCustomTemplates,
  saveCustomTemplate,
  templateKindFromRecruitTarget,
  validateTemplateFields,
  type ApplyField,
} from '../../lib/mpSync/applyFormTemplates'
import type { PublishForm } from '../../lib/mpSync/publishOrder'
import {
  DOUYIN_SALES_LEVELS,
  DOUYIN_TIER_LEVELS,
  FANS_TIER_RANGES,
  FEE_TYPES,
  newFansTier,
  newLevelTier,
  PLATFORMS,
  TALENT_TAGS,
} from '../../lib/mpSync/publishFormOptions'

export type PickerView =
  | ''
  | 'platform'
  | 'tag'
  | 'city'
  | 'reqLevel'
  | 'fee'
  | 'tierLevel'
  | 'fansTier'
  | 'applyForm'
  | 'applyMenu'
  | 'applyTplList'

type Props = {
  pickerView: PickerView
  setPickerView: (v: PickerView) => void
  showDeadlineSheet: boolean
  setShowDeadlineSheet: (v: boolean) => void
  todayDate: string
  signupDeadlineDate: string
  signupDeadlineTime: string
  onDeadlineConfirm: (date: string, time: string) => void
  form: PublishForm
  patchForm: (patch: Partial<PublishForm>) => void
  setErr: (msg: string) => void
  tagSelected: Set<string>
  setTagSelected: Dispatch<SetStateAction<Set<string>>>
  reqLevelSelected: Set<string>
  setReqLevelSelected: Dispatch<SetStateAction<Set<string>>>
  cityKeyword: string
  setCityKeyword: (v: string) => void
  cityProvinceRows: { name: string; active: boolean }[]
  cityCheckGrid: { name: string; on: boolean }[]
  refreshCityUi: (hint?: string) => void
  editingTierIndex: number
  setEditingTierIndex: (i: number) => void
  tierLevelSelected: Set<string>
  setTierLevelSelected: Dispatch<SetStateAction<Set<string>>>
  applyEditorFields: ApplyField[]
  setApplyEditorFields: Dispatch<SetStateAction<ApplyField[]>>
  applyEditorName: string
  setApplyEditorName: (v: string) => void
  applyEditorTplId: string
  setApplyEditorTplId: (v: string) => void
  applyEditorMode: 'new' | 'template'
  setApplyEditorMode: (v: 'new' | 'template') => void
  recruitTarget: string
}

export default function PublishWizardSheets(props: Props) {
  const {
    pickerView,
    setPickerView,
    showDeadlineSheet,
    setShowDeadlineSheet,
    todayDate,
    signupDeadlineDate,
    signupDeadlineTime,
    onDeadlineConfirm,
    form,
    patchForm,
    setErr,
    tagSelected,
    setTagSelected,
    reqLevelSelected,
    setReqLevelSelected,
    cityKeyword,
    setCityKeyword,
    cityProvinceRows,
    cityCheckGrid,
    refreshCityUi,
    editingTierIndex,
    setEditingTierIndex,
    tierLevelSelected,
    setTierLevelSelected,
    applyEditorFields,
    setApplyEditorFields,
    applyEditorName,
    setApplyEditorName,
    applyEditorTplId,
    setApplyEditorTplId,
    applyEditorMode,
    setApplyEditorMode,
    recruitTarget,
  } = props

  const applyTemplateKind = templateKindFromRecruitTarget(recruitTarget || 'talent')
  const applyMenuTitle =
    applyTemplateKind === 'shoot'
      ? '拍摄团队报名必填信息'
      : applyTemplateKind === 'edit'
        ? '剪辑团队报名必填信息'
        : '达人报名必填信息'

  const tier = editingTierIndex >= 0 ? form.levelTiers[editingTierIndex] : null
  const usedLevels = new Set<string>()
  if (editingTierIndex >= 0) {
    form.levelTiers.forEach((t, i) => {
      if (i === editingTierIndex) return
      ;(t.levels || []).forEach((lv) => usedLevels.add(lv))
    })
  }
  const usedFansRanges = new Set(
    form.fansTiers.filter((_, j) => j !== editingTierIndex).map((t) => t.fansRange).filter(Boolean),
  )
  const previewPlatform = form.platform || '抖音'
  const editorRows = buildEditorRows(applyEditorFields, previewPlatform, applyTemplateKind)
  const customTemplates = listCustomTemplates(applyTemplateKind)

  return (
    <>
      <SignupDeadlineSheet
        open={showDeadlineSheet}
        minDate={todayDate}
        date={signupDeadlineDate}
        time={signupDeadlineTime}
        onClose={() => setShowDeadlineSheet(false)}
        onConfirm={(date, time) => {
          onDeadlineConfirm(date, time)
          setShowDeadlineSheet(false)
        }}
      />

      <PublishSheet open={pickerView === 'platform'} title="招募平台" onClose={() => setPickerView('')}>
        <div className="space-y-2">
          {PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              className={`w-full py-2.5 rounded-lg text-sm ${form.platform === p ? 'bg-violet-600' : 'bg-white/10 hover:bg-white/15'}`}
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
      </PublishSheet>

      <PublishSheet
        open={pickerView === 'tag'}
        title="需求达人标签"
        onClose={() => setPickerView('')}
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
      </PublishSheet>

      <PublishSheet
        open={pickerView === 'city'}
        title="招募城市"
        tall
        onClose={() => setPickerView('')}
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
          className={`w-full mb-3 py-2 rounded-lg text-sm ${form.cityNational ? 'bg-violet-600' : 'bg-white/10'}`}
          onClick={() => patchForm({ cityNational: true, selectedCities: [] })}
        >
          全国
        </button>
        <input
          className="w-full mb-3 rounded-lg panel-input border px-3 py-2 text-sm"
          placeholder="搜索省、市"
          value={cityKeyword}
          onChange={(e) => setCityKeyword(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2 h-52">
          <div className="overflow-auto border border-[var(--shell-border)] rounded-lg">
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
          <div className="overflow-auto border border-[var(--shell-border)] rounded-lg">
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
                <span
                  className={`w-4 h-4 border rounded text-xs flex items-center justify-center shrink-0 ${
                    c.on ? 'bg-violet-600 border-violet-600' : 'border-white/30'
                  }`}
                >
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
                <button
                  type="button"
                  className="ml-1"
                  onClick={() => patchForm({ selectedCities: form.selectedCities.filter((x) => x !== c) })}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </PublishSheet>

      <PublishSheet
        open={pickerView === 'reqLevel'}
        title="达人带货等级"
        onClose={() => setPickerView('')}
        onConfirm={() => {
          const levels = [...reqLevelSelected]
          patchForm({ douyinSalesLevels: levels.length ? levels : ['不限'] })
          setPickerView('')
        }}
      >
        <p className="text-xs text-slate-500 mb-3">请选择等级（可多选）</p>
        <div className="flex flex-wrap gap-2">
          {DOUYIN_SALES_LEVELS.map((name) => (
            <button
              key={name}
              type="button"
              className={`px-3 py-1.5 rounded-full text-sm ${reqLevelSelected.has(name) ? 'bg-violet-600' : 'bg-white/10'}`}
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
          ))}
        </div>
      </PublishSheet>

      <PublishSheet open={pickerView === 'fee'} title="费用模式" onClose={() => setPickerView('')}>
        <div className="space-y-2">
          {FEE_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`w-full text-left rounded-xl border p-3 text-sm ${
                form.feeTypeId === t.id ? 'border-violet-500 bg-violet-600/10' : 'border-white/10 hover:border-white/20'
              }`}
              onClick={() => {
                const patch: Partial<PublishForm> = { feeTypeId: t.id }
                if (t.id === 'level_tier' && !form.levelTiers.length) patch.levelTiers = [newLevelTier()]
                if (t.id === 'fans_tier' && !form.fansTiers.length) patch.fansTiers = [newFansTier()]
                patchForm(patch)
                setPickerView('')
              }}
            >
              <div className="font-medium">{t.label}</div>
              <div className="text-xs text-slate-400 mt-0.5">{t.desc}</div>
            </button>
          ))}
        </div>
      </PublishSheet>

      <PublishSheet
        open={pickerView === 'tierLevel' && editingTierIndex >= 0}
        title="选择达人等级"
        onClose={() => {
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
            const disabled = !on && usedLevels.has(name)
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
      </PublishSheet>

      <PublishSheet
        open={pickerView === 'fansTier' && editingTierIndex >= 0}
        title="粉丝档位"
        onClose={() => {
          setEditingTierIndex(-1)
          setPickerView('')
        }}
      >
        <div className="space-y-2">
          {FANS_TIER_RANGES.map((range) => (
            <button
              key={range}
              type="button"
              disabled={usedFansRanges.has(range)}
              className={`w-full py-2 rounded-lg text-sm ${
                usedFansRanges.has(range) ? 'opacity-40' : 'bg-white/10 hover:bg-violet-600'
              }`}
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
      </PublishSheet>

      <PublishSheet open={pickerView === 'applyMenu'} title={applyMenuTitle} onClose={() => setPickerView('')}>
        <div className="space-y-2">
          <button
            type="button"
            className="w-full py-3 rounded-lg bg-white/10 text-sm hover:bg-violet-600/30 transition-colors"
            onClick={() => {
              const tpl = emptyCustomTemplate(
                applyTemplateKind === 'shoot'
                  ? '拍摄报名模版'
                  : applyTemplateKind === 'edit'
                    ? '剪辑报名模版'
                    : '我的报名模版',
                applyTemplateKind,
              )
              setApplyEditorMode('new')
              setApplyEditorTplId(tpl.id)
              setApplyEditorName(tpl.name)
              setApplyEditorFields(tpl.fields.map((f) => ({ ...f })))
              setPickerView('applyForm')
            }}
          >
            新增报名表单
          </button>
          <button
            type="button"
            className="w-full py-3 rounded-lg bg-white/10 text-sm hover:bg-violet-600/30 transition-colors"
            onClick={() => {
              if (!customTemplates.length) {
                setErr('请先在「我的模版」中新建对应类型的自定义模版')
                return
              }
              setPickerView('applyTplList')
            }}
          >
            使用我的模版
          </button>
        </div>
      </PublishSheet>

      <PublishSheet open={pickerView === 'applyTplList'} title="选择报名模版" onClose={() => setPickerView('applyMenu')}>
        <div className="space-y-1 max-h-48 overflow-auto">
          {customTemplates.map((t) => (
            <button
              key={t.id}
              type="button"
              className="w-full text-left py-2.5 px-2 rounded-lg text-sm hover:bg-white/10 transition-colors"
              onClick={() => {
                setApplyEditorMode('template')
                setApplyEditorTplId(t.id)
                setApplyEditorName(t.name)
                setApplyEditorFields(t.fields.map((f) => ({ ...f })))
                setPickerView('applyForm')
              }}
            >
              {t.name}
            </button>
          ))}
        </div>
      </PublishSheet>

      <PublishSheet
        open={pickerView === 'applyForm'}
        title="配置报名项"
        tall
        onClose={() => setPickerView('')}
        onConfirm={() => {
          const v = validateTemplateFields(applyEditorFields, applyTemplateKind)
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
          const usingExistingTemplate =
            applyEditorMode === 'template' &&
            !!applyEditorTplId &&
            customTemplates.some((t) => t.id === applyEditorTplId)
          if (!usingExistingTemplate) {
            const shouldSave = window.confirm('是否同时保存为「我的模版」？')
            if (shouldSave) {
              saveCustomTemplate({
                id: applyEditorTplId,
                name,
                kind: applyTemplateKind,
                fields: applyEditorFields,
              })
            }
          }
          setApplyEditorMode('new')
          setPickerView('')
        }}
      >
        <label className="block text-sm mb-3">
          <span className="text-slate-400">模版名称</span>
          <input
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
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
      </PublishSheet>
    </>
  )
}
