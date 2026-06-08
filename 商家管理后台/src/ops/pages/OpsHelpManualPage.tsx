import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchRegistry } from '../opsRegistryApi'
import {
  saveHelpManualEdition,
  type HelpManualEdition,
  type RegistryHelpManualArticle,
  type RegistryHelpManualCategory,
} from '../opsHelpManualApi'

const EDITION_TABS: { id: HelpManualEdition; label: string }[] = [
  { id: 'merchant', label: '商家版' },
  { id: 'partner', label: '服务商版' },
  { id: 'fulfillment', label: '履约平台' },
]

function nowStr() {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

type Props = { edition?: HelpManualEdition }

export default function OpsHelpManualPage({ edition = 'merchant' }: Props) {
  const [categories, setCategories] = useState<RegistryHelpManualCategory[]>([])
  const [articles, setArticles] = useState<RegistryHelpManualArticle[]>([])
  const [activeCat, setActiveCat] = useState('')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null)
  const [newCatTitle, setNewCatTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetchRegistry()
      const cats = (r.helpManualCategories ?? []).filter((c) => c.edition === edition)
      const arts = (r.helpManualArticles ?? []).filter((a) => a.edition === edition)
      setCategories(cats.sort((a, b) => a.sortOrder - b.sortOrder))
      setArticles(arts.sort((a, b) => a.sortOrder - b.sortOrder))
      setActiveCat((cur) => cur || cats[0]?.id || '')
    } catch {
      setCategories([])
      setArticles([])
    }
  }, [edition])

  useEffect(() => {
    setActiveCat('')
    setEditingArticleId(null)
    void load()
  }, [edition, load])

  const filteredArticles = useMemo(
    () => articles.filter((a) => !activeCat || a.categoryId === activeCat),
    [articles, activeCat],
  )

  async function persist(nextCats: RegistryHelpManualCategory[], nextArts: RegistryHelpManualArticle[]) {
    setSaving(true)
    setMsg('')
    try {
      const r = await saveHelpManualEdition({ edition, categories: nextCats, articles: nextArts })
      if (!r.ok) {
        setMsg(r.error ?? '保存失败')
        return
      }
      setCategories(nextCats)
      setArticles(nextArts)
      setMsg('已保存，各版本前端刷新帮助手册即可看到更新')
    } finally {
      setSaving(false)
    }
  }

  function addCategory() {
    const title = newCatTitle.trim()
    if (!title) return
    const id = `HMC-${edition}-${Date.now()}`
    const next = [...categories, { id, edition, title, sortOrder: categories.length }]
    setNewCatTitle('')
    void persist(next, articles)
    setActiveCat(id)
  }

  function deleteCategory(id: string) {
    if (!window.confirm('删除分类将同时移除其下文章，确定？')) return
    const nextCats = categories.filter((c) => c.id !== id)
    const nextArts = articles.filter((a) => a.categoryId !== id)
    void persist(nextCats, nextArts)
  }

  function saveArticle() {
    const title = draftTitle.trim()
    const body = draftBody.trim()
    if (!title || !body || !activeCat) {
      window.alert('请选择分类并填写标题与正文')
      return
    }
    const now = nowStr()
    let nextArts: RegistryHelpManualArticle[]
    if (editingArticleId) {
      nextArts = articles.map((a) =>
        a.id === editingArticleId ? { ...a, title, body, categoryId: activeCat, updatedAt: now } : a,
      )
    } else {
      nextArts = [
        ...articles,
        {
          id: `HMA-${edition}-${Date.now()}`,
          edition,
          categoryId: activeCat,
          title,
          body,
          sortOrder: articles.length,
          updatedAt: now,
        },
      ]
    }
    void persist(categories, nextArts)
    setDraftTitle('')
    setDraftBody('')
    setEditingArticleId(null)
  }

  function editArticle(a: RegistryHelpManualArticle) {
    setEditingArticleId(a.id)
    setDraftTitle(a.title)
    setDraftBody(a.body)
    setActiveCat(a.categoryId)
  }

  function deleteArticle(id: string) {
    if (!window.confirm('确定删除该文章？')) return
    void persist(
      categories,
      articles.filter((a) => a.id !== id),
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">帮助手册管理</h1>
        <p className="mt-1 text-sm text-slate-500">内容同步至各版本登录页「帮助手册」，左侧分类 + 右侧文章列表。</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {EDITION_TABS.map((t) => (
          <a
            key={t.id}
            href={`/help-manual${t.id === 'merchant' ? '' : `/${t.id}`}`}
            className={`rounded-lg px-4 py-2 text-sm ${
              edition === t.id ? 'bg-indigo-600 text-white' : 'border border-slate-700 text-slate-300'
            }`}
          >
            {t.label}
          </a>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="rounded-xl border border-slate-800 bg-slate-900 p-3">
          <p className="px-2 text-xs font-semibold text-slate-500">分类</p>
          <ul className="mt-2 space-y-1">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveCat(c.id)}
                  className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left text-sm ${
                    activeCat === c.id ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {c.title}
                </button>
                <button type="button" className="text-xs text-rose-400" onClick={() => deleteCategory(c.id)}>
                  删
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-1">
            <input
              value={newCatTitle}
              onChange={(e) => setNewCatTitle(e.target.value)}
              placeholder="新分类名"
              className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
            />
            <button type="button" onClick={addCategory} className="rounded bg-slate-700 px-2 py-1 text-xs text-white">
              加
            </button>
          </div>
        </aside>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-300">{editingArticleId ? '编辑文章' : '新增文章'}</h3>
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="文章标题"
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
            />
            <textarea
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              placeholder="正文（支持换行）"
              rows={6}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={saveArticle}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {saving ? '保存中…' : '保存文章'}
              </button>
              {editingArticleId ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingArticleId(null)
                    setDraftTitle('')
                    setDraftBody('')
                  }}
                  className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300"
                >
                  取消编辑
                </button>
              ) : null}
            </div>
          </div>

          <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900">
            {filteredArticles.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="text-sm text-slate-200">{a.title}</div>
                  <div className="text-xs text-slate-500">{a.updatedAt}</div>
                </div>
                <div className="flex shrink-0 gap-2 text-xs">
                  <button type="button" className="text-indigo-400" onClick={() => editArticle(a)}>
                    编辑
                  </button>
                  <button type="button" className="text-rose-400" onClick={() => deleteArticle(a.id)}>
                    删除
                  </button>
                </div>
              </li>
            ))}
            {!filteredArticles.length ? (
              <li className="px-4 py-8 text-center text-sm text-slate-500">暂无文章</li>
            ) : null}
          </ul>
          {msg ? <p className="text-sm text-emerald-400">{msg}</p> : null}
        </div>
      </div>
    </div>
  )
}
