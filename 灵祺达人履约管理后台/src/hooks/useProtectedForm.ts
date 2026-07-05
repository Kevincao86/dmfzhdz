import { useCallback, useRef } from 'react'
import { lockFormEditing, unlockFormEditing } from '../lib/formEditGuard'

/** 表单页：聚焦/编辑后锁定，避免异步回填或壳层 remount 覆盖输入 */
export function useProtectedForm() {
  const lockedRef = useRef(false)

  const lockForm = useCallback(() => {
    lockedRef.current = true
    lockFormEditing()
  }, [])

  const unlockForm = useCallback(() => {
    lockedRef.current = false
    unlockFormEditing()
  }, [])

  const fieldFocusProps = useCallback(
    () => ({
      onFocus: lockForm,
    }),
    [lockForm],
  )

  return { lockForm, unlockForm, fieldFocusProps, lockedRef }
}
