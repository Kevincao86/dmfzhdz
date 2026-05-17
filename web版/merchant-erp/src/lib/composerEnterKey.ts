import type { KeyboardEvent } from 'react'

/** 中文等 IME 组字中按 Enter 为确认选字，不应触发发送 */
export function shouldSubmitComposerOnEnter(e: KeyboardEvent): boolean {
  if (e.key !== 'Enter' || e.shiftKey) return false
  if (e.nativeEvent.isComposing) return false
  return true
}
