/** 外部分享审片：免登录路径（须与 App.tsx 路由、后端 buildSharePageUrl 保持一致） */
export function isPublicVideoReviewSharePath(pathname: string): boolean {
  const p = String(pathname || '').replace(/\/$/, '') || '/'
  return (
    /^\/video-review-share\/[^/]+/.test(p) ||
    /^\/orders\/[^/]+\/video-review\/share\/[^/]+/.test(p)
  )
}
