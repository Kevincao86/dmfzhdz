import { loadEnv } from 'vite'

export function applyViteEnvToProcess(env: Record<string, string>) {
  for (const [key, value] of Object.entries(env)) {
    if (value && !(process.env[key] ?? '').trim()) process.env[key] = value
  }
}

export function applyViteEnvDirs(mode: string, dirs: string[]) {
  for (const dir of dirs) {
    if (!dir) continue
    applyViteEnvToProcess(loadEnv(mode, dir, ''))
  }
}
