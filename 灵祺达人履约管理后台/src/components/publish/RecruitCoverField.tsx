import { useMemo, useState } from 'react'
import {
  findCoverById,
  getGalleryItemsForTab,
  listCoverPlatformNames,
  listCoverTagNames,
  resolveDefaultCover,
  type CoverGalleryTab,
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
  const [galleryTab, setGalleryTab] = useState<CoverGalleryTab>('recommended')
  const [gallerySubKey, setGallerySubKey] = useState('')

  const preview = useMemo(
    () => resolvePreview(platform, talentTags, coverImage, coverLibraryId),
    [platform, talentTags, coverImage, coverLibraryId],
  )

  const platformNames = useMemo(() => listCoverPlatformNames(), [])
  const tagNames = useMemo(() => listCoverTagNames(), [])

  const galleryItems = useMemo(
    () => getGalleryItemsForTab(galleryTab, platform, talentTags, gallerySubKey),
    [galleryTab, gallerySubKey, platform, talentTags],
  )

  const sourceHint = (() => {
    if (String(coverImage || '').trim()) return '已上传自定义封面'
    if (String(coverLibraryId || '').trim()) return '已选图库封面'
    return '未选择时将使用对应平台默认封面'
  })()

  const openGallery = () => {
    setGalleryTab('recommended')
    setGallerySubKey('')
    setGalleryOpen(true)
  }

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

  const switchTab = (tab: CoverGalleryTab) => {
    setGalleryTab(tab)
    if (tab === 'platform') setGallerySubKey(platform || platformNames[0] || '抖音')
    else if (tab === 'tag') setGallerySubKey(talentTags[0] || tagNames[0] || '美食')
    else setGallerySubKey('')
  }

  return (
    <div className="pub-field">
      <div className="mb-1">
        <span className="text-slate-300 text-sm font-medium">招募单封面图（选填）</span>
        <p className="text-xs text-slate-500 mt-0.5">{sourceHint}</p>
      </div>

      <div className="rounded-lg panel-input border p-3">
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            onClick={() => void onUpload()}
          >
            上传图片
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            onClick={openGallery}
          >
            从图库选择
          </button>
          {(coverImage || coverLibraryId) && (
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
              onClick={onClear}
            >
              清除
            </button>
          )}
        </div>
        {preview ? (
          <button type="button" className="mt-3 block w-full" onClick={openGallery}>
            <img src={preview} alt="招募封面预览" className="h-36 w-full rounded-lg object-cover" />
          </button>
        ) : null}
      </div>

      {galleryOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 p-4 text-white">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold">封面图库</p>
              <p className="text-xs text-white/50 mt-0.5">共 {galleryItems.length} 张 · 用于小程序分享卡片</p>
            </div>
            <button type="button" className="text-sm text-violet-300 shrink-0" onClick={() => setGalleryOpen(false)}>
              关闭
            </button>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            {(
              [
                ['recommended', '推荐'],
                ['all', '全部'],
                ['platform', '平台'],
                ['tag', '标签'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`rounded-full px-3 py-1 text-xs ${galleryTab === id ? 'bg-violet-600 text-white' : 'bg-white/10 text-white/70'}`}
                onClick={() => switchTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {galleryTab === 'platform' ? (
            <div className="mb-3 flex flex-wrap gap-2 max-h-24 overflow-y-auto">
              {platformNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`rounded-full px-2.5 py-1 text-xs ${gallerySubKey === name ? 'bg-cyan-600' : 'bg-white/10'}`}
                  onClick={() => setGallerySubKey(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          ) : null}

          {galleryTab === 'tag' ? (
            <div className="mb-3 flex flex-wrap gap-2 max-h-24 overflow-y-auto">
              {tagNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`rounded-full px-2.5 py-1 text-xs ${gallerySubKey === name ? 'bg-cyan-600' : 'bg-white/10'}`}
                  onClick={() => setGallerySubKey(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          ) : null}

          <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4 content-start">
            {galleryItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`overflow-hidden rounded-xl border text-left ${coverLibraryId === item.id ? 'border-violet-400 ring-2 ring-violet-400/40' : 'border-white/10'}`}
                onClick={() => onPickLibrary(item)}
              >
                <img src={item.url} alt={item.label} className="aspect-[5/4] w-full object-cover" />
                <span className="block px-2 py-1.5 text-xs text-white/80">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export { buildCoverFieldsForOrder, resolveOrderCoverUrl } from '../../lib/mpSync/recruitCoverLibrary'
