import { fetchOpsErpApi } from '../lib/opsErpApiBase.js'

export type RegistryTeamIntro = {
  subtitle?: string
  paragraphs: string[]
  updatedAt: string
}

export async function saveTeamIntro(intro: RegistryTeamIntro): Promise<{ ok: boolean; error?: string }> {
  const res = await fetchOpsErpApi('/api/meoo-ops-team-intro-set', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intro }),
  })
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
  if (!res.ok) return { ok: false, error: String(j.error || `http_${res.status}`) }
  return { ok: j.ok !== false }
}
