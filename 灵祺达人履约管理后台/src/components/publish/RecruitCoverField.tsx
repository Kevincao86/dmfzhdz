import { useMemo, useState } from 'react'
import {
  buildCoverFieldsForOrder,
  findCoverById,
  getSuggestedGalleryItems,
  resolveDefaultCover,
  resolveOrderCoverUrl,
  type CoverLibraryItem,
} from '../../lib/mpSync/recruitCoverLibrary'
import { pickCoverImageDataUrl } from '../../lib/mpSync/recruitCoverImage'

type Props = {
  platform: string
  talentTags: string[]
  coverImage?: string
  coverLibraryId?: string
  onChange: (patch: { coverImage?: string; coverLibraryId?: string }) => void
}

function resolvePreview(platform: string, talentTags: string[], coverImage?: string, coverLibraryId?: string) {
  const upload = String(coverImage || '').trim()
  if (upload) return upload
  const libId = String(coverLibraryId || '').trim()
  if (libId) {
    const hit = findCoverById(libId)
    if (hit?.url) return hit.url
  }
  return resolveDefaultCover(platform, talentTags).url || ''
}

export default function RecruitCoverField({ platform, talentTags, coverImage, coverLibraryId, onChange }: Props) {
  const [galleryOpen, setGalleryOpen] = useState(false)
  const preview = useMemo(
    () => resolvePreview(platform, talentTags, coverImage, coverLibraryId),
    [platform, talentTags, coverImage, coverLibraryId],
  )
  const galleryItems = useMemo(
    () => getSuggestedGalleryItems(platform, talentTags),
    [platform, talentTags],
  )

  const onUpload = async () => {
    try {
      const dataUrl = await pickCoverImageDataUrl()
      onChange({ coverImage: dataUrl, coverLibraryId: '' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg !== '未选择图片') window.alert(msg)
    }
  }

  const onPickLibrary = (item: CoverLibraryItem) => {
    onChange({ coverImage: '', coverLibraryId: item.id })
    setGalleryOpen(false)
  }

  const onClear = () => onChange({ coverImage: '', coverLibraryId: '' })

  const sourceHint = (() => {
    if (String(coverImage || '').trim()) return '已上传自定义封面'
    if (String(coverLibraryId || '').trim()) return '已选图库封面'
    return '未选择时将使用对应平台默认封面'
  })()

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white/90">招募单封面图（选填）</p>
          <p className="mt-1 text-xs text-white/50">{sourceHint}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs" onClick={() => void onUpload()}>
            上传
          </button>
          <button type="button" className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs" onClick={() => setGalleryOpen(true)}>
            图库
          </button>
          {(coverImage || coverLibraryId) && (
            <button type="button" className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-white/60" onClick={onClear}>
              清除
            </button>
          )}
        </div>
      </div>
      {preview ? (
        <img src={preview} alt="招募封面预览" className="mt-3 h-36 w-full rounded-lg object-cover" />
      ) : null}

      {galleryOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">选择封面图</p>
            <button type="button" className="text-sm text-violet-300" onClick={() => setGalleryOpen(false)}>
              关闭
            </button>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
            {galleryItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`overflow-hidden rounded-xl border ${coverLibraryId === item.id ? 'border-violet-400' : 'border-white/10'}`}
                onClick={() => onPickLibrary(item)}
              >
                <img src={item.url} alt={item.label} className="aspect-[5/4] w-full object-cover" />
                <span className="block px-2 py-1 text-left text-xs text-white/70">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export { buildCoverFieldsForOrder, resolveOrderCoverUrl }
