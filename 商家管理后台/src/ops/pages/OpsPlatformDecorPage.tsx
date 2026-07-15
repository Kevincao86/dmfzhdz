import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchRegistry } from '../opsRegistryApi'
import { resolvePlatformDecoration } from '../../meooRegistryShared/platformDecorRegistryCore.js'
import {
  PLATFORM_DECOR_SLOT_KEYS,
  PLATFORM_DECOR_SLOT_LABELS,
  PLATFORM_DECOR_SLOT_SIZE_HINTS,
  isDecorVideoMedia,
  type PlatformDecorFreq,
  type PlatformDecorLinkType,
  type PlatformDecorMediaType,
  type RegistryPlatformDecorItem,
} from '../../meooRegistryShared/platformDecorTypes.js'
import { savePlatformDecoration } from '../opsPlatformDecorApi'
import { uploadOpsContentImage } from '../opsContentImageApi'
import { OpsEditableSection } from '../useOpsModuleEdit'

function nowStr() {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

function newId() {
  return `decor_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function isPopupSlot(slotKey: string) {
  return String(slotKey || '').endsWith('.popup')
}

function nowIsoLocal() {
  return new Date().toISOString()
}

/** ISO / 任意可解析时间 → datetime-local 值 */
function toDatetimeLocalValue(iso?: string): string {
  const raw = String(iso || '').trim()
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** datetime-local → ISO（本地时区） */
function fromDatetimeLocalValue(local: string): string | undefined {
  const v = String(local || '').trim()
  if (!v) return undefined
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

function emptyItem(slotKey: string): RegistryPlatformDecorItem {
  return {
    id: newId(),
    slotKey,
    enabled: true,
    title: PLATFORM_DECOR_SLOT_LABELS[slotKey] || slotKey,
    imageUrl: '',
    mediaType: 'image',
    linkType: 'none',
    freq: 'daily',
    identities: ['all'],
    priority: 100,
    updatedAt: nowIsoLocal(),
  }
}

function DecorMediaThumb({ item, className }: { item: RegistryPlatformDecorItem; className?: string }) {
  if (!item.imageUrl) {
    return (
      <div
        className={
          className ||
          'flex h-12 w-12 items-center justify-center rounded bg-slate-800 text-[10px] text-slate-500'
        }
      >
        无素材
      </div>
    )
  }
  if (isDecorVideoMedia(item)) {
    return (
      <video
        src={item.imageUrl}
        className={className || 'h-12 w-12 rounded object-cover'}
        muted
        playsInline
        preload="metadata"
      />
    )
  }
  return (
    <img src={item.imageUrl} alt="" className={className || 'h-12 w-12 rounded object-cover'} />
  )
}

export default function OpsPlatformDecorPage() {
  const [params] = useSearchParams()
  const kind = params.get('kind') === 'banner' ? 'banner' : 'popup'
  const [items, setItems] = useState<RegistryPlatformDecorItem[]>([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState('')
  const [updatedAt, setUpdatedAt] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const slotOptions = useMemo(
    () =>
      PLATFORM_DECOR_SLOT_KEYS.filter((k) =>
        kind === 'popup' ? isPopupSlot(k) : !isPopupSlot(k),
      ),
    [kind],
  )

  const visibleItems = useMemo(
    () => items.filter((it) => (kind === 'popup' ? isPopupSlot(it.slotKey) : !isPopupSlot(it.slotKey))),
    [items, kind],
  )

  const load = useCallback(async () => {
    try {
      const r = await fetchRegistry()
      const decor = resolvePlatformDecoration(r)
      setItems(decor.items)
      setUpdatedAt(decor.updatedAt || '')
      setMsg('')
    } catch {
      setMsg('加载失败，请刷新重试')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const editing = items.find((it) => it.id === editingId) || null

  function patchItem(id: string, patch: Partial<RegistryPlatformDecorItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch, updatedAt: nowIsoLocal() } : it)))
  }

  function onAdd() {
    const slotKey = slotOptions[0] || 'mp.home.popup'
    const row = emptyItem(slotKey)
    setItems((prev) => [row, ...prev])
    setEditingId(row.id)
  }

  function onRemove(id: string) {
    if (!window.confirm('确定删除该装修素材？')) return
    setItems((prev) => prev.filter((it) => it.id !== id))
    if (editingId === id) setEditingId(null)
  }

  async function onUpload(id: string, file: File | null) {
    if (!file) return
    const isVideo = /^video\//i.test(file.type) || /\.(mp4|webm|mov|m4v)$/i.test(file.name)
    const maxMb = isVideo ? 15 : 8
    if (file.size > maxMb * 1024 * 1024) {
      window.alert(isVideo ? `视频请不超过 ${maxMb}MB` : `图片/GIF 请不超过 ${maxMb}MB`)
      return
    }
    setUploading(true)
    try {
      const r = await uploadOpsContentImage(file)
      if (!r.ok) {
        window.alert(r.detail || r.error || '上传失败')
        return
      }
      patchItem(id, {
        imageUrl: r.imageUrl,
        mediaType: r.mediaType as PlatformDecorMediaType,
      })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function onSave() {
    setSaving(true)
    setMsg('')
    try {
      const decoration = {
        items,
        updatedAt: nowStr(),
      }
      const r = await savePlatformDecoration(decoration)
      if (!r.ok) {
        setMsg(r.error ?? '保存失败')
        return
      }
      setUpdatedAt(decoration.updatedAt)
      setMsg('已保存，各端拉取公开接口后生效（约 30 秒内）')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">
          {kind === 'popup' ? '海报弹窗' : '页面广告位'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {kind === 'popup'
            ? '活动海报首页弹窗：与公告弹窗互斥，优先紧急/入选/档期类通知。支持 once / daily / always 频控。素材支持静图、GIF、短视频（OSS）。'
            : 'Banner / 条幅按 slotKey 投放。同一槽位取 priority 最小且在有效期内的一条。素材支持静图、GIF、短视频（OSS）。'}
        </p>
        <ul className="mt-3 space-y-1 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-400">
          {slotOptions.map((k) => (
            <li key={k}>
              <span className="text-slate-300">{PLATFORM_DECOR_SLOT_LABELS[k] || k}</span>
              {' · '}
              {PLATFORM_DECOR_SLOT_SIZE_HINTS[k] || '按展示比例出图'}
            </li>
          ))}
        </ul>
      </div>

      <OpsEditableSection className="block space-y-4 rounded-xl border border-[var(--ops-border)] bg-[var(--ops-panel)] p-5">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onAdd}
            className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200 hover:bg-cyan-500/20"
          >
            新增素材
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave()}
            className="rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? '保存中…' : '保存并同步'}
          </button>
          {updatedAt ? <span className="text-xs text-slate-500">上次保存：{updatedAt}</span> : null}
        </div>
        {msg ? <p className="text-sm text-amber-200/90">{msg}</p> : null}

        {!visibleItems.length ? (
          <p className="py-8 text-center text-sm text-slate-500">暂无素材，点击「新增素材」开始配置。</p>
        ) : (
          <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800">
            {visibleItems.map((it) => (
              <li key={it.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                <DecorMediaThumb item={it} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{it.title}</p>
                  <p className="truncate text-xs text-slate-500">
                    {PLATFORM_DECOR_SLOT_LABELS[it.slotKey] || it.slotKey}
                    {isDecorVideoMedia(it) ? ' · 视频' : ''}
                    {it.enabled ? '' : ' · 已停用'}
                  </p>
                  {PLATFORM_DECOR_SLOT_SIZE_HINTS[it.slotKey] ? (
                    <p className="truncate text-[11px] text-slate-600">
                      {PLATFORM_DECOR_SLOT_SIZE_HINTS[it.slotKey]}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="text-xs text-cyan-300 hover:underline"
                  onClick={() => setEditingId(it.id)}
                >
                  编辑
                </button>
                <button
                  type="button"
                  className="text-xs text-rose-300 hover:underline"
                  onClick={() => onRemove(it.id)}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
      </OpsEditableSection>

      {editing ? (
        <OpsEditableSection className="block space-y-4 rounded-xl border border-violet-500/30 bg-[var(--ops-panel)] p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">编辑素材</h2>
            <button type="button" className="text-xs text-slate-400 hover:text-white" onClick={() => setEditingId(null)}>
              收起
            </button>
          </div>

          <label className="block text-sm text-slate-300">
            槽位
            <select
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-white"
              value={editing.slotKey}
              onChange={(e) => patchItem(editing.id, { slotKey: e.target.value })}
            >
              {slotOptions.map((k) => (
                <option key={k} value={k}>
                  {(PLATFORM_DECOR_SLOT_LABELS[k] || k) +
                    (PLATFORM_DECOR_SLOT_SIZE_HINTS[k]
                      ? ` · ${PLATFORM_DECOR_SLOT_SIZE_HINTS[k].replace(/^建议\s*/, '')}`
                      : '')}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-amber-200/80">
              {PLATFORM_DECOR_SLOT_SIZE_HINTS[editing.slotKey] || '请按该位置实际展示比例出图'}
              ；视频与静图画幅一致即可。
            </p>
          </label>

          <label className="block text-sm text-slate-300">
            标题
            <input
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-white"
              value={editing.title}
              onChange={(e) => patchItem(editing.id, { title: e.target.value })}
            />
          </label>

          <div className="space-y-2">
            <p className="text-sm text-slate-300">海报素材（静图 / GIF / 视频）</p>
            {editing.imageUrl ? (
              <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-950/50">
                {isDecorVideoMedia(editing) ? (
                  <video
                    src={editing.imageUrl}
                    className="max-h-56 w-full object-contain"
                    controls
                    playsInline
                    muted
                  />
                ) : (
                  <img
                    src={editing.imageUrl}
                    alt=""
                    className="max-h-56 w-full object-contain"
                  />
                )}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"
              >
                {uploading ? '上传中…' : '本地上传到 OSS'}
              </button>
              {editing.imageUrl ? (
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => patchItem(editing.id, { imageUrl: '', mediaType: 'image' })}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-400 hover:text-white"
                >
                  清除素材
                </button>
              ) : null}
              <span className="text-[11px] text-slate-500">
                图片/GIF ≤8MB；视频 mp4/webm/mov ≤15MB
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,.gif,.mp4,.webm,.mov,.m4v"
              className="hidden"
              onChange={(e) => void onUpload(editing.id, e.target.files?.[0] || null)}
            />
            <label className="block text-xs text-slate-500">
              或粘贴已有 HTTPS 地址
              <input
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-white"
                placeholder="https://..."
                value={editing.imageUrl}
                onChange={(e) => {
                  const imageUrl = e.target.value
                  const mediaType: PlatformDecorMediaType = isDecorVideoMedia({
                    imageUrl,
                    mediaType: undefined,
                  })
                    ? 'video'
                    : 'image'
                  patchItem(editing.id, { imageUrl, mediaType })
                }}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-slate-300">
              跳转类型
              <select
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-white"
                value={editing.linkType}
                onChange={(e) =>
                  patchItem(editing.id, { linkType: e.target.value as PlatformDecorLinkType })
                }
              >
                <option value="none">无跳转</option>
                <option value="mp_path">小程序路径</option>
                <option value="web_url">网页 URL</option>
              </select>
            </label>
            <label className="block text-sm text-slate-300">
              跳转值
              <input
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-white"
                placeholder={editing.linkType === 'mp_path' ? '/pages/...' : 'https://...'}
                value={editing.linkValue || ''}
                onChange={(e) => patchItem(editing.id, { linkValue: e.target.value })}
              />
            </label>
          </div>

          {kind === 'popup' ? (
            <label className="block text-sm text-slate-300">
              频控
              <select
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-white"
                value={editing.freq || 'daily'}
                onChange={(e) => patchItem(editing.id, { freq: e.target.value as PlatformDecorFreq })}
              >
                <option value="once">关闭后不再显示</option>
                <option value="daily">每天最多一次</option>
                <option value="always">每次进首页可弹</option>
              </select>
            </label>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm text-slate-300">
              开始时间
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-white [color-scheme:dark]"
                value={toDatetimeLocalValue(editing.startAt)}
                onChange={(e) =>
                  patchItem(editing.id, { startAt: fromDatetimeLocalValue(e.target.value) })
                }
              />
            </label>
            <label className="block text-sm text-slate-300">
              结束时间
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-white [color-scheme:dark]"
                value={toDatetimeLocalValue(editing.endAt)}
                onChange={(e) =>
                  patchItem(editing.id, { endAt: fromDatetimeLocalValue(e.target.value) })
                }
              />
            </label>
            <label className="block text-sm text-slate-300">
              优先级（小优先）
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-white"
                value={editing.priority}
                onChange={(e) => patchItem(editing.id, { priority: Number(e.target.value) || 100 })}
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={editing.enabled}
              onChange={(e) => patchItem(editing.id, { enabled: e.target.checked })}
            />
            启用
          </label>
        </OpsEditableSection>
      ) : null}
    </div>
  )
}
