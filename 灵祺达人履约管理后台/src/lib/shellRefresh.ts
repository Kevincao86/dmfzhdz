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
