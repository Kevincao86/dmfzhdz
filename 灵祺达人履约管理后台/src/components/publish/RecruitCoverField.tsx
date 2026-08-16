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
import {
  COVER_AI_POINTS,
  COVER_AI_RECHARGE_PATH,
  generateRecruitCoverImage,
  isCoverAiInsufficient,
  pickReferenceDataUrl,
} from '../../lib/mpSync/recruitSharePosterAi'

type Props = {
  platform: string
  talentTags: string[]
  coverImage?: string
  coverLibraryId?: string
  recruitTitle?: string
  region?: string
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

export default function RecruitCoverField({
  platform,
  talentTags,
  coverImage,
  coverLibraryId,
  recruitTitle,
  region,
  onChange,
}: Props) {
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryTab, setGalleryTab] = useState<CoverGalleryTab>('recommended')
  const [gallerySubKey, setGallerySubKey] = useState('')
  const [aiOpen, setAiOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiRefPreview, setAiRefPreview] = useState('')
  const [aiRefDataUrl, setAiRefDataUrl] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [fromAi, setFromAi] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)

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
    if (String(coverImage || '').trim()) return fromAi ? '已用 AI 生成封面' : '已上传自定义封面'
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
      setFromAi(false)
      onChange({ coverImage: dataUrl, coverLibraryId: '' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg !== '未选择图片') window.alert(msg)
    }
  }

  const onPickLibrary = (item: CoverLibraryItem) => {
    setFromAi(false)
    onChange({ coverImage: '', coverLibraryId: item.id })
    setGalleryOpen(false)
  }

  const onClear = () => {
    setFromAi(false)
    onChange({ coverImage: '', coverLibraryId: '' })
  }

  const onPickAiRef = async () => {
    try {
      const dataUrl = await pickReferenceDataUrl()
      setAiRefDataUrl(dataUrl)
      setAiRefPreview(dataUrl)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg !== '未选择图片') window.alert(msg)
    }
  }

  const onGenerateAi = async () => {
    if (aiBusy) return
    setAiBusy(true)
    try {
      const r = await generateRecruitCoverImage({
        title: recruitTitle,
        platform,
        region,
        userText: aiPrompt,
        referenceImage: aiRefDataUrl,
      })
      setFromAi(true)
      onChange({ coverImage: r.imageUrl, coverLibraryId: '' })
      window.alert(`已生成封面 · ${r.pointsCharged || COVER_AI_POINTS}积分`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (isCoverAiInsufficient(e) && window.confirm(`${msg}\n\n是否前往充值？`)) {
        window.location.assign(COVER_AI_RECHARGE_PATH)
        return
      }
      window.alert(msg || '生成失败')
    } finally {
      setAiBusy(false)
    }
  }

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
          <button
            type="button"
            className={`rounded-lg border px-3 py-1.5 text-xs ${
              aiOpen
                ? 'border-violet-600 bg-violet-600 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
            onClick={() => setAiOpen((v) => !v)}
          >
            AI生成
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
          <button
            type="button"
            className="mt-3 block w-full cursor-zoom-in"
            title="点击查看大图"
            onClick={() => setLightboxOpen(true)}
          >
            <img src={preview} alt="招募封面预览" className="h-36 w-full rounded-lg object-cover" />
          </button>
        ) : null}
        {aiOpen ? (
          <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/60 p-3 text-left">
            <p className="mb-2 text-xs text-slate-500">
              文字、要求和参考图均可选填 · {COVER_AI_POINTS}积分/张
            </p>
            <textarea
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
              rows={3}
              maxLength={300}
              placeholder="选填：封面文字、风格或场景要求"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                onClick={() => void onPickAiRef()}
              >
                {aiRefPreview ? '已选参考图' : '选填参考图'}
              </button>
              {aiRefPreview ? (
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
                  onClick={() => {
                    setAiRefPreview('')
                    setAiRefDataUrl('')
                  }}
                >
                  清除参考图
                </button>
              ) : null}
            </div>
            {aiRefPreview ? (
              <img src={aiRefPreview} alt="参考图" className="mt-2 h-20 w-20 rounded-lg object-cover" />
            ) : null}
            <button
              type="button"
              className="mt-3 w-full rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
              disabled={aiBusy}
              onClick={() => void onGenerateAi()}
            >
              {aiBusy ? '生成中…' : `开始生成 · ${COVER_AI_POINTS}积分`}
            </button>
          </div>
        ) : null}
      </div>

      {lightboxOpen && preview ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 p-4"
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="封面大图"
        >
          <button
            type="button"
            className="absolute right-4 top-4 text-sm text-white/80 hover:text-white"
            onClick={() => setLightboxOpen(false)}
          >
            关闭
          </button>
          <img
            src={preview}
            alt="招募封面大图"
            className="max-h-[90vh] max-w-[min(90vw,720px)] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}

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

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="grid grid-cols-2 gap-3 pb-2 sm:grid-cols-3 lg:grid-cols-4">
              {galleryItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`flex flex-col overflow-hidden rounded-xl border text-left ${
                    coverLibraryId === item.id ? 'border-violet-400 ring-2 ring-violet-400/40' : 'border-white/10'
                  }`}
                  onClick={() => onPickLibrary(item)}
                >
                  <div className="aspect-[5/4] w-full shrink-0 overflow-hidden bg-black/20">
                    <img src={item.url} alt={item.label} className="h-full w-full object-cover" loading="lazy" />
                  </div>
                  <span className="block px-2 py-1.5 text-xs text-white/80">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export { buildCoverFieldsForOrder, resolveOrderCoverUrl } from '../../lib/mpSync/recruitCoverLibrary'
