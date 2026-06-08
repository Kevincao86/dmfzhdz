import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import LoginPortalNav from '../components/login/LoginPortalNav'
import { fetchHelpManualPublic } from '../lib/helpManualApi'
import {
  childCategories,
  firstSelectableCategoryId,
  topLevelCategories,
} from '../lib/helpManualCategoryTree'
import type { HelpManualEdition, RegistryHelpManualArticle, RegistryHelpManualCategory } from '../lib/helpManualTypes'
import { productNameForEdition } from '../lib/legalProductMeta'

type Props = { edition: HelpManualEdition }

export default function HelpManualPage({ edition }: Props) {
  const { articleId } = useParams()
  const [categories, setCategories] = useState<RegistryHelpManualCategory[]>([])
  const [articles, setArticles] = useState<RegistryHelpManualArticle[]>([])
  const [activeCat, setActiveCat] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    void fetchHelpManualPublic(edition)
      .then((r) => {
        setCategories(r.categories)
        setArticles(r.articles)
        setActiveCat((cur) => cur || firstSelectableCategoryId(r.categories))
        setErr('')
      })
      .catch((e) => {
        setErr(e instanceof Error ? e.message : '加载失败')
        setCategories([])
        setArticles([])
      })
      .finally(() => setLoading(false))
  }, [edition])

  const topCats = useMemo(() => topLevelCategories(categories), [categories])

  const filteredArticles = useMemo(() => {
    if (!activeCat) return articles
    return articles.filter((a) => a.categoryId === activeCat)
  }, [articles, activeCat])

  const activeArticle = useMemo(() => {
    if (!articleId) return null
    return articles.find((a) => a.id === articleId) ?? null
  }, [articles, articleId])

  const product = productNameForEdition(edition)

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <LoginPortalNav linkClassName="text-white/70 hover:text-white" activeClassName="text-white" />
          <Link to="/login" className="text-sm font-medium text-cyan-300 hover:underline">
            登录
          </Link>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-2 sm:px-6">
          <h1 className="text-2xl font-bold sm:text-3xl">帮助手册</h1>
          <p className="mt-2 text-sm text-white/70">{product} 使用指南与常见问题</p>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:flex-row">
        <aside className="w-full shrink-0 rounded-xl border border-slate-200 bg-white p-3 lg:w-56">
          <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">分类</p>
          {loading ? <p className="px-2 py-4 text-sm text-slate-500">加载中…</p> : null}
          {err ? <p className="px-2 py-4 text-sm text-rose-600">{err}</p> : null}
          {!loading && !categories.length ? (
            <p className="px-2 py-4 text-sm text-slate-500">暂无分类，请由运营在管控台维护内容。</p>
          ) : null}
          <ul className="mt-1 space-y-2">
            {topCats.map((top) => {
              const children = childCategories(categories, top.id)
              if (children.length === 0) {
                return (
                  <li key={top.id}>
                    <button
                      type="button"
                      onClick={() => setActiveCat(top.id)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                        activeCat === top.id ? 'bg-cyan-50 font-medium text-cyan-800' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {top.title}
                    </button>
                  </li>
                )
              }
              return (
                <li key={top.id}>
                  <p className="px-3 py-1 text-xs font-semibold text-slate-500">{top.title}</p>
                  <ul className="mt-0.5 space-y-0.5 border-l border-slate-200 pl-2 ml-2">
                    {children.map((child) => (
                      <li key={child.id}>
                        <button
                          type="button"
                          onClick={() => setActiveCat(child.id)}
                          className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                            activeCat === child.id
                              ? 'bg-cyan-50 font-medium text-cyan-800'
                              : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {child.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })}
          </ul>
        </aside>

        <main className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white">
          {activeArticle ? (
            <div className="p-6">
              <Link to="/help" className="text-xs text-cyan-700 hover:underline">
                ← 返回列表
              </Link>
              <h2 className="mt-3 text-xl font-semibold">{activeArticle.title}</h2>
              <p className="mt-1 text-xs text-slate-400">更新于 {activeArticle.updatedAt}</p>
              <div className="prose prose-slate mt-6 max-w-none whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {activeArticle.body}
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filteredArticles.length === 0 ? (
                <li className="px-6 py-12 text-center text-sm text-slate-500">该分类下暂无文章</li>
              ) : (
                filteredArticles.map((a) => (
                  <li key={a.id}>
                    <Link
                      to={`/help/${a.id}`}
                      className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50"
                    >
                      <span className="text-sm font-medium text-slate-800">{a.title}</span>
                      <span className="shrink-0 text-xs text-slate-400">{a.updatedAt.slice(0, 10)}</span>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          )}
        </main>
      </div>
    </div>
  )
}
