export function countFreeEditPackSlots(mp: Record<string, unknown>): number {
  const slots = (mp.iceVideoSlots || []) as { assignedApplicantId?: string }[]
  return slots.filter((s) => !String(s.assignedApplicantId || '').trim()).length
}
