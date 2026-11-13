import { Navigate } from 'react-router-dom'

/** @deprecated 已合并至招募大厅 · 推荐大厅 Tab */
export default function RecommendTalentPage() {
  return <Navigate to="/hall?tab=recommend" replace />
}
