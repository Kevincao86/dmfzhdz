import { Loader2, Percent, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type {
  DistributionCommissionOverride,
  DistributionProductLineRates,
} from '../../lib/distributionRegistryTypes'
import {
  formatRatePct,
  sanitizePartnerSalespersonCommissionOverride,
} from '../../lib/distributionCommissionDisplay'

function rateInput(
  label: string,
  value: number | undefined,
  onChange: (v: number | undefined) => void,
  hint?: string,
) {
  return (
    <label className="block text-xs text-slate-600">
      {label}
      <input
        type="number"
        min={0}
        max={100}
        step={0.1}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
        value={value != null ? Math.round(value * 1000) / 10 : ''}
        onChange={(e) => {
          const n = Number(e.target.value)
          onChange(Number.isFinite(n) ? Math.min(100, Math.max(0, n)) / 100 : undefined)
        }}
        placeholder="留空沿用默认"
      />
      {hint ? <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">{hint}</span> : null}
    </label>
  )
}

function rateReadOnly(label: string, value: number | undefined, hint?: string) {
  return (
    <div className="block text-xs text-slate-600">
      {label}
      <div className="mt-1 w-full rounded-lg border border-slate-100 bg-slate-100/80 px-3 py-2 text-sm text-slate-700">
        {formatRatePct(value)}
      </div>
      {hint ? <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">{hint}</span> : null}
    </div>
  )
}

function editableRatesOnly(rates?: DistributionProductLineRates): DistributionProductLineRates {
  if (!rates) return {}
  const { partnerShareOfPool, salespersonShareOfPool } = rates
  return {
    ...(partnerShareOfPool != null ? { partnerShareOfPool } : {}),
    ...(salespersonShareOfPool != null ? { salespersonShareOfPool } : {}),
  }
}

type Props = {
  open: boolean
  title: string
  initial: DistributionCommissionOverride | null
  defaultErp: DistributionProductLineRates
  defaultXingxuan: DistributionProductLineRates
  onClose: () => void
  onSave: (value: DistributionCommissionOverride | null) => Promise<void>
}

export default function PartnerSalespersonCommissionModal({
  open,
  title,
  initial,
  defaultErp,
  defaultXingxuan,
  onClose,
  onSave,
}: Props) {
  const [erp, setErp] = useState<DistributionProductLineRates>({})
  const [xingxuan, setXingxuan] = useState<DistributionProductLineRates>({})
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setErp(editableRatesOnly(initial?.erp))
    setXingxuan(editableRatesOnly(initial?.xingxuan))
    setNote(initial?.note ?? '')
  }, [open, initial])

  if (!open) return null

  const erpPool = defaultErp.partnerPoolRate ?? 0
  const erpSales = erp.salespersonShareOfPool ?? defaultErp.salespersonShareOfPool ?? 0
  const xxPool = defaultXingxuan.partnerPoolRate ?? 0
  const xxSales = xingxuan.salespersonShareOfPool ?? defaultXingxuan.salespersonShareOfPool ?? 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Percent className="h-5 w-5 text-violet-600" />
              {title}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              分润池占实收由平台在商家管理后台统一配置，此处仅可调整池内服务商与分销员占比。留空沿用默认；「恢复默认」清除个体覆盖。
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2.5 text-xs text-violet-950">
          当前默认：ERP 分销员占池 {formatRatePct(defaultErp.salespersonShareOfPool)}（折合实收{' '}
          {formatRatePct((defaultErp.partnerPoolRate ?? 0) * (defaultErp.salespersonShareOfPool ?? 0))}）· 星选{' '}
          {formatRatePct(defaultXingxuan.salespersonShareOfPool)}（折合实收{' '}
          {formatRatePct((defaultXingxuan.partnerPoolRate ?? 0) * (defaultXingxuan.salespersonShareOfPool ?? 0))}）
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
            <p className="mb-3 text-sm font-semibold text-slate-800">ERP 商家（cs）</p>
            <div className="space-y-3">
              {rateReadOnly('分润池占实收', defaultErp.partnerPoolRate, '由平台统一配置，不可修改')}
              {rateInput('服务商占池', erp.partnerShareOfPool, (v) => setErp((p) => ({ ...p, partnerShareOfPool: v })), '占分润池')}
              {rateInput('分销员占池', erp.salespersonShareOfPool, (v) => setErp((p) => ({ ...p, salespersonShareOfPool: v })), '占分润池')}
            </div>
            <p className="mt-2 text-[11px] text-emerald-700">
              预览折合实收：分销员 {formatRatePct(erpPool * erpSales)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
            <p className="mb-3 text-sm font-semibold text-slate-800">星选（dr/小程序）</p>
            <div className="space-y-3">
              {rateReadOnly('分润池占实收', defaultXingxuan.partnerPoolRate, '由平台统一配置，不可修改')}
              {rateInput('服务商占池', xingxuan.partnerShareOfPool, (v) => setXingxuan((p) => ({ ...p, partnerShareOfPool: v })), '占分润池')}
              {rateInput('分销员占池', xingxuan.salespersonShareOfPool, (v) => setXingxuan((p) => ({ ...p, salespersonShareOfPool: v })), '占分润池')}
            </div>
            <p className="mt-2 text-[11px] text-emerald-700">
              预览折合实收：分销员 {formatRatePct(xxPool * xxSales)}
            </p>
          </div>
        </div>

        <label className="mt-4 block text-xs text-slate-600">
          备注（选填）
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="如：Q2 激励方案"
            maxLength={120}
          />
        </label>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-60"
            onClick={() => {
              void (async () => {
                setSaving(true)
                try {
                  const payload = sanitizePartnerSalespersonCommissionOverride({
                    erp,
                    xingxuan,
                    note: note.trim() || undefined,
                  })
                  await onSave(payload)
                  onClose()
                } finally {
                  setSaving(false)
                }
              })()
            }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            保存
          </button>
          <button
            type="button"
            disabled={saving}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => {
              void (async () => {
                setSaving(true)
                try {
                  await onSave(null)
                  onClose()
                } finally {
                  setSaving(false)
                }
              })()
            }}
          >
            恢复默认
          </button>
          <button type="button" className="rounded-lg px-4 py-2 text-sm text-slate-500" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
