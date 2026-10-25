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
import {
  deletePublishFormTemplate,
  getActivePublishFormTemplateId,
  listPublishFormTemplates,
  RECRUIT_TEMPLATE_FIELDS,
  savePublishFormTemplate,
  setActivePublishFormTemplateId,
  type PublishFormTemplate,
} from '../lib/mpSync/publishFormTemplates'
import PageHero from '../components/ui/PageHero'
import { EmptyState, StatusTabBar, TemplateGridCard } from '../components/ui/MockupLayouts'

export default function TemplatesPage() {
  if (getActiveRole() !== 'pr') return <Navigate to="/hall" replace />

  const [section, setSection] = useState<'apply' | 'recruit'>('apply')
  const [kind, setKind] = useState<TemplateKind>('talent')
  const [rows, setRows] = useState(() => listCustomTemplates())
  const [formTpls, setFormTpls] = useState(() => listPublishFormTemplates())
  const [editing, setEditing] = useState<PublishFormTemplate | null>(null)
  const [customDraft, setCustomDraft] = useState('')
  const [customFormat, setCustomFormat] = useState<'text' | 'image' | 'video'>('text')
  const [notice, setNotice] = useState('')
  const activeId = getActiveTemplateId(kind)
  const activeFormId = getActivePublishFormTemplateId()

  const filtered = useMemo(() => listCustomTemplates(kind), [rows, kind])

  function refresh() {
    setRows(listCustomTemplates())
    setFormTpls(listPublishFormTemplates())
  }

  useEffect(() => {
    void import('../lib/mpAccountClientSync')
      .then((m) => m.syncClientStateWithServer())
      .then(() => refresh())
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(timer)
  }, [notice])

  const kindHint =
    section === 'recruit'
      ? '商单招募模版'
      : kind === 'talent'
        ? '达人必填模版'
        : kind === 'shoot'
          ? '拍摄团队报名项'
          : '剪辑团队报名项'

  function openRecruitEdit(tpl: PublishFormTemplate) {
    setEditing({
      ...tpl,
      fieldOn: { ...tpl.fieldOn },
      customFields: tpl.customFields.map((row) => ({ ...row })),
    })
    setCustomDraft('')
    setCustomFormat('text')
  }

  function saveRecruitEdit() {
    if (!editing) return
    const name = editing.name.trim() || '我的发单模版'
    savePublishFormTemplate({ ...editing, name })
    setEditing(null)
    refresh()
  }

  return (
    <div className="page-content-shell page-content-shell--wide space-y-4">
      {notice ? (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 max-w-lg -translate-x-1/2 rounded-xl bg-[#ecfdf5] px-4 py-3 text-sm font-medium text-[#065f46] shadow-lg">
          {notice}
        </div>
      ) : null}
      <PageHero title="我的模版" subtitle="达人必填模版管报名项，商单招募模版管发单字段。" badge={kindHint}>
        {section === 'apply' ? (
          <Link to={`/templates/edit?kind=${kind}`} className="btn-mockup btn-mockup--primary">
            新建模版
          </Link>
        ) : null}
      </PageHero>

      <StatusTabBar
        active={section}
        onChange={(id) => {
          setSection(id as 'apply' | 'recruit')
          setEditing(null)
        }}
        tabs={[
          { id: 'apply', label: '达人必填模版' },
          { id: 'recruit', label: '商单招募模版' },
        ]}
      />

      {section === 'apply' ? (
      <StatusTabBar
        sub
        active={kind}
        onChange={(id) => setKind(id as TemplateKind)}
        tabs={TEMPLATE_KINDS.map((k) => ({ id: k.id, label: k.label }))}
      />
      ) : null}

      {section === 'recruit' ? (
        editing ? (
          <section className="space-y-3 rounded-xl border border-[var(--shell-border)] p-4">
            <label className="block text-sm">
              模版名称
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              {RECRUIT_TEMPLATE_FIELDS.map((field) => (
                <label key={field.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editing.fieldOn[field.key] === true}
                    onChange={(e) =>
                      setEditing({ ...editing, fieldOn: { ...editing.fieldOn, [field.key]: e.target.checked } })
                    }
                  />
                  {field.label}
                </label>
              ))}
            </div>
            <div className="space-y-2">
              {editing.customFields.map((row) => (
                <div key={row.id} className="flex items-center justify-between text-sm">
                  <span>{row.label} · {row.format === 'image' ? '图片' : row.format === 'video' ? '视频' : '文字'}</span>
                  <button
                    type="button"
                    className="text-xs text-slate-400"
                    onClick={() =>
                      setEditing({ ...editing, customFields: editing.customFields.filter((item) => item.id !== row.id) })
                    }
                  >
                    删除
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <select
                  className="rounded-lg border px-2 py-1.5 text-sm"
                  value={customFormat}
                  onChange={(e) => setCustomFormat(e.target.value as 'text' | 'image' | 'video')}
                >
                  <option value="text">文字</option>
                  <option value="image">图片</option>
                  <option value="video">视频</option>
                </select>
                <input
                  className="flex-1 rounded-lg border px-3 py-1.5 text-sm"
                  placeholder="新增字段名称"
                  value={customDraft}
                  onChange={(e) => setCustomDraft(e.target.value)}
                />
                <button
                  type="button"
                  className="text-sm font-medium text-[#6d28d9]"
                  onClick={() => {
                    const label = customDraft.trim()
                    if (!label) return
                    setEditing({
                      ...editing,
                      customFields: editing.customFields.concat({ id: `c-${Date.now()}`, label, format: customFormat }),
                    })
                    setCustomDraft('')
                  }}
                >
                  添加
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-mockup btn-mockup--primary" onClick={saveRecruitEdit}>
                保存修改
              </button>
              <button type="button" className="btn-mockup" onClick={() => setEditing(null)}>
                取消
              </button>
            </div>
          </section>
        ) : !formTpls.length ? (
          <EmptyState title="暂无商单招募模版" desc="在发布招募里勾选字段后，点「存入我的模版」" />
        ) : (
          <div className="template-grid">
            {formTpls.map((t) => (
              <TemplateGridCard
                key={t.id}
                title={t.name}
                meta={`${t.recruitTarget === 'shoot' ? '拍摄' : t.recruitTarget === 'edit' ? '剪辑' : '达人'} · ${t.recruitMode}${activeFormId === t.id ? ' · 使用中' : ''}`}
                onUse={() => {
                  setActivePublishFormTemplateId(t.id)
                  refresh()
                  setNotice(`已使用模版「${t.name}」。回到发布招募，点「添加字段」即可套用。`)
                }}
                onEdit={() => openRecruitEdit(t)}
                onDelete={() => {
                  if (!confirm(`确定删除模版「${t.name}」？`)) return
                  deletePublishFormTemplate(t.id)
                  refresh()
                }}
              />
            ))}
          </div>
        )
      ) : !filtered.length ? (
        <EmptyState
          title={`暂无${kind === 'talent' ? '达人' : kind === 'shoot' ? '拍摄' : '剪辑'}模版`}
          desc="点击「新建模版」创建报名项模版，发招募时自动套用"
          action={
            <Link to={`/templates/edit?kind=${kind}`} className="btn-mockup btn-mockup--primary">
              新建模版
            </Link>
          }
        />
      ) : (
        <div className="template-grid">
          {filtered.map((t) => (
            <TemplateGridCard
              key={t.id}
              title={t.name}
              meta={`${t.fields.length} 个报名项${activeId === t.id ? ' · 使用中' : ''}`}
              onUse={() => {
                setActiveTemplateId(t.id, kind)
                refresh()
                setNotice(`已使用模版「${t.name}」。发招募时会套用这份报名项。`)
              }}
              onEdit={() => {
                window.location.href = `/templates/edit?id=${encodeURIComponent(t.id)}&kind=${kind}`
              }}
              onDelete={() => {
                if (!confirm(`确定删除模版「${t.name}」？`)) return
                deleteCustomTemplate(t.id)
                refresh()
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
