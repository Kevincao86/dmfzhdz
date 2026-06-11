import { useLocation, useNavigate } from 'react-router-dom'
import type { RecruitmentOrderRow } from './mpRecruitment/types'

export const HALL_RECRUITMENT_LIST_PATH = '/hall?tab=hall'

export function useRecruitmentNav() {
  const nav = useNavigate()
  const location = useLocation()
  return (row: RecruitmentOrderRow) => {
    if (row.isMock) {
      alert('演示商单，仅供预览')
      return
    }
    const returnTo =
      location.pathname.startsWith('/hall') && location.search
        ? `${location.pathname}${location.search}`
        : location.pathname.startsWith('/hall')
          ? HALL_RECRUITMENT_LIST_PATH
          : HALL_RECRUITMENT_LIST_PATH
    nav(`/recruitment/${encodeURIComponent(row.id)}`, { state: { returnTo } })
  }
}
