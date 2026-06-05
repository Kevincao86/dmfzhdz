let onChange: (() => void) | null = null

export function registerClientSyncOnChange(fn: () => void) {
  onChange = fn
}

export function notifyLocalClientStateChanged() {
  onChange?.()
}
