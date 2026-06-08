import { defaultTeamIntro } from './teamIntroDefaults.js'
import type { RegistryTeamIntro } from './teamIntroTypes.js'
import type { RegistrySnapshot } from './opsRegistryTypes.js'

export function resolveTeamIntro(data: { teamIntro?: RegistryTeamIntro | null }): RegistryTeamIntro {
  const stored = data.teamIntro
  if (stored && Array.isArray(stored.paragraphs) && stored.paragraphs.length > 0) {
    return {
      subtitle: typeof stored.subtitle === 'string' ? stored.subtitle : defaultTeamIntro().subtitle,
      paragraphs: stored.paragraphs.filter((p) => typeof p === 'string' && p.trim()).slice(0, 20),
      updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : defaultTeamIntro().updatedAt,
    }
  }
  return defaultTeamIntro()
}

export function setTeamIntro(data: RegistrySnapshot, intro: RegistryTeamIntro): void {
  data.teamIntro = {
    subtitle: String(intro.subtitle || '').trim().slice(0, 120) || undefined,
    paragraphs: intro.paragraphs.map((p) => String(p).trim()).filter(Boolean).slice(0, 20),
    updatedAt: intro.updatedAt || new Date().toLocaleString('zh-CN', { hour12: false }),
  }
}
