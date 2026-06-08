import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import LoginPortalNav from '../components/login/LoginPortalNav'
import { defaultTeamIntro, renderTeamIntroParagraphs } from '../lib/teamIntroDefaults'
import { fetchTeamIntroPublic } from '../lib/teamIntroApi'
import type { HelpManualEdition } from '../lib/helpManualTypes'
import { LEGAL_COMPANY_NAME, productNameForEdition } from '../lib/legalProductMeta'

type Props = { edition: HelpManualEdition }

export default function TeamIntroPage({ edition }: Props) {
  const product = productNameForEdition(edition)
  const fallback = useMemo(() => defaultTeamIntro(), [])
  const [subtitle, setSubtitle] = useState(fallback.subtitle ?? LEGAL_COMPANY_NAME)
  const [paragraphs, setParagraphs] = useState(fallback.paragraphs)
  const [updatedAt, setUpdatedAt] = useState(fallback.updatedAt)
  const [err, setErr] = useState('')

  useEffect(() => {
    void fetchTeamIntroPublic()
      .then((intro) => {
        setSubtitle(intro.subtitle || LEGAL_COMPANY_NAME)
        setParagraphs(intro.paragraphs.length ? intro.paragraphs : fallback.paragraphs)
        setUpdatedAt(intro.updatedAt)
        setErr('')
      })
      .catch((e) => {
        setErr(e instanceof Error ? e.message : '加载失败')
      })
  }, [fallback.paragraphs])

  const rendered = useMemo(() => renderTeamIntroParagraphs(paragraphs, product), [paragraphs, product])

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <LoginPortalNav />
          <Link to="/login" className="text-sm font-medium text-cyan-700 hover:underline">
            登录
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-bold">团队介绍</h1>
        <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
        {err ? <p className="mt-4 text-sm text-rose-600">{err}</p> : null}
        <div className="mt-8 space-y-4 text-sm leading-relaxed text-slate-700">
          {rendered.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        {updatedAt ? <p className="mt-8 text-xs text-slate-400">更新于 {updatedAt}</p> : null}
      </main>
    </div>
  )
}
