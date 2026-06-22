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
        'rich-content text-sm leading-relaxed text-slate-600 [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-800 [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-lg [&_p+_p]:mt-2 [&_strong]:font-semibold [&_strong]:text-slate-800'
      }
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
