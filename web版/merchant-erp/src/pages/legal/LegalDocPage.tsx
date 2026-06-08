import { Link } from 'react-router-dom'
import type { HelpManualEdition } from '../../lib/helpManualTypes'
import { buildAupSections, buildPrivacySections, type LegalSection } from '../../lib/legalContent'
import { LEGAL_COMPANY_NAME, productNameForEdition } from '../../lib/legalProductMeta'
import LoginPortalNav from '../../components/login/LoginPortalNav'

type Props = {
  edition: HelpManualEdition
  doc: 'privacy' | 'aup'
}

function LegalBody({ sections }: { sections: LegalSection[] }) {
  return (
    <div className="prose prose-slate max-w-none space-y-8">
      {sections.map((s) => (
        <section key={s.title}>
          <h2 className="text-lg font-semibold text-slate-900">{s.title}</h2>
          {s.paragraphs.map((p, i) => (
            <p key={i} className="mt-2 text-sm leading-relaxed text-slate-600">
              {p}
            </p>
          ))}
        </section>
      ))}
    </div>
  )
}

export default function LegalDocPage({ edition, doc }: Props) {
  const product = productNameForEdition(edition)
  const title = doc === 'privacy' ? '隐私政策' : '软件服务及许可协议'
  const sections = doc === 'privacy' ? buildPrivacySections(edition) : buildAupSections(edition)

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
        <p className="text-xs text-slate-500">{LEGAL_COMPANY_NAME}</p>
        <h1 className="mt-1 text-2xl font-bold">
          {product} · {title}
        </h1>
        <p className="mt-2 text-sm text-slate-500">发布与生效日期：2026年6月7日</p>
        <div className="mt-8">
          <LegalBody sections={sections} />
        </div>
      </main>
    </div>
  )
}
