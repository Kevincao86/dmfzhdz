import { Link } from 'react-router-dom'
import { buildAupSections, buildPrivacySections, type LegalSection } from '../lib/legalContent'
import { LEGAL_COMPANY_NAME, productNameForEdition } from '../lib/legalProductMeta'

type Props = {
  doc: 'privacy' | 'aup'
}

function LegalBody({ sections }: { sections: LegalSection[] }) {
  return (
    <div className="max-w-none space-y-8">
      {sections.map((s) => (
        <section key={s.title}>
          <h2 className="text-lg font-semibold text-white">{s.title}</h2>
          {s.paragraphs.map((p, i) => (
            <p key={i} className="mt-2 text-sm leading-relaxed text-slate-400">
              {p}
            </p>
          ))}
        </section>
      ))}
    </div>
  )
}

export default function OpsLegalDocPage({ doc }: Props) {
  const edition = 'merchant' as const
  const product = productNameForEdition(edition)
  const title = doc === 'privacy' ? '隐私政策' : '软件服务及许可协议'
  const sections = doc === 'privacy' ? buildPrivacySections(edition) : buildAupSections(edition)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/login" className="text-sm text-indigo-400 hover:underline">
            返回登录
          </Link>
          <span className="text-xs text-slate-500">{LEGAL_COMPANY_NAME}</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">{product}</p>
        <div className="mt-8">
          <LegalBody sections={sections} />
        </div>
      </main>
    </div>
  )
}
