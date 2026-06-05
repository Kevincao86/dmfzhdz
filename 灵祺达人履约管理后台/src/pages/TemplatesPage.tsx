import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { getActiveRole } from '../lib/mpSession'
import {
  deleteCustomTemplate,
  listCustomTemplates,
  setActiveTemplateId,
} from '../lib/mpSync/applyFormTemplates'

export default function TemplatesPage() {
  if (getActiveRole() !== 'pr') return <Navigate to="/hall" replace />

  const [rows, setRows] = useState(() => listCustomTemplates())
  const activeId = (() => {
    try {
      return localStorage.getItem('meoo_active_apply_template_v1') || ''
    } catch {
      return ''
    }
  })()

  function refresh() {
    setRows(listCustomTemplates())
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">我的模版</h2>
        <Link to="/templates/edit" className="text-sm px-3 py-1.5 rounded-lg bg-violet-600">
          新增模版
        </Link>
      </div>
      <p className="text-sm text-[var(--shell-muted)]">管理报名单模版，发招募与达人报名时将自动应用。</p>
      {!rows.length ? (
        <p className="text-slate-500">暂无自定义模版，点击「新增模版」创建。</p>
      ) : (
        <div className="space-y-3">
          {rows.map((t) => (
            <article key={t.id} className="surface-card rounded-xl border p-4 flex justify-between gap-3 items-start">
              <div>
                <h3 className="font-medium">{t.name}</h3>
                <p className="text-xs text-slate-500 mt-1">{t.fields.length} 个报名项</p>
                {activeId === t.id ? (
                  <span className="text-xs text-emerald-400 mt-1 inline-block">当前默认</span>
                ) : null}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <Link to={`/templates/edit?id=${encodeURIComponent(t.id)}`} className="text-xs text-violet-400">
                  编辑
                </Link>
                <button
                  type="button"
                  className="text-xs text-slate-400"
                  onClick={() => {
                    setActiveTemplateId(t.id)
                    refresh()
                  }}
                >
                  设为当前
                </button>
                <button
                  type="button"
                  className="text-xs text-red-400"
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
