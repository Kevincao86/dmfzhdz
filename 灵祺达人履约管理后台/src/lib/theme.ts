export type AppTheme = 'light' | 'dark'

const KEY = 'lingqi_mp_app_theme_v1'

export function getTheme(): AppTheme {
  const v = localStorage.getItem(KEY)
  if (v === 'dark') return 'dark'
  return 'light'
}

export function setTheme(theme: AppTheme) {
  localStorage.setItem(KEY, theme)
  applyTheme(theme)
}

export function applyTheme(theme: AppTheme) {
  document.documentElement.dataset.theme = theme
}

export function initTheme() {
  applyTheme(getTheme())
}

export function toggleTheme(): AppTheme {
  const next: AppTheme = getTheme() === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}
