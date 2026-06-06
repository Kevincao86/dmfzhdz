import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { getActiveRole } from '../lib/mpSession'
import {
  buildEditorRows,
  emptyCustomField,
  emptyCustomTemplate,
  getTemplateById,
  normalizeTemplateKind,
  PLATFORMS,
  saveCustomTemplate,
  TEMPLATE_KINDS,
  validateTemplateFields,
  type ApplyField,
  type TemplateKind,
} from '../lib/mpSync/applyFormTemplates'

export default function TemplateEditPage() {
  if (getActiveRole() !== 'pr') return <Navigate to="/hall" replace />
  const [search] = useSearchParams()
  const nav = useNavigate()
  const editId = search.get('id') || ''
  const kind = normalizeTemplateKind(search.get('kind'))

  const initial = useMemo(() => {
    if (editId) {
      const t = getTemplateById(editId)
      if (!t) return null
      return {
        id: t.id,
        name: t.name,
        kind: normalizeTemplateKind(t.kind),
        fields: t.fields.map((f) => ({ ...f })),
      }
    }
    const t = emptyCustomTemplate(
      kind === 'shoot' ? '拍摄报名模版' : kind === 'edit' ? '剪辑报名模版' : '我的报名模版',
      kind,
    )
    return { id: t.id, name: t.name, kind, fields: t.fields }
  }, [editId, kind])

  const [name, setName] = useState(initial?.name || '')
  const [fields, setFields] = useState<ApplyField[]>(initial?.fields || [])
  const [previewPlatform, setPreviewPlatform] = useState('小红书')
  const [err, setErr] = useState('')

  if (!initial) return <Navigate to="/templates" replace />

  const templateKind = initial.kind
  const editorRows = buildEditorRows(fields, previewPlatform, templateKind)
  const kindLabel = TEMPLATE_KINDS.find((k) => k.id === templateKind)?.label || '达人'

  function onSave() {
    const vErr = validateTemplateFields(fields, templateKind)
    if (vErr) {
      setErr(vErr)
      return
    }
    if (!String(name || '').trim()) {
      setErr('请填写模版名称')
      return
    }
    saveCustomTemplate({ id: initial!.id, name: name.trim(), kind: templateKind, fields })
    nav(`/templates`)
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Link to="/templates" className="text-sm text-slate-400 hover:text-violet-300">
        ← 返回模版列表
      </Link>
      <h2 className="text-xl font-bold">{editId ? '编辑模版' : '新增模版'}</h2>
      <p className="text-sm text-[var(--shell-muted)]">类型：{kindLabel}报名项</p>
      <label className="block text-sm">
        <span className="text-slate-400">模版名称</span>
        <input
          className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {templateKind === 'talent' ? (
        <label className="block text-sm">
          <span className="text-slate-400">预览平台</span>
          <select
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={previewPlatform}
            onChange={(e) => setPreviewPlatform(e.target.value)}
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <ul className="surface-card rounded-xl border divide-y divide-white/5 text-sm">
        {editorRows.map((row) => (
          <li key={row.id} className="px-4 py-3 flex justify-between items-center gap-2">
            <span>
              {row.displayLabel}
              {row.required ? ' *' : ''}
              {row.locked ? <span className="text-xs text-slate-500 ml-1">内置</span> : null}
            </span>
            <label className="flex items-center gap-1 text-xs text-slate-400">
              必填
              <input
                type="checkbox"
                checked={!!row.required}
                disabled={row.locked}
                onChange={(e) => {
                  setFields((list) =>
                    list.map((f) => (f.id === row.id ? { ...f, required: e.target.checked } : f)),
                  )
                }}
              />
            </label>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="text-sm text-violet-400 hover:text-violet-300"
        onClick={() => setFields((list) => [...list, emptyCustomField('text')])}
      >
        + 添加自定义项
      </button>
      {err ? <p className="text-red-400 text-sm">{err}</p> : null}
      <button
        type="button"
        className="w-full py-3 rounded-xl bg-violet-600 font-medium hover:bg-violet-500 transition-colors"
        onClick={onSave}
      >
        保存模版
      </button>
    </div>
  )
}
