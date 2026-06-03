import { useNavigate } from 'react-router-dom'
import type { RecruitmentOrderRow } from './mpRecruitment/types'

export function useRecruitmentNav() {
  const nav = useNavigate()
  return (row: RecruitmentOrderRow) => {
    if (row.isMock) {
      alert('演示商单，仅供预览')
      return
    }
    nav(`/recruitment/${encodeURIComponent(row.id)}`)
  }
}
