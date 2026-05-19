import { BookOpen } from 'lucide-react'
import { cn } from '../../../cn'
import type { BindGuideConfig } from './bindGuideTypes'

type Props = {
  config: BindGuideConfig
  className?: string
  compact?: boolean
}

export default function PlatformBindGuide({ config, className, compact }: Props) {
  const stepsByPhase = config.phases.map((phase) => ({
    ...phase,
    steps: config.steps.filter((s) => s.phase === phase.id),
  }))

  return (
    <div
      className={cn('text-sm text-gray-800', compact ? 'space-y-5' : 'space-y-6', className)}
    >
      <div className="rounded-lg border border-blue-100 bg-blue-50/80 px-4 py-3 text-blue-950">
        <div className="flex items-start gap-2">
          <BookOpen className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1 text-sm leading-relaxed">
            <p className="font-medium">{config.introTitle}</p>
            <ul className="list-inside list-disc space-y-0.5">
              {config.introBullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {stepsByPhase
        .filter((phase) => phase.steps.length > 0)
        .map((phase) => (
          <section key={phase.id} className="space-y-4">
            <h4 className="text-base font-semibold text-gray-900">{phase.label}</h4>
            {phase.steps.map((step) => {
              const stepNo = config.steps.findIndex((s) => s.id === step.id) + 1
              const hasImage = Boolean(step.imageSrc)
              return (
                <article
                  key={step.id}
                  className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                >
                  <div className="border-b border-gray-100 bg-gray-50/80 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      步骤 {stepNo}
                    </p>
                    <h5 className="mt-0.5 font-semibold text-gray-900">{step.title}</h5>
                  </div>
                  <div
                    className={cn(
                      'gap-4 p-4',
                      hasImage ? 'grid lg:grid-cols-2 lg:items-start' : '',
                    )}
                  >
                    <ul className="list-inside list-decimal space-y-2 text-sm leading-relaxed text-gray-700">
                      {step.bullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                    {hasImage ? (
                      <div className="overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                        <img
                          src={step.imageSrc}
                          alt={step.imageAlt ?? step.title}
                          className="h-auto w-full object-contain"
                          loading="lazy"
                        />
                      </div>
                    ) : null}
                  </div>
                  {step.note ? (
                    <p className="border-t border-gray-100 bg-amber-50/60 px-4 py-2 text-xs leading-relaxed text-amber-950">
                      说明：{step.note}
                    </p>
                  ) : null}
                </article>
              )
            })}
          </section>
        ))}

      <section className="overflow-hidden rounded-xl border border-indigo-200 bg-indigo-50/50">
        <div className="border-b border-indigo-100 px-4 py-3">
          <h4 className="font-semibold text-indigo-950">{config.erpPhaseLabel}</h4>
        </div>
        <div className="space-y-2 px-4 py-3 text-sm leading-relaxed text-indigo-950">
          <p className="font-medium">{config.erpStep.title}</p>
          <ul className="list-inside list-decimal space-y-1.5">
            {config.erpStep.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
