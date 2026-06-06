import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { getActiveRole } from '../lib/mpSession'
import {
  deleteCustomTemplate,
  listCustomTemplates,
  setActiveTemplateId,
  TEMPLATE_KINDS,
  type TemplateKind,
} from '../lib/mpSync/applyFormTemplates'

export default function TemplatesPage() {
  if (getActiveRole() !== 'pr') return <Navigate to="/hall" replace />

  const [kind, setKind] = useState<TemplateKind>('talent')
  const [rows, setRows] = useState(() => listCustomTemplates())
  const activeId = (() => {
    try {
      const key =
        kind === 'shoot'
          ? 'meoo_active_shoot_apply_template_v1'
          : kind === 'edit'
            ? 'meoo_active_edit_apply_template_v1'
            : 'meoo_active_apply_template_v1'
      return localStorage.getItem(key) || ''
    } catch {
      return ''
    }
  })()

  const filtered = useMemo(() => listCustomTemplates(kind), [rows, kind])

  function refresh() {
    setRows(listCustomTemplates())
  }

  const kindHint =
    kind === 'talent'
      ? '达人招募报名项模版'
      : kind === 'shoot'
        ? '拍摄团队报名项模版'
        : '剪辑团队报名项模版'

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex justify-between items-center gap-3">
        <h2 className="text-xl font-bold">我的模版</h2>
        <Link
          to={`/templates/edit?kind=${kind}`}
          className="text-sm px-3 py-1.5 rounded-lg bg-violet-600 text-white hover-panel hover:bg-violet-500 transition-colors"
        >
          新增模版
        </Link>
      </div>
      <p className="text-sm text-[var(--shell-muted)]">
        管理达人 / 拍摄 / 剪辑报名单模版，发招募时将按招募对象自动匹配。
      </p>

      <div className="flex flex-wrap gap-2">
        {TEMPLATE_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            className={`panel-tab px-4 py-2 rounded-lg text-sm ${kind === k.id ? 'panel-tab-active' : ''}`}
            onClick={() => setKind(k.id)}
          >
            {k.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-[var(--shell-muted)]">{kindHint}</p>

      {!filtered.length ? (
        <p className="text-slate-500">暂无{kind === 'talent' ? '达人' : kind === 'shoot' ? '拍摄' : '剪辑'}模版，点击「新增模版」创建。</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <article
              key={t.id}
              className="surface-card rounded-xl border p-4 flex justify-between gap-3 items-start hover-panel"
            >
              <div>
                <h3 className="font-medium">{t.name}</h3>
                <p className="text-xs text-slate-500 mt-1">{t.fields.length} 个报名项</p>
                {activeId === t.id ? (
                  <span className="text-xs text-emerald-400 mt-1 inline-block">当前默认</span>
                ) : null}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <Link
                  to={`/templates/edit?id=${encodeURIComponent(t.id)}&kind=${kind}`}
                  className="text-xs text-violet-400 hover:text-violet-300"
                >
                  编辑
                </Link>
                <button
                  type="button"
                  className="text-xs text-slate-400 hover:text-slate-200 text-left"
                  onClick={() => {
                    setActiveTemplateId(t.id, kind)
                    refresh()
                  }}
                >
                  设为当前
                </button>
                <button
                  type="button"
                  className="text-xs text-red-400 hover:text-red-300 text-left"
                  onClick={() => {
                    if (confirm('确定删除该模版？')) {
                      deleteCustomTemplate(t.id)
                      refresh()
                    }
                  }}
                >
                  删除
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
