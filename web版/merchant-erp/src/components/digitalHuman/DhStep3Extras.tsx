import { Plus, Trash2, Upload } from 'lucide-react'
import type { RefObject } from 'react'
import { cn } from '../../cn'
import {
  BACKGROUND_OPTIONS,
  type DigitalHumanDraft,
  type DhSceneShot,
  newSceneShot,
} from '../../lib/digitalHumanBroadcast'
import {
  STORE_SCENE_OPTIONS,
  storeScenePreviewUrl,
  type StoreSceneId,
} from '../../lib/digitalHumanStoreScenes'

export const BACKGROUND_PREVIEW_HINTS: Record<
  string,
  { title: string; desc: string; className: string }
> = {
  studio: {
    title: '演播室',
    desc: '专业灰蓝演播室灯光，干净简洁，适合新闻/讲解类口播。',
    className: 'bg-gradient-to-b from-slate-600 via-slate-700 to-slate-900',
  },
  green: {
    title: '绿幕',
    desc: '均匀纯绿背景，便于后期抠像换景；合成时人物边缘更干净。',
    className: 'bg-[#00b140]',
  },
  'solid-blue': {
    title: '品牌蓝',
    desc: '纯色品牌蓝背景，简洁专业，适合促销/品牌口播短视频。',
    className: 'bg-gradient-to-br from-blue-600 to-blue-800',
  },
}

type BackgroundSubProps = {
  draft: DigitalHumanDraft
  patchDraft: (p: Partial<DigitalHumanDraft>) => void
  storeSceneSelecting: StoreSceneId | null
  onSelectStoreScene: (id: StoreSceneId) => void
  customBackgroundPreview: string | null
  backgroundInputRef: RefObject<HTMLInputElement | null>
  backgroundUploadBusy: boolean
  onBackgroundFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onPickBackgroundFile: () => void
}

