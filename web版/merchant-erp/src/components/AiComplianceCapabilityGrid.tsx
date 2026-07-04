import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  Code2,
  FileText,
  Globe2,
  Image,
  LocateFixed,
  Mic,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import type { AiComplianceCapabilityCard } from '../lib/addonAiComplianceCapabilities'

const TONE_CLASS: Record<
  AiComplianceCapabilityCard['tone'],
  { box: string; icon: string }
> = {
  rose: { box: 'bg-rose-50 text-rose-600', icon: 'text-rose-500' },
  sky: { box: 'bg-sky-50 text-sky-600', icon: 'text-sky-500' },
  violet: { box: 'bg-violet-50 text-violet-600', icon: 'text-violet-500' },
  emerald: { box: 'bg-emerald-50 text-emerald-600', icon: 'text-emerald-500' },
  amber: { box: 'bg-amber-50 text-amber-600', icon: 'text-amber-500' },
  indigo: { box: 'bg-indigo-50 text-indigo-600', icon: 'text-indigo-500' },
}

function CapabilityIcon({ card }: { card: AiComplianceCapabilityCard }) {
  const cls = `h-5 w-5 ${TONE_CLASS[card.tone].icon}`
  switch (card.icon) {
    case 'code':
      return <Code2 className={cls} aria-hidden />
    case 'image':
      return <Image className={cls} aria-hidden />
    case 'mic':
      return <Mic className={cls} aria-hidden />
    case 'alert':
      return <AlertTriangle className={cls} aria-hidden />
    case 'sparkles':
      return <Sparkles className={cls} aria-hidden />
    case 'globe':
      return <Globe2 className={cls} aria-hidden />
    case 'file':
      return <FileText className={cls} aria-hidden />
    case 'shield':
      return <ShieldCheck className={cls} aria-hidden />
    case 'locate':
      return <LocateFixed className={cls} aria-hidden />
    case 'ban':
      return <Ban className={cls} aria-hidden />
    case 'badge':
      return <BadgeCheck className={cls} aria-hidden />
    default:
      return <Sparkles className={cls} aria-hidden />
  }
}

type Props = {
  title: string
  subtitle: string
  cards: AiComplianceCapabilityCard[]
}

export default function AiComplianceCapabilityGrid({ title, subtitle, cards }: Props) {
  return (
    <section className="surface-card overflow-hidden rounded-xl border">
      <div className="border-b border-[var(--shell-border)] bg-gradient-to-b from-slate-50/90 to-white px-5 py-5 text-center">
        <h2 className="text-lg font-bold tracking-tight text-[var(--shell-fg)]">{title}</h2>
        <p className="mt-1.5 text-sm text-[var(--shell-muted)]">{subtitle}</p>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const tone = TONE_CLASS[card.tone]
          return (
            <article
              key={card.id}
              className="rounded-xl border border-[var(--shell-border)] bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div
                className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg ${tone.box}`}
              >
                <CapabilityIcon card={card} />
              </div>
              <h3 className="text-sm font-semibold text-[var(--shell-fg)]">{card.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-[var(--shell-muted)]">{card.desc}</p>
            </article>
          )
        })}
      </div>
    </section>
  )
}
