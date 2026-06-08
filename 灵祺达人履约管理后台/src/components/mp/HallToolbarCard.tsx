import type { ReactNode } from 'react'

type Props = { children: ReactNode }

/** 招募/推荐大厅顶部：Hero、搜索、筛选与下方列表同宽对齐 */
export default function HallToolbarCard({ children }: Props) {
  return <section className="hall-toolbar-card panel-card rounded-2xl border p-5 md:p-6">{children}</section>
}
