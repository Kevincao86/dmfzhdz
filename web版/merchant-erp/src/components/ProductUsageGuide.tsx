import type { HelpManualEdition } from '../lib/helpManualTypes'
import { usageGuideForEdition } from '../lib/productUsageGuide'

export default function ProductUsageGuide({ edition }: { edition: HelpManualEdition }) {
  const guide = usageGuideForEdition(edition)
  if (!guide) return null
  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-slate-900">使用说明</h2>
      <p className="mt-1 text-sm text-slate-500">{guide.name}：下面是当前功能，以及对应的操作方式。</p>
      <div className="mt-4 space-y-4">
        {guide.sections.map((section) => (
          <div key={section.title}>
            <h3 className="text-sm font-medium text-slate-800">{section.title}</h3>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-slate-600">
              {section.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  )
}
