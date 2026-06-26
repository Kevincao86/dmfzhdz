import { useEffect, useState } from 'react'
import { xingxuanEnhanceApi } from '../lib/mpSync/xingxuanEnhanceApi'

type BriefTpl = {
  id: string
  title: string
  brief?: { notes?: string; deliverables?: string[]; forbidden?: string[] }
  bodyMarkdown?: string
}

const emptyForm = () => ({
  title: '',
  notes: '',
  deliverablesText: '',
  forbiddenText: '',
  bodyMarkdown: '',
})

export default function XingxuanBriefTemplatesPage() {
  const [templates, setTemplates] = useState<BriefTpl[]>([])
  const [editing, setEditing] = useState(false)
  const [editId, setEditId] = useState('')
  const [form, setForm] = useState(emptyForm())
  const [err, setErr] = useState('')

  async function load() {
    const res = (await xingxuanEnhanceApi.getBriefTemplates()) as { templates?: BriefTpl[] }
    setTemplates(res.templates || [])
  }

  useEffect(() => {
    void load().catch((e) => setErr(e instanceof Error ? e.message : String(e)))
  }, [])

  function openEdit(t?: BriefTpl) {
    if (t) {
      setEditId(t.id)
      setForm({
        title: t.title,
        notes: t.brief?.notes || '',
        deliverablesText: (t.brief?.deliverables || []).join(','),
        forbiddenText: (t.brief?.forbidden || []).join(','),
        bodyMarkdown: t.bodyMarkdown || '',
      })
    } else {
      setEditId('')
      setForm(emptyForm())
    }
    setEditing(true)
  }

  async function save() {
    if (!form.title.trim()) {
      setErr('请填写模版标题')
      return
    }
    setErr('')
    await xingxuanEnhanceApi.upsertBriefTemplate({
      id: editId || `bt_${Date.now()}`,
      title: form.title.trim(),
      brief: {
        notes: form.notes.trim(),
        deliverables: form.deliverablesText.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
        forbidden: form.forbiddenText.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
      },
      bodyMarkdown: form.bodyMarkdown.trim(),
    })
    setEditing(false)
    await load()
  }

  return (
    <div className="page-content-shell page-content-shell--narrow space-y-4">
      <header className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-xl font-bold">Brief 模版</h1>
          <p className="text-sm text-[var(--shell-muted)] mt-1">发单时一键套用结构化 Brief</p>
        </div>
        <button type="button" className="rounded-full bg-sky-600 text-white px-3 py-1.5 text-sm" onClick={() => openEdit()}>
          新建
        </button>
      </header>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {!templates.length ? <p className="text-sm text-[var(--shell-muted)]">暂无模版</p> : null}
      {templates.map((t) => (
        <div key={t.id} className="surface-card rounded-xl border p-4 space-y-2">
          <p className="font-medium">{t.title}</p>
          <p className="text-sm line-clamp-2">{t.brief?.notes || t.bodyMarkdown || '—'}</p>
          <div className="flex gap-3 text-xs">
            <button type="button" className="text-sky-700" onClick={() => openEdit(t)}>编辑</button>
            <button
              type="button"
              className="text-red-700"
              onClick={() => {
                if (!window.confirm('确定删除？')) return
                void xingxuanEnhanceApi.removeBriefTemplate(t.id).then(() => load())
              }}
            >
              删除
            </button>
          </div>
        </div>
      ))}
      {editing ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-4 w-full max-w-md max-h-[80vh] overflow-y-auto space-y-3">
            <p className="font-medium">{editId ? '编辑模版' : '新建模版'}</p>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="模版标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm min-h-[72px]" placeholder="Brief 说明/要点" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="交付物，逗号分隔" value={form.deliverablesText} onChange={(e) => setForm({ ...form, deliverablesText: e.target.value })} />
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="禁忌/合规，逗号分隔" value={form.forbiddenText} onChange={(e) => setForm({ ...form, forbiddenText: e.target.value })} />
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm min-h-[72px]" placeholder="Markdown 正文（可选）" value={form.bodyMarkdown} onChange={(e) => setForm({ ...form, bodyMarkdown: e.target.value })} />
            <div className="flex justify-end gap-2">
              <button type="button" className="text-sm px-3 py-1.5" onClick={() => setEditing(false)}>取消</button>
              <button type="button" className="text-sm bg-sky-600 text-white rounded-full px-4 py-1.5" onClick={() => void save()}>保存</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
