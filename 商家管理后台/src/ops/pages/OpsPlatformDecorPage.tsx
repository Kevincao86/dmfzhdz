import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchRegistry } from '../opsRegistryApi'
import { resolvePlatformDecoration } from '../../meooRegistryShared/platformDecorRegistryCore.js'
import {
  MP_HOME_BANNER_MAX,
  PLATFORM_DECOR_SLOT_KEYS,
  PLATFORM_DECOR_SLOT_LABELS,
  PLATFORM_DECOR_SLOT_SIZE_HINTS,
  normalizeCarouselSeconds,
  isCarouselBannerSlot,
  isDecorVideoMedia,
  isLaunchSplashSlot,
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

function bannerAudience(ids?: string[]): 'all' | 'talent' | 'pr' {
  const list = (ids || []).map((x) => String(x || '').trim()).filter(Boolean)
  if (!list.length || list.includes('all')) return 'all'
  if (list.length === 1 && list[0] === 'pr') return 'pr'
  if (list.length === 1 && list[0] === 'talent') return 'talent'
  return 'all'
}

function bannerAudienceLabel(ids?: string[]) {
  const v = bannerAudience(ids)
  if (v === 'pr') return '仅 PR'
  if (v === 'talent') return '仅达人'
  return '全部身份'
}

const MARKETING_JUMPS = [
  { kind: 'cash', label: '现金红包' },
  { kind: 'version_discount', label: '版本折扣' },
  { kind: 'pr_plan', label: 'PR版本活动' },
  { kind: 'talent_plan', label: '达人版活动' },
  { kind: 'member_bonus', label: '会员加赠' },
  { kind: 'flash_open', label: '限时开通' },
] as const

function marketingSurfaceForSlot(slotKey: string): 'xingxuan' | 'merchant_erp' {
  if (slotKey.startsWith('cs.') || slotKey.startsWith('erp.')) return 'merchant_erp'
  return 'xingxuan'
}

function marketingKindOf(linkValue?: string) {
  const kind = String(linkValue || '').split(':')[1] || ''
  return MARKETING_JUMPS.some((item) => item.kind === kind) ? kind : 'cash'
}

function marketingLinkValue(slotKey: string, kind: string) {
  return `${marketingSurfaceForSlot(slotKey)}:${kind}`
}

function marketingJumpLabel(linkValue?: string) {
  const kind = marketingKindOf(linkValue)
  return MARKETING_JUMPS.find((item) => item.kind === kind)?.label || '营销活动'
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

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

type DecorDateParts = { y: string; m: string; d: string; h: string; min: string }

function partsFromIso(iso?: string): DecorDateParts {
  const local = toDatetimeLocalValue(iso)
  if (!local) return { y: '', m: '', d: '', h: '', min: '' }
  const [date, time] = local.split('T')
  const [y, m, d] = date.split('-')
  const [h, min] = (time || '').split(':')
  return { y, m, d, h: h || '00', min: min || '00' }
}

function isoFromParts(p: DecorDateParts): string | undefined {
  if (!p.y || !p.m || !p.d) return undefined
  const h = p.h || '00'
  const min = p.min || '00'
  const d = new Date(Number(p.y), Number(p.m) - 1, Number(p.d), Number(h), Number(min), 0, 0)
  if (Number.isNaN(d.getTime()) || d.getMonth() !== Number(p.m) - 1) return undefined
  return d.toISOString()
}

function DecorDateTimeField({
  label,
  iso,
  onChange,
}: {
  label: string
  iso?: string
  onChange: (next?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [parts, setParts] = useState<DecorDateParts>(() => partsFromIso(iso))
  useEffect(() => {
    setParts(partsFromIso(iso))
  }, [iso])
  const display =
    parts.y || parts.m || parts.d || parts.h || parts.min
      ? `${parts.y || '----'}年${parts.m || '--'}月${parts.d || '--'}日 ${parts.h || '--'}:${parts.min || '--'}`
      : '点击选择日期和时间'
  const yearNow = new Date().getFullYear()
  const years = Array.from({ length: 6 }, (_, i) => String(yearNow - 1 + i))
  const months = Array.from({ length: 12 }, (_, i) => pad2(i + 1))
  const days = Array.from({ length: 31 }, (_, i) => pad2(i + 1))
  const hours = Array.from({ length: 24 }, (_, i) => pad2(i))
  const minuteSet = new Set(Array.from({ length: 12 }, (_, i) => pad2(i * 5)))
  if (parts.min) minuteSet.add(parts.min)
  const minutes = [...minuteSet].sort()

  function setPart(key: keyof DecorDateParts, value: string) {
    const next = { ...parts, [key]: value }
    setParts(next)
    if (!next.y || !next.m || !next.d) return
    const isoNext = isoFromParts(next)
    if (isoNext) onChange(isoNext)
  }

  return (
    <div className="ops-label relative">
      {label}
      <button
        type="button"
        className="ops-field mt-1 flex w-full items-center justify-between text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={parts.y || parts.m || parts.d || parts.h || parts.min ? '' : 'text-[var(--ops-muted)]'}>
          {display}
        </span>
        <span className="text-xs text-[var(--ops-muted)]">{open ? '收起' : '选择'}</span>
      </button>
      {open ? (
        <div className="absolute left-0 z-40 mt-1 w-72 space-y-2 rounded-lg border border-[var(--ops-border)] bg-[var(--ops-panel)] p-3 shadow-lg">
          <p className="text-xs text-[var(--ops-muted)]">日期</p>
          <div className="grid grid-cols-3 gap-2">
            <select className="ops-field" value={parts.y} onChange={(e) => setPart('y', e.target.value)}>
              <option value="">年</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <select className="ops-field" value={parts.m} onChange={(e) => setPart('m', e.target.value)}>
              <option value="">月</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select className="ops-field" value={parts.d} onChange={(e) => setPart('d', e.target.value)}>
              <option value="">日</option>
              {days.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-[var(--ops-muted)]">时间</p>
          <div className="grid grid-cols-2 gap-2">
            <select className="ops-field" value={parts.h} onChange={(e) => setPart('h', e.target.value)}>
              <option value="">时</option>
              {hours.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <select className="ops-field" value={parts.min} onChange={(e) => setPart('min', e.target.value)}>
              <option value="">分</option>
              {minutes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-between pt-1">
            <button
              type="button"
              className="text-xs text-[var(--ops-muted)]"
              onClick={() => {
                setParts({ y: '', m: '', d: '', h: '', min: '' })
                onChange(undefined)
                setOpen(false)
              }}
            >
              清除
            </button>
            <button type="button" className="text-xs text-[var(--ops-accent)]" onClick={() => setOpen(false)}>
              完成
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
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
    ...(isLaunchSplashSlot(slotKey) ? { playSeconds: 3 as const } : {}),
    ...(isCarouselBannerSlot(slotKey) ? { carouselSeconds: 4 } : {}),
    priority: 100,
    updatedAt: nowIsoLocal(),
  }
}

function DecorMediaThumb({ item }: { item: RegistryPlatformDecorItem }) {
  if (!item.imageUrl) {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded border border-[var(--ops-border)] bg-[var(--ops-hover)] text-[10px] text-[var(--ops-muted)]">
        无素材
      </div>
    )
  }
  if (isDecorVideoMedia(item)) {
    return (
      <video
        src={item.imageUrl}
        className="h-12 w-12 rounded border border-[var(--ops-border)] object-cover"
        muted
        playsInline
        preload="metadata"
      />
    )
  }
  return (
    <img
      src={item.imageUrl}
      alt=""
      className="h-12 w-12 rounded border border-[var(--ops-border)] object-cover"
    />
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

  function bannerCount(list: RegistryPlatformDecorItem[], slotKey: string) {
    return list.filter((it) => it.slotKey === slotKey).length
  }

  function onAdd() {
    const slotKey = slotOptions[0] || 'mp.home.popup'
    if (isCarouselBannerSlot(slotKey) && bannerCount(items, slotKey) >= MP_HOME_BANNER_MAX) {
      window.alert(`首页海报轮播最多 ${MP_HOME_BANNER_MAX} 张`)
      return
    }
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
    if (bannerCount(items, 'mp.home.banner') > MP_HOME_BANNER_MAX || bannerCount(items, 'erp.mp.home.banner') > MP_HOME_BANNER_MAX) {
      setMsg(`首页海报最多 ${MP_HOME_BANNER_MAX} 张，请删除多余素材后再保存`)
      return
    }
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
    <div className="mx-auto max-w-4xl space-y-6 text-[var(--ops-text)]">
      <div>
        <h1 className="ops-page-title text-xl font-semibold">
          {kind === 'popup' ? '海报弹窗' : '页面广告位'}
        </h1>
        <p className="ops-muted mt-1 text-sm">
          {kind === 'popup'
            ? '活动海报首页弹窗：与公告弹窗互斥，优先紧急/入选/档期类通知。支持 once / daily / always 频控。素材支持静图、GIF、短视频（OSS）。'
            : `达人小程序首页海报最多 ${MP_HOME_BANNER_MAX} 张（当前 ${bannerCount(items, 'mp.home.banner')}），商家小程序首页海报同样最多 ${MP_HOME_BANNER_MAX} 张（当前 ${bannerCount(items, 'erp.mp.home.banner')}）。都启用后按优先级从小到大轮播，每张单独设置跳转，整组共用一个轮播时长。其它广告位仍取优先级最小的一条。开屏海报在打开小程序时全屏播放，时长 3 秒或 5 秒，到时关闭，也可点跳过。素材支持静图、GIF、短视频（OSS）。`}
        </p>
        <ul className="ops-size-hint-box space-y-1">
          {slotOptions.map((k) => (
            <li key={k}>
              <strong>{PLATFORM_DECOR_SLOT_LABELS[k] || k}</strong>
              {' · '}
              {PLATFORM_DECOR_SLOT_SIZE_HINTS[k] || '按展示比例出图'}
            </li>
          ))}
        </ul>
      </div>

      <OpsEditableSection className="block space-y-4 rounded-xl border border-[var(--ops-border)] bg-[var(--ops-panel)] p-5 shadow-[var(--ops-card-shadow)]">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={onAdd} className="ops-btn-soft">
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
          {updatedAt ? <span className="ops-hint">上次保存：{updatedAt}</span> : null}
        </div>
        {msg ? <p className="ops-hint-warn text-sm">{msg}</p> : null}

        {!visibleItems.length ? (
          <p className="ops-muted py-8 text-center text-sm">暂无素材，点击「新增素材」开始配置。</p>
        ) : (
          <ul className="divide-y divide-[var(--ops-border)] rounded-lg border border-[var(--ops-border)]">
            {visibleItems.map((it) => (
              <li key={it.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                <DecorMediaThumb item={it} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--ops-text)]">{it.title}</p>
                  <p className="ops-muted truncate text-xs">
                    {PLATFORM_DECOR_SLOT_LABELS[it.slotKey] || it.slotKey}
                    {isDecorVideoMedia(it) ? ' · 视频' : ''}
                    {isLaunchSplashSlot(it.slotKey) ? ` · ${it.playSeconds === 5 ? 5 : 3}秒` : ''}
                    {isCarouselBannerSlot(it.slotKey)
                      ? ` · 每张 ${normalizeCarouselSeconds(it.carouselSeconds)} 秒`
                      : ''}
                    {it.slotKey === 'mp.home.banner' ? ` · ${bannerAudienceLabel(it.identities)}` : ''}
                    {isCarouselBannerSlot(it.slotKey) && it.linkType === 'marketing'
                      ? ` · 跳转${marketingJumpLabel(it.linkValue)}`
                      : isCarouselBannerSlot(it.slotKey) && it.linkType !== 'none' && it.linkValue
                        ? ' · 已设跳转'
                        : ''}
                    {it.enabled ? '' : ' · 已停用'}
                  </p>
                  {PLATFORM_DECOR_SLOT_SIZE_HINTS[it.slotKey] ? (
                    <p className="ops-hint truncate text-[11px]">
                      {PLATFORM_DECOR_SLOT_SIZE_HINTS[it.slotKey]}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="text-xs font-medium text-[var(--ops-accent)] hover:underline"
                  onClick={() => setEditingId(it.id)}
                >
                  编辑
                </button>
                <button
                  type="button"
                  className="text-xs font-medium text-[var(--ops-danger)] hover:underline"
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
        <OpsEditableSection className="block space-y-4 rounded-xl border border-[var(--ops-border)] bg-[var(--ops-panel)] p-5 shadow-[var(--ops-card-shadow)] ring-1 ring-[var(--ops-accent-soft)]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--ops-text)]">编辑素材</h2>
            <button
              type="button"
              className="ops-muted text-xs hover:text-[var(--ops-text)]"
              onClick={() => setEditingId(null)}
            >
              收起
            </button>
          </div>

          <label className="ops-label">
            槽位
            <select
              className="ops-field mt-1"
              value={editing.slotKey}
              onChange={(e) => {
                const slotKey = e.target.value
                if (isCarouselBannerSlot(slotKey)) {
                  const others = items.filter(
                    (it) => it.slotKey === slotKey && it.id !== editing.id,
                  ).length
                  if (others >= MP_HOME_BANNER_MAX) {
                    window.alert(`首页海报轮播最多 ${MP_HOME_BANNER_MAX} 张，请先删除一张`)
                    return
                  }
                }
                const sharedSeconds =
                  items.find((it) => it.slotKey === slotKey && it.id !== editing.id)
                    ?.carouselSeconds ?? 4
                patchItem(editing.id, {
                  slotKey,
                  ...(isLaunchSplashSlot(slotKey) ? { playSeconds: editing.playSeconds === 5 ? 5 : 3 } : {}),
                  ...(isCarouselBannerSlot(slotKey)
                    ? { carouselSeconds: normalizeCarouselSeconds(editing.carouselSeconds ?? sharedSeconds) }
                    : {}),
                  ...(editing.linkType === 'marketing'
                    ? { linkValue: marketingLinkValue(slotKey, marketingKindOf(editing.linkValue)) }
                    : {}),
                })
              }}
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
            <p className="ops-hint-warn mt-1.5">
              {PLATFORM_DECOR_SLOT_SIZE_HINTS[editing.slotKey] || '请按该位置实际展示比例出图'}
              ；视频与静图画幅一致即可。
            </p>
          </label>

          <label className="ops-label">
            标题
            <input
              className="ops-field mt-1"
              value={editing.title}
              onChange={(e) => patchItem(editing.id, { title: e.target.value })}
            />
          </label>

          <div className="space-y-2">
            <p className="ops-label">海报素材（静图 / GIF / 视频）</p>
            {editing.imageUrl ? (
              <div className="overflow-hidden rounded-lg border border-[var(--ops-border)] bg-[var(--ops-hover)]">
                {isDecorVideoMedia(editing) ? (
                  <video
                    src={editing.imageUrl}
                    className="max-h-56 w-full object-contain"
                    controls
                    playsInline
                    muted
                  />
                ) : (
                  <img src={editing.imageUrl} alt="" className="max-h-56 w-full object-contain" />
                )}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="ops-btn-soft"
              >
                {uploading ? '上传中…' : '本地上传到 OSS'}
              </button>
              {editing.imageUrl ? (
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => patchItem(editing.id, { imageUrl: '', mediaType: 'image' })}
                  className="rounded-lg border border-[var(--ops-border)] px-3 py-1.5 text-sm text-[var(--ops-muted)] hover:text-[var(--ops-text)]"
                >
                  清除素材
                </button>
              ) : null}
              <span className="ops-hint text-[11px]">图片/GIF ≤8MB；视频 mp4/webm/mov ≤15MB</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,.gif,.mp4,.webm,.mov,.m4v"
              className="hidden"
              onChange={(e) => void onUpload(editing.id, e.target.files?.[0] || null)}
            />
            <label className="ops-hint block">
              或粘贴已有 HTTPS 地址
              <input
                className="ops-field mt-1"
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
            <label className="ops-label">
              跳转类型
              <select
                className="ops-field mt-1"
                value={editing.linkType}
                onChange={(e) => {
                  const linkType = e.target.value as PlatformDecorLinkType
                  patchItem(editing.id, {
                    linkType,
                    ...(linkType === 'marketing'
                      ? { linkValue: marketingLinkValue(editing.slotKey, marketingKindOf(editing.linkValue)) }
                      : {}),
                  })
                }}
              >
                <option value="none">无跳转</option>
                <option value="mp_path">小程序路径</option>
                <option value="web_url">网页 URL</option>
                {kind !== 'popup' ? <option value="marketing">营销活动</option> : null}
              </select>
            </label>
            {editing.linkType === 'marketing' ? (
              <label className="ops-label">
                营销活动
                <select
                  className="ops-field mt-1"
                  value={marketingKindOf(editing.linkValue)}
                  onChange={(e) =>
                    patchItem(editing.id, { linkValue: marketingLinkValue(editing.slotKey, e.target.value) })
                  }
                >
                  {MARKETING_JUMPS.map((item) => (
                    <option key={item.kind} value={item.kind}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <p className="ops-hint mt-1">点这张广告图打开对应活动。商家广告位进商家侧，达人和星选广告位进星选侧。</p>
              </label>
            ) : (
            <label className="ops-label">
              跳转值
              <input
                className="ops-field mt-1"
                placeholder={editing.linkType === 'mp_path' ? '/pages/...' : 'https://...'}
                value={editing.linkValue || ''}
                onChange={(e) => patchItem(editing.id, { linkValue: e.target.value })}
              />
            </label>
            )}
          </div>
          {isCarouselBannerSlot(editing.slotKey) ? (
            <p className="ops-hint">这一张单独跳转。最多 {MP_HOME_BANNER_MAX} 张，下面的秒数整组共用。</p>
          ) : null}

          {editing.slotKey === 'mp.home.banner' ? (
            <label className="ops-label">
              展示身份
              <select
                className="ops-field mt-1"
                value={bannerAudience(editing.identities)}
                onChange={(e) => {
                  const v = e.target.value
                  patchItem(editing.id, {
                    identities: v === 'pr' ? ['pr'] : v === 'talent' ? ['talent'] : ['all'],
                  })
                }}
              >
                <option value="all">全部身份</option>
                <option value="talent">达人</option>
                <option value="pr">PR</option>
              </select>
              <p className="ops-hint mt-1">只有选中的身份能在首页看到这张海报。选全部，达人、PR、拍摄和剪辑都能看到。</p>
            </label>
          ) : null}

          {isCarouselBannerSlot(editing.slotKey) ? (
            <label className="ops-label">
              轮播时长（秒）
              <input
                type="number"
                min={2}
                max={30}
                className="ops-field mt-1"
                value={normalizeCarouselSeconds(editing.carouselSeconds)}
                onChange={(e) => {
                  const carouselSeconds = normalizeCarouselSeconds(e.target.value)
                  setItems((prev) =>
                    prev.map((it) =>
                      it.slotKey === editing.slotKey
                        ? { ...it, carouselSeconds, updatedAt: nowIsoLocal() }
                        : it,
                    ),
                  )
                }}
              />
              <p className="ops-hint mt-1">2–30 秒。改这一张，同组海报一起改。</p>
            </label>
          ) : null}

          {isLaunchSplashSlot(editing.slotKey) ? (
            <label className="ops-label">
              播放时长
              <select
                className="ops-field mt-1"
                value={editing.playSeconds === 5 ? 5 : 3}
                onChange={(e) =>
                  patchItem(editing.id, { playSeconds: Number(e.target.value) === 5 ? 5 : 3 })
                }
              >
                <option value={3}>3 秒（到时关闭，可跳过）</option>
                <option value={5}>5 秒（到时关闭，可跳过）</option>
              </select>
            </label>
          ) : null}

          {kind === 'popup' ? (
            <label className="ops-label">
              频控
              <select
                className="ops-field mt-1"
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
            <DecorDateTimeField
              label="开始时间"
              iso={editing.startAt}
              onChange={(startAt) => patchItem(editing.id, { startAt })}
            />
            <DecorDateTimeField
              label="结束时间"
              iso={editing.endAt}
              onChange={(endAt) => patchItem(editing.id, { endAt })}
            />
            <label className="ops-label">
              优先级（小优先）
              <input
                type="number"
                className="ops-field mt-1"
                value={editing.priority}
                onChange={(e) => patchItem(editing.id, { priority: Number(e.target.value) || 100 })}
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-[var(--ops-text)]">
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
