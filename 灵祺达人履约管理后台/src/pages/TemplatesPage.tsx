import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { getActiveRole } from '../lib/mpSession'
import {
  deleteCustomTemplate,
  getActiveTemplateId,
  listCustomTemplates,
  setActiveTemplateId,
  TEMPLATE_KINDS,
  type TemplateKind,
} from '../lib/mpSync/applyFormTemplates'
import PageHero from '../components/ui/PageHero'

export default function TemplatesPage() {
  if (getActiveRole() !== 'pr') return <Navigate to="/hall" replace />

  const [kind, setKind] = useState<TemplateKind>('talent')
  const [rows, setRows] = useState(() => listCustomTemplates())
  const activeId = getActiveTemplateId(kind)

  const filtered = useMemo(() => listCustomTemplates(kind), [rows, kind])

  function refresh() {
    setRows(listCustomTemplates())
  }

  useEffect(() => {
    void import('../lib/mpAccountClientSync')
      .then((m) => m.syncClientStateWithServer())
      .then(() => refresh())
      .catch(() => {})
  }, [])

  const kindHint =
    kind === 'talent'
      ? '达人招募报名项模版'
      : kind === 'shoot'
        ? '拍摄团队报名项模版'
        : '剪辑团队报名项模版'

  return (
    <div className="max-w-2xl space-y-4">
      <PageHero
        title="我的模版"
        subtitle="管理达人 / 拍摄 / 剪辑报名单模版，发招募时将按招募对象自动匹配。"
        badge={kindHint}
      >
        <Link
          to={`/templates/edit?kind=${kind}`}
          className="inline-flex px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500"
        >
          新增模版
        </Link>
      </PageHero>

      <div className="flex flex-wrap gap-2 p-1 rounded-xl panel-input border">
        {TEMPLATE_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            className={`flex-1 min-w-[5rem] panel-tab px-4 py-2 rounded-lg text-sm ${kind === k.id ? 'panel-tab-active' : ''}`}
            onClick={() => setKind(k.id)}
          >
            {k.label}
          </button>
        ))}
      </div>

      {!filtered.length ? (
        <div className="surface-card rounded-xl border p-8 text-center text-[var(--shell-muted)] text-sm">
          <p>暂无{kind === 'talent' ? '达人' : kind === 'shoot' ? '拍摄' : '剪辑'}模版</p>
          <p className="text-xs mt-2">点击「新增模版」创建报名项模版，发招募时自动套用</p>
        </div>
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
