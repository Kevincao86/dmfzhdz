import { useState } from 'react'
import { getTheme, toggleTheme, type AppTheme } from '../lib/theme'

export default function ThemeToggle() {
  const [theme, setTheme] = useState<AppTheme>(() => getTheme())

  function onToggle() {
    setTheme(toggleTheme())
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      className="mb-2 flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--ops-border)] px-3 py-2 text-sm text-[var(--ops-muted)] transition-colors hover:bg-[var(--ops-hover)] hover:text-[var(--ops-text)]"
      title={theme === 'dark' ? '切换为白光模式' : '切换为黑暗模式'}
    >
      <span>{theme === 'dark' ? '☀️ 白光模式' : '🌙 黑暗模式'}</span>
      <span className="text-xs opacity-70">{theme === 'dark' ? 'Light' : 'Dark'}</span>
    </button>
  )
}
