type Props = {
  mode: 'script-submit' | 'script-upload' | 'video-submit' | 'video-upload-only'
  busyUpload?: boolean
  busySubmit?: boolean
  busyAi?: boolean
  uploadLabel?: string
  onView: () => void
  onAi: () => void
  onSubmit?: () => void
  onUpload: () => void
  onPasteLink?: () => void
}

export default function TalentApplicationDeliveryActions({
  mode,
  busyUpload,
  busySubmit,
  busyAi,
  uploadLabel,
  onView,
  onAi,
  onSubmit,
  onUpload,
  onPasteLink,
}: Props) {
  if (mode === 'script-upload') {
    return (
      <div className="app-order-card__btn-row app-order-card__btn-row--triple">
        <button
          type="button"
          className="app-order-card__btn app-order-card__btn--grid app-order-card__btn--upload"
          disabled={busyUpload || busyAi}
          onClick={onUpload}
        >
          {busyUpload ? '上传中…' : uploadLabel || '上传文稿'}
        </button>
        <button
          type="button"
          className="app-order-card__btn app-order-card__btn--grid app-order-card__btn--view"
          disabled={busyUpload || busyAi}
          onClick={() => onPasteLink?.()}
        >
          粘贴链接
        </button>
        <button
          type="button"
          className="app-order-card__btn app-order-card__btn--grid app-order-card__btn--ai"
          disabled={busyAi || busyUpload}
          onClick={onAi}
        >
          {busyAi ? '检测中…' : 'AI检测'}
        </button>
      </div>
    )
  }

  const viewLabel = mode === 'script-submit' ? '查看文稿' : '查看视频'
  const isUploadOnly = mode === 'video-upload-only'

  if (isUploadOnly) {
    return (
      <button
        type="button"
        className="app-order-card__btn app-order-card__btn--primary"
        disabled={busyUpload}
        onClick={onUpload}
      >
        {busyUpload ? '上传中…' : uploadLabel || '上传视频'}
      </button>
    )
  }

  return (
    <div className="app-order-card__btn-grid">
      <button
        type="button"
        className="app-order-card__btn app-order-card__btn--grid app-order-card__btn--view"
        onClick={onView}
      >
        {viewLabel}
      </button>
      <button
        type="button"
        className="app-order-card__btn app-order-card__btn--grid app-order-card__btn--ai"
        disabled={busyAi || busyUpload || busySubmit}
        onClick={onAi}
      >
        {busyAi ? '检测中…' : 'AI检测'}
      </button>
      <button
        type="button"
        className="app-order-card__btn app-order-card__btn--grid app-order-card__btn--submit"
        disabled={busySubmit || busyUpload}
        onClick={() => onSubmit?.()}
      >
        {busySubmit ? '提交中…' : '提交'}
      </button>
      <button
        type="button"
        className="app-order-card__btn app-order-card__btn--grid app-order-card__btn--upload"
        disabled={busyUpload || busySubmit}
        onClick={onUpload}
      >
        {busyUpload ? '上传中…' : '重新上传'}
      </button>
    </div>
  )
}
