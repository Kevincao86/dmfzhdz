import { useState } from 'react'
import { batchPatchLibraryFeatures } from './opsRegistryApi'

type FeatureField = 'addons' | 'recommendHall'

const FIELD_LABEL: Record<FeatureField, string> = {
  addons: '增值服务',
  recommendHall: '推荐大厅',
}

export default function OpsLibraryBatchFeatures({
  kind,
  checkedIds,
  disabled,
  onDone,
}: {
  kind: 'talent' | 'pr'
  checkedIds: string[]
  disabled?: boolean
  onDone: () => void | Promise<void>
}) {
  const [busy, setBusy] = useState(false)

  if (!checkedIds.length) return null

  async function apply(field: FeatureField, value: boolean) {
    if (busy || disabled) return
    const label = FIELD_LABEL[field]
    const action = value ? '开通' : '关闭'
    if (!window.confirm(`确定对选中的 ${checkedIds.length} 条记录批量${action}${label}？`)) return
    setBusy(true)
    try {
      const r = await batchPatchLibraryFeatures({
        kind,
        rows: checkedIds.map((id) => ({ id, [field]: value })),
      })
      if (!r.ok) {
        window.alert(r.error ?? '批量保存失败')
        return
      }
      await onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-500">批量开通：</span>
      <button
        type="button"
        disabled={busy || disabled}
        onClick={() => void apply('addons', true)}
        className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-2.5 py-1.5 text-xs text-emerald-300 hover:bg-emerald-950 disabled:opacity-50"
      >
        {busy ? '处理中…' : '增值服务'}
      </button>
      <button
        type="button"
        disabled={busy || disabled}
        onClick={() => void apply('recommendHall', true)}
        className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-2.5 py-1.5 text-xs text-emerald-300 hover:bg-emerald-950 disabled:opacity-50"
      >
        {busy ? '处理中…' : '推荐大厅'}
      </button>
      <span className="text-xs text-slate-600">|</span>
      <button
        type="button"
        disabled={busy || disabled}
        onClick={() => void apply('addons', false)}
        className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-800 disabled:opacity-50"
      >
        关闭增值服务
      </button>
      <button
        type="button"
        disabled={busy || disabled}
        onClick={() => void apply('recommendHall', false)}
        className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-800 disabled:opacity-50"
      >
        关闭推荐大厅
      </button>
    </div>
  )
}
