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
      className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm border border-[var(--shell-border)] text-[var(--shell-muted)] hover:text-[var(--shell-text)] hover:bg-[var(--shell-hover)] transition-colors"
      title={theme === 'dark' ? '切换为白光模式' : '切换为黑暗模式'}
    >
      <span>{theme === 'dark' ? '☀️ 白光模式' : '🌙 黑暗模式'}</span>
      <span className="text-xs opacity-70">{theme === 'dark' ? 'Light' : 'Dark'}</span>
    </button>
  )
}
