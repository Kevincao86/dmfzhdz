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
import { EmptyState, StatusTabBar, TemplateGridCard } from '../components/ui/MockupLayouts'

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
    <div className="page-content-shell page-content-shell--wide space-y-4">
      <PageHero title="我的模版" subtitle="保存常用报名字段，发招募时一键复用。" badge={kindHint}>
        <Link to={`/templates/edit?kind=${kind}`} className="btn-mockup btn-mockup--primary">
          新建模版
        </Link>
      </PageHero>

      <StatusTabBar
        active={kind}
        onChange={(id) => setKind(id as TemplateKind)}
        tabs={TEMPLATE_KINDS.map((k) => ({ id: k.id, label: k.label }))}
      />

      {!filtered.length ? (
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
              meta={`${t.fields.length} 个报名项${activeId === t.id ? ' · 当前默认' : ''}`}
              onUse={() => {
                setActiveTemplateId(t.id, kind)
                refresh()
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
