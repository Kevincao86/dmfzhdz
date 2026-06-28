import { richContentToHtml } from '../lib/richContentCore'

type Props = {
  body: string
  className?: string
}

/** 公告 / 帮助手册图文正文展示 */
export default function RichContentView({ body, className }: Props) {
  const html = richContentToHtml(body)
  if (!html) return null
  return (
    <div
      className={
        className ??
        'rich-content text-sm leading-relaxed text-slate-600 [&_blockquote]:my-2 [&_blockquote]:rounded-lg [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:bg-slate-50 [&_blockquote]:px-3 [&_blockquote]:py-2 [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-800 [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-lg [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+_p]:mt-2 [&_strong]:font-semibold [&_strong]:text-slate-800 [&_table.rich-table]:my-3 [&_table.rich-table]:w-full [&_table.rich-table]:border-collapse [&_table.rich-table_td]:border [&_table.rich-table_td]:border-slate-200 [&_table.rich-table_td]:px-2 [&_table.rich-table_td]:py-1.5 [&_table.rich-table_td]:align-top [&_table.rich-table_th]:border [&_table.rich-table_th]:border-slate-300 [&_table.rich-table_th]:bg-slate-100 [&_table.rich-table_th]:px-2 [&_table.rich-table_th]:py-1.5 [&_table.rich-table_th]:text-left [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5'
      }
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
