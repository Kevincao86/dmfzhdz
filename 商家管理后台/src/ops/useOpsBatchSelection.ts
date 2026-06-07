import { useCallback, useMemo, useState } from 'react'

export function useOpsBatchSelection(visibleIds: string[]) {
  const [checkedIds, setCheckedIds] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)

  const allVisibleChecked = useMemo(
    () => visibleIds.length > 0 && visibleIds.every((id) => checkedIds.includes(id)),
    [visibleIds, checkedIds],
  )

  const toggleRow = useCallback((id: string) => {
    setCheckedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }, [])

  const toggleAllVisible = useCallback(() => {
    if (allVisibleChecked) {
      setCheckedIds((cur) => cur.filter((id) => !visibleIds.includes(id)))
    } else {
      setCheckedIds((cur) => [...new Set([...cur, ...visibleIds])])
    }
  }, [allVisibleChecked, visibleIds])

  const clearChecked = useCallback((ids: string[]) => {
    const drop = new Set(ids)
    setCheckedIds((cur) => cur.filter((id) => !drop.has(id)))
  }, [])

  return {
    checkedIds,
    deleting,
    setDeleting,
    allVisibleChecked,
    toggleRow,
    toggleAllVisible,
    clearChecked,
  }
}
