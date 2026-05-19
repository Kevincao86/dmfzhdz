export type BindGuideStep = {
  id: string
  phase: string
  title: string
  bullets: string[]
  imageSrc?: string
  imageAlt?: string
  note?: string
}

export type BindGuidePhase = { id: string; label: string }

export type BindGuideConfig = {
  introTitle: string
  introBullets: string[]
  phases: BindGuidePhase[]
  steps: BindGuideStep[]
  erpPhaseLabel: string
  erpStep: { title: string; bullets: string[] }
}
