type Props = {
  url: string
  title?: string
  onClose: () => void
}

/** 达人端：全屏预览已上传探店成片 */
export default function TalentUploadedVideoPreviewModal({ url, title = '已上传视频', onClose }: Props) {
  if (!url) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-medium text-slate-900">{title}</span>
          <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="bg-black p-2">
          <video src={url} controls playsInline className="w-full max-h-[70vh] rounded-lg" />
        </div>
      </div>
    </div>
  )
}
