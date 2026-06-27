import type { ReactNode } from 'react'
import { cn } from '../cn'

export type OpsSegmentTab = { id: string; label: string }

type Props = {
  tabs: OpsSegmentTab[]
  activeId: string
  onChange: (id: string) => void
  trailing?: ReactNode
}

export default function OpsSegmentTabs({ tabs, activeId, onChange, trailing }: Props) {
  return (
    <div className="ops-segment-bar flex flex-wrap items-center gap-3">
      <div className="ops-segment-tabs inline-flex flex-wrap gap-1 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              'ops-segment-tab rounded-lg px-3.5 py-2 text-sm font-medium transition-all',
              activeId === tab.id ? 'ops-segment-tab--active' : 'ops-segment-tab--idle',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {trailing ? <div className="ml-auto flex flex-wrap items-center gap-2">{trailing}</div> : null}
    </div>
  )
}
