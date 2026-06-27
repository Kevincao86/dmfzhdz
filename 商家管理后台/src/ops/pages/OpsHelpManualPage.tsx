import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  categoryIdsToDelete,
  childCategories,
  firstSelectableCategoryId,
  hasChildCategories,
  topLevelCategories,
} from '../../meooRegistryShared/helpManualCategoryTree.js'
import { fetchRegistry } from '../opsRegistryApi'
import {
  fetchHelpManualDefaults,
  saveHelpManualEdition,
  type HelpManualEdition,
  type RegistryHelpManualArticle,
  type RegistryHelpManualCategory,
} from '../opsHelpManualApi'
import { HELP_MANUAL_SEED_VERSION } from '../../meooRegistryShared/helpManualSeedContent.ts'
import OpsRichContentEditor from '../components/OpsRichContentEditor'
import OpsPageHeader from '../OpsPageHeader'
import OpsSegmentTabs from '../OpsSegmentTabs'

const EDITION_TABS: { id: HelpManualEdition; label: string }[] = [
  { id: 'merchant', label: '商家版' },
  { id: 'partner', label: '服务商版' },
  { id: 'fulfillment', label: '履约版' },
  { id: 'mp', label: '小程序使用手册' },
]

function nowStr() {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

type Props = { edition?: HelpManualEdition }

const EDITION_IDS = new Set<HelpManualEdition>(['merchant', 'partner', 'fulfillment', 'mp'])

function parseEdition(raw: string | null): HelpManualEdition {
  if (raw && EDITION_IDS.has(raw as HelpManualEdition)) return raw as HelpManualEdition
  return 'merchant'
}

export default function OpsHelpManualPage({ edition: editionProp }: Props) {
  const [searchParams, setSearchParams] = useSearchParams()
  const edition = editionProp ?? parseEdition(searchParams.get('edition'))
  const [categories, setCategories] = useState<RegistryHelpManualCategory[]>([])
  const [articles, setArticles] = useState<RegistryHelpManualArticle[]>([])
  const [activeCat, setActiveCat] = useState('')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null)
  const [newCatTitle, setNewCatTitle] = useState('')
  const [newSubCatTitle, setNewSubCatTitle] = useState('')
  const [subCatParentId, setSubCatParentId] = useState('')
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')

  const topCats = useMemo(() => topLevelCategories(categories), [categories])

  const load = useCallback(async () => {
    try {
      const r = await fetchRegistry()
      const cats = (r.helpManualCategories ?? []).filter((c) => c.edition === edition)
      const arts = (r.helpManualArticles ?? []).filter((a) => a.edition === edition)
      const sortedCats = cats.sort((a, b) => a.sortOrder - b.sortOrder)
      setCategories(sortedCats)
      setArticles(arts.sort((a, b) => a.sortOrder - b.sortOrder))
      const firstId = firstSelectableCategoryId(sortedCats)
      setActiveCat((cur) => cur || firstId)
      const firstCat = sortedCats.find((c) => c.id === firstId)
      setSubCatParentId(firstCat?.parentId || firstCat?.id || topLevelCategories(sortedCats)[0]?.id || '')
    } catch {
      setCategories([])
      setArticles([])
    }
  }, [edition])

  useEffect(() => {
    setActiveCat('')
    setEditingArticleId(null)
    setSubCatParentId('')
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
      setMsg(
        edition === 'mp'
          ? '已保存，微信 / 抖音小程序使用手册下拉刷新即可看到更新'
          : '已保存，各版本前端刷新帮助手册即可看到更新',
      )
    } finally {
      setSaving(false)
    }
  }

  async function importDefaults() {
    const label = EDITION_TABS.find((t) => t.id === edition)?.label ?? edition
    if (
      !window.confirm(
        `将载入「${label}」内置使用手册与常见问题，覆盖当前版本已有分类与文章。确定继续？`,
      )
    ) {
      return
    }
    setImporting(true)
    setMsg('')
    try {
      const r = await fetchHelpManualDefaults(edition)
      if (!r.ok || !r.categories || !r.articles) {
        setMsg(r.error ?? '载入失败')
        return
      }
      await persist(r.categories, r.articles)
      setMsg(
        `已载入内置手册 v${r.version ?? HELP_MANUAL_SEED_VERSION}：${r.categories.length} 个分类、${r.articles.length} 篇文章。左侧应出现「PR 使用手册 / 达人使用手册 / 拍摄 / 剪辑」等二级菜单。`,
      )
    } finally {
      setImporting(false)
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
    setSubCatParentId(id)
  }

  function addSubCategory(parentId: string) {
    const title = newSubCatTitle.trim()
    if (!title || !parentId) return
    const parent = categories.find((c) => c.id === parentId && !c.parentId)
    if (!parent) {
      window.alert('请先选择一级分类')
      return
    }
    const siblings = childCategories(categories, parentId)
    const id = `HMC2-${edition}-${Date.now()}`
    const next = [
      ...categories,
      {
        id,
        edition,
        title,
        parentId,
        sortOrder: siblings.length,
      },
    ]
    setNewSubCatTitle('')
    void persist(next, articles)
    setActiveCat(id)
  }

  function deleteCategory(id: string) {
    if (!window.confirm('删除分类将同时移除其下二级分类与文章，确定？')) return
    const removeIds = new Set(categoryIdsToDelete(categories, id))
    const nextCats = categories.filter((c) => !removeIds.has(c.id))
    const nextArts = articles.filter((a) => !removeIds.has(a.categoryId))
    void persist(nextCats, nextArts)
    if (removeIds.has(activeCat)) {
      setActiveCat(firstSelectableCategoryId(nextCats))
    }
    if (removeIds.has(subCatParentId)) {
      setSubCatParentId(firstSelectableCategoryId(nextCats.filter((c) => !c.parentId)) || '')
    }
  }

  function selectCategory(id: string) {
    setActiveCat(id)
    const cat = categories.find((c) => c.id === id)
    if (cat && !cat.parentId) setSubCatParentId(cat.id)
    else if (cat?.parentId) setSubCatParentId(cat.parentId)
  }

  function saveArticle() {
    const title = draftTitle.trim()
    const body = draftBody.trim()
    if (!title || !body || !activeCat) {
      window.alert('请选择分类并填写标题与正文')
      return
    }
    const cat = categories.find((c) => c.id === activeCat)
    if (cat && !cat.parentId && hasChildCategories(categories, cat.id)) {
      window.alert('该一级分类下已有二级菜单，请将文章保存到具体二级分类')
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
    selectCategory(a.categoryId)
  }

  function deleteArticle(id: string) {
    if (!window.confirm('确定删除该文章？')) return
    void persist(
      categories,
      articles.filter((a) => a.id !== id),
    )
  }

  const subCatParent =
    subCatParentId || (categories.find((c) => c.id === activeCat && !c.parentId)?.id ?? topCats[0]?.id ?? '')

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <OpsPageHeader
        title="帮助手册"
        description={
          edition === 'mp'
            ? '内容同步至微信 / 抖音小程序「我的 → 使用手册」；支持 Markdown 图文。'
            : edition === 'fulfillment'
              ? '内容同步至履约 Web（dr）登录页「帮助手册」。'
              : '内容同步至各版本登录页「帮助手册」；一级分类下可增二级菜单。'
        }
        badge={EDITION_TABS.find((t) => t.id === edition)?.label}
      />

      <OpsSegmentTabs
        tabs={EDITION_TABS.map((t) => ({ id: t.id, label: t.label }))}
        activeId={edition}
        onChange={(id) => setSearchParams({ edition: id })}
        trailing={
          <>
            <button
              type="button"
              disabled={importing || saving}
              onClick={() => void importDefaults()}
              className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-300 disabled:opacity-50"
            >
              {importing ? '载入中…' : '载入默认手册'}
            </button>
            <span className="ops-muted text-xs">内置种子 v{HELP_MANUAL_SEED_VERSION}</span>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="ops-card p-3">
          <p className="px-2 text-xs font-semibold text-slate-500">分类</p>
          <ul className="mt-2 space-y-2">
            {topCats.map((top) => {
              const children = childCategories(categories, top.id)
              const topSelectable = children.length === 0
              return (
                <li key={top.id}>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        selectCategory(top.id)
                        if (children.length > 0 && children[0]) selectCategory(children[0].id)
                      }}
                      className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left text-sm ${
                        activeCat === top.id || children.some((c) => c.id === activeCat)
                          ? 'bg-indigo-600/20 text-indigo-300'
                          : 'text-slate-300 hover:bg-slate-800'
                      } ${!topSelectable ? 'font-medium' : ''}`}
                    >
                      {top.title}
                      {children.length > 0 ? (
                        <span className="ml-1 text-[10px] text-slate-500">({children.length})</span>
                      ) : null}
                    </button>
                    <button type="button" className="text-xs text-rose-400" onClick={() => deleteCategory(top.id)}>
                      删
                    </button>
                  </div>
                  {children.length > 0 ? (
                    <ul className="ml-3 mt-1 space-y-0.5 border-l border-slate-700 pl-2">
                      {children.map((child) => (
                        <li key={child.id} className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => selectCategory(child.id)}
                            className={`min-w-0 flex-1 rounded-lg px-2 py-1 text-left text-xs ${
                              activeCat === child.id
                                ? 'bg-indigo-600/30 text-indigo-200'
                                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                            }`}
                          >
                            {child.title}
                          </button>
                          <button
                            type="button"
                            className="text-[10px] text-rose-400"
                            onClick={() => deleteCategory(child.id)}
                          >
                            删
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>
          <div className="mt-3 space-y-2 border-t border-slate-800 pt-3">
            <div className="flex gap-1">
              <input
                value={newCatTitle}
                onChange={(e) => setNewCatTitle(e.target.value)}
                placeholder="新一级分类名"
                className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
              />
              <button type="button" onClick={addCategory} className="rounded bg-slate-700 px-2 py-1 text-xs text-white">
                加
              </button>
            </div>
            {subCatParent ? (
              <div className="flex gap-1">
                <input
                  value={newSubCatTitle}
                  onChange={(e) => setNewSubCatTitle(e.target.value)}
                  placeholder="新二级分类名"
                  className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                />
                <button
                  type="button"
                  onClick={() => addSubCategory(subCatParent)}
                  className="rounded bg-indigo-700 px-2 py-1 text-xs text-white"
                >
                  加
                </button>
              </div>
            ) : null}
            {subCatParent ? (
              <p className="text-[10px] text-slate-500">
                二级分类将挂在一级「{categories.find((c) => c.id === subCatParent)?.title ?? '…'}」下
              </p>
            ) : null}
          </div>
        </aside>

        <div className="space-y-4">
          <div className="ops-card p-4">
            <h3 className="text-sm font-medium text-slate-300">{editingArticleId ? '编辑文章' : '新增文章'}</h3>
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="文章标题"
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
            />
            <OpsRichContentEditor
              value={draftBody}
              onChange={setDraftBody}
              placeholder="正文支持换行、小标题、粗体与插图"
              minRows={10}
              variant="light"
              textareaClassName="mt-2 w-full min-h-[200px] rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              hintClassName="text-slate-500"
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

          <ul className="ops-card divide-y divide-[var(--ops-border)] overflow-hidden">
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
