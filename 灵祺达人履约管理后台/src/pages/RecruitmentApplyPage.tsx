import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import RegionSelect from '../components/mp/RegionSelect'
import { applyToMpOrder, registerTalentMember } from '../lib/mpApi'
import { getActiveRole } from '../lib/mpSession'
import { addApplication } from '../lib/mpSync/applicationsStore'
import { getApplyConfigForMpOrder, resolveApplyRows } from '../lib/mpSync/applyFormTemplates'
import { applyFieldsFromMember, emptyApplyFields, memberSyncAvailable } from '../lib/mpSync/applyFormState'
import { buildApplicantFromRows, validateApplyRows } from '../lib/mpSync/applyTemplateRuntime'
import type { ApplyRow } from '../lib/mpSync/applyFormTemplates'
import { labels, normalizePlatform } from '../lib/mpSync/platformLabels'
import { DOUYIN_LEVELS } from '../lib/mpSync/platformForm'
import { readMember, writeMember } from '../lib/mpSync/talentMember'

export default function RecruitmentApplyPage() {
  const { id: mpOrderId } = useParams()
  const [search] = useSearchParams()
  const nav = useNavigate()
  if (getActiveRole() !== 'talent') return <Navigate to="/hall" replace />
  if (!mpOrderId) return <Navigate to="/hall" replace />
  const orderId = mpOrderId

  const platform = normalizePlatform(search.get('platform') || '抖音')
  const merchantOrderNo = search.get('merchantOrderNo') || mpOrderId
  const isIceMode = search.get('ice') === '1'
  const templateId = search.get('templateId') || ''

  const tpl = useMemo(() => getApplyConfigForMpOrder(orderId, templateId), [orderId, templateId])
  const rows = useMemo(() => resolveApplyRows(tpl, platform, { isIceMode }), [tpl, platform, isIceMode])

  const [form, setForm] = useState(() => ({
    ...emptyApplyFields(),
    ...(applyFieldsFromMember(readMember(), platform) || {}),
  }))
  const [syncMember, setSyncMember] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')
  const member = readMember()
  const lb = labels(platform)

  function setField(key: string, value: string) {
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
    const errMsg = validateApplyRows(rows, form as unknown as Record<string, unknown>, platform, { isIceMode })
    if (errMsg) {
      setErr(errMsg)
      return
    }
    setSubmitting(true)
    setErr('')
    try {
      const applicantId = `app-${Date.now()}`
      const applicant = buildApplicantFromRows(rows, form as unknown as Record<string, unknown>, {
        platform,
        isIceMode,
        mpOrderId: orderId,
        merchantOrderNo,
        applicantId,
        appliedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      })
      await applyToMpOrder(orderId, applicant)
      if (member && syncMember) {
        try {
          await registerTalentMember(member as unknown as Record<string, unknown>)
        } catch {
          /* ignore */
        }
      }
      addApplication({ mpOrderId: orderId, applicantId, title: merchantOrderNo, platform })
      if (isIceMode) localStorage.setItem(`meoo_ice_applicant_v1_${orderId}`, applicantId)
      nav(`/recruitment/${encodeURIComponent(orderId)}?applied=1`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '报名失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Link to={`/recruitment/${encodeURIComponent(orderId)}`} className="text-sm text-slate-400 hover:text-white">
        ← 返回详情
      </Link>
      <h2 className="text-xl font-bold">报名 · {tpl.name}</h2>
      <p className="text-sm text-slate-400">{platform} · {merchantOrderNo}</p>

      {memberSyncAvailable(member, platform) ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={syncMember}
            onChange={(e) => {
              const on = e.target.checked
              setSyncMember(on)
              if (on) {
                const fields = applyFieldsFromMember(member, platform)
                if (fields) setForm((f) => ({ ...f, ...fields }))
              }
            }}
          />
          同步「我的信息」到本单
        </label>
      ) : (
        <p className="text-sm text-amber-500">
          <Link to="/profile/talent" className="underline">
            完善我的信息
          </Link>
          后可一键填入
        </p>
      )}

      <section className="rounded-xl border border-white/10 bg-[#1a1a28] p-4 space-y-3 text-sm">
        {rows.map((row) => (
          <ApplyFieldInput key={row.id} row={row} value={fieldValue(row)} lb={lb} form={form} onChange={setField} />
        ))}
      </section>

      {err ? <p className="text-red-400 text-sm">{err}</p> : null}
      <button
        type="button"
        disabled={submitting}
        className="w-full py-3 rounded-xl bg-violet-600 font-medium disabled:opacity-50"
        onClick={() => void onSubmit()}
      >
        {submitting ? '提交中…' : isIceMode ? '认领任务' : '提交报名'}
      </button>
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
          className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
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
          className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
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
          className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
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
        className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
        type={row.type === 'number' || row.type === 'digit' ? 'number' : 'text'}
        placeholder={row.placeholder || (row.role === 'platformAccount' ? `请输入${lb.accountId}` : '')}
        value={value}
        onChange={(e) => onChange(row.bindKey, e.target.value)}
      />
    </label>
  )
}
