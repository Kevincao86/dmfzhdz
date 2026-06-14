type ShellRefreshListener = () => void

const listeners = new Set<ShellRefreshListener>()

export function onShellRefresh(listener: ShellRefreshListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 身份/角色切换后通知壳层重读 session，避免整页 reload */
export function triggerShellRefresh() {
  listeners.forEach((fn) => fn())
}

const profileListeners = new Set<ShellRefreshListener>()

/** 资料保存后刷新顶栏展示名（不重载页面） */
export function onProfileDisplayRefresh(listener: ShellRefreshListener): () => void {
  profileListeners.add(listener)
  return () => profileListeners.delete(listener)
}

export function triggerProfileDisplayRefresh() {
  profileListeners.forEach((fn) => fn())
}