export function DhBackgroundSubContent({
  draft,
  storeSceneSelecting,
  onSelectStoreScene,
  customBackgroundPreview,
  backgroundInputRef,
  backgroundUploadBusy,
  onBackgroundFileChange,
  onPickBackgroundFile,
}: BackgroundSubProps) {
  const hint = BACKGROUND_PREVIEW_HINTS[draft.background]

  return (
    <>
      {hint ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className={cn('aspect-[9/16] max-h-28 w-full', hint.className)} />
          <div className="px-3 py-2">
            <p className="text-xs font-medium text-slate-700">{hint.title}</p>
            <p className="mt-0.5 text-xs text-slate-500">{hint.desc}</p>
          </div>
        </div>
      ) : null}

      {draft.background === 'store' ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-slate-500">选择门店实景背景（AI 预生成，点击即可选用）</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STORE_SCENE_OPTIONS.map((scene) => {
              const preview = storeScenePreviewUrl(scene.id)
              const active = draft.storeScene === scene.id
              const loading = storeSceneSelecting === scene.id
              return (
                <button
                  key={scene.id}
                  type="button"
                  disabled={storeSceneSelecting !== null}
                  onClick={() => onSelectStoreScene(scene.id)}
                  className={cn(
                    'overflow-hidden rounded-xl border text-left transition',
                    active
                      ? 'border-violet-400 ring-2 ring-violet-200'
                      : 'border-slate-200 hover:border-violet-200',
                  )}
                >
                  <div className="relative aspect-[9/16] bg-slate-100">
                    <img
                      src={preview}
                      alt={scene.label}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    {loading ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-xs text-white">
                        选用中…
                      </div>
                    ) : null}
                  </div>
                  <p className="px-2 py-1 text-xs font-medium text-slate-700">{scene.label}</p>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {draft.background === 'custom' ? (
        <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-4">
          <p className="text-xs text-slate-500">
            上传门店实景、品牌场景等竖版图片（JPG/PNG），合成时将作为口型驱动前的场景背景。
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              ref={backgroundInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/*"
              className="hidden"
              onChange={onBackgroundFileChange}
            />
            {customBackgroundPreview ? (
              <img
                src={customBackgroundPreview}
                alt="背景预览"
                className="h-20 w-14 rounded-lg border border-slate-200 object-cover"
              />
            ) : null}
            <button
              type="button"
              disabled={backgroundUploadBusy}
              onClick={onPickBackgroundFile}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            >
              <Upload className="h-4 w-4" />
              {backgroundUploadBusy
                ? '上传中…'
                : draft.customBackgroundFileName || customBackgroundPreview
                  ? '更换背景图'
                  : '上传背景图'}
            </button>
            {draft.customBackgroundFileName ? (
              <span className="truncate text-xs text-slate-500">{draft.customBackgroundFileName}</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}

type MultiSceneProps = {
  draft: DigitalHumanDraft
  patchDraft: (p: Partial<DigitalHumanDraft>) => void
  onSelectShotStoreScene: (shotId: string, sceneId: StoreSceneId) => void
  shotStoreSceneSelecting: string | null
}

function shotBackgroundLabel(shot: DhSceneShot): string {
  if (shot.background === 'store' && shot.storeScene) {
    const scene = STORE_SCENE_OPTIONS.find((s) => s.id === shot.storeScene)
    return scene ? `门店 · ${scene.label}` : '门店实景'
  }
  return BACKGROUND_OPTIONS.find((b) => b.id === shot.background)?.label ?? shot.background
}

export function DhMultiScenePanel({
  draft,
  patchDraft,
  onSelectShotStoreScene,
  shotStoreSceneSelecting,
}: MultiSceneProps) {
  const shots = draft.sceneShots ?? []

  const updateShot = (shotId: string, patch: Partial<DhSceneShot>) => {
    patchDraft({
      sceneShots: shots.map((s) => (s.id === shotId ? { ...s, ...patch } : s)),
    })
  }

  const removeShot = (shotId: string) => {
    const next = shots.filter((s) => s.id !== shotId)
    patchDraft({ sceneShots: next, multiScene: next.length >= 2 })
  }

  const addShot = () => {
    if (shots.length >= 8) return
    const n = shots.length + 1
    patchDraft({
      sceneShots: [
        ...shots,
        newSceneShot(`镜头 ${n}`, {
          background: n % 2 === 0 ? 'store' : 'studio',
          storeScene: n % 2 === 0 ? 'restaurant' : null,
        }),
      ],
    })
  }

  if (!draft.multiScene) return null

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-violet-200 bg-violet-50/40 p-4 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-800">多场景镜头</p>
          <p className="text-xs text-slate-500">
            按顺序为每段口播指定背景；至少 2 个镜头，成片将按段切换场景。
          </p>
        </div>
        <button
          type="button"
          disabled={shots.length >= 8}
          onClick={addShot}
          className="inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          新增镜头
        </button>
      </div>

      {shots.length < 2 ? (
        <p className="text-xs text-amber-700">请至少添加 2 个镜头后再提交合成。</p>
      ) : null}

      <div className="space-y-3">
        {shots.map((shot, index) => (
          <div key={shot.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-violet-700">镜头 {index + 1}</span>
                  <input
                    type="text"
                    value={shot.label}
                    onChange={(e) => updateShot(shot.id, { label: e.target.value })}
                    className="min-w-[6rem] flex-1 rounded border border-slate-200 px-2 py-1 text-xs"
                    placeholder="镜头备注"
                  />
                </div>
                <select
                  value={shot.background}
                  onChange={(e) => {
                    const bg = e.target.value
                    updateShot(shot.id, {
                      background: bg,
                      storeScene: bg === 'store' ? shot.storeScene ?? 'restaurant' : null,
                    })
                  }}
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                >
                  {BACKGROUND_OPTIONS.filter((b) => b.id !== 'custom').map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                  <option value="custom">自定义图片（使用上方已上传）</option>
                </select>
                {shot.background === 'store' ? (
                  <div className="grid grid-cols-4 gap-1.5">
                    {STORE_SCENE_OPTIONS.map((scene) => {
                      const active = shot.storeScene === scene.id
                      const loading = shotStoreSceneSelecting === `${shot.id}:${scene.id}`
                      return (
                        <button
                          key={scene.id}
                          type="button"
                          disabled={shotStoreSceneSelecting !== null}
                          onClick={() => onSelectShotStoreScene(shot.id, scene.id)}
                          className={cn(
                            'overflow-hidden rounded-lg border text-left',
                            active ? 'border-violet-400 ring-1 ring-violet-200' : 'border-slate-200',
                          )}
                        >
                          <div className="relative aspect-[9/16]">
                            <img
                              src={storeScenePreviewUrl(scene.id)}
                              alt={scene.label}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                            {loading ? (
                              <div className="absolute inset-0 bg-black/25 text-[10px] text-white flex items-center justify-center">
                                …
                              </div>
                            ) : null}
                          </div>
                          <p className="truncate px-1 py-0.5 text-[10px] text-slate-600">{scene.label}</p>
                        </button>
                      )
                    })}
                  </div>
                ) : null}
                <p className="text-[11px] text-slate-400">当前：{shotBackgroundLabel(shot)}</p>
              </div>
              {shots.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeShot(shot.id)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title="删除镜头"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
