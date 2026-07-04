import { Loader2, Plus, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import {
  type AddonComplianceItem,
  type AddonComplianceMode,
  extractHttpUrl,
  isScriptFile,
  isVideoFile,
  newAddonComplianceItemId,
  readScriptFileText,
} from '../lib/addonAiComplianceReview'
import { readMpEmbedAddonAccess } from '../lib/mpEmbedAddonAccess'
import {
  checkScriptCompliance,
  checkVideoCompliance,
  formatScriptComplianceInline,
  formatVideoComplianceInline,
  getCheckingInlineStatus,
} from '../services/mpComplianceReviewClient'
import { uploadIceLocalMediaFile } from '../services/aliyunIceCloudApi'

const PLATFORM_OPTS = ['抖音', '小红书', '快手', '视频号']
const MERGED_TITLE = 'AI审核'
const MERGED_SUBTITLE =
  '文稿与短视频 AI 合规检核：支持 doc/txt/文档链接与探店成片，单条与批量导入。'

type Props = {
  /** 单模式入口（兼容旧路由）；默认合并页 */
  mode?: AddonComplianceMode
}

function resolveInitialMode(
  canScript: boolean,
  canVideo: boolean,
  hint?: AddonComplianceMode | null,
): AddonComplianceMode {
  if (hint === 'video' && canVideo) return 'video'
  if (hint === 'script' && canScript) return 'script'
  if (canScript) return 'script'
  return 'video'
}

function modePanelMeta(mode: AddonComplianceMode) {
  if (mode === 'video') {
    return {
      accept: 'video/*,.mp4,.mov,.m4v,.webm',
      fileHint: '支持 mp4 / mov 等视频文件，可多选批量导入',
      importLabel: '导入视频',
      showLink: false,
      emptyHint: '尚未导入视频。点击「导入视频」选择本地成片，可一次选多个批量检核。',
    }
  }
  return {
    accept: '.txt,.doc,.docx,text/plain',
    fileHint: '支持 txt / doc / docx，可多选批量导入',
    importLabel: '导入文稿',
    showLink: true,
    emptyHint: '尚未导入文稿。可上传 doc/txt 文件，或粘贴文档链接后批量 AI 检核。',
  }
}

export default function AiComplianceReviewAddonPage({ mode: legacyMode }: Props) {
  const access = readMpEmbedAddonAccess()
  const canScript = access.aiReview
  const canVideo = access.aiVideoReview
  const merged = !legacyMode && (canScript || canVideo)
  const urlMode =
    typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('mode') as AddonComplianceMode | null)
      : null

  const [activeMode, setActiveMode] = useState<AddonComplianceMode>(() =>
    legacyMode ?? resolveInitialMode(canScript, canVideo, urlMode),
  )
  const [scriptItems, setScriptItems] = useState<AddonComplianceItem[]>([])
  const [videoItems, setVideoItems] = useState<AddonComplianceItem[]>([])

  const mode = legacyMode ?? activeMode
  const panel = modePanelMeta(mode)
  const items = mode === 'video' ? videoItems : scriptItems
  const setItems = mode === 'video' ? setVideoItems : setScriptItems
  const showTabs = merged && canScript && canVideo

  const fileRef = useRef<HTMLInputElement>(null)
  const [platform, setPlatform] = useState('抖音')
  const [linkInput, setLinkInput] = useState('')
  const [batchBusy, setBatchBusy] = useState(false)
  const [busyId, setBusyId] = useState('')

  const batchTargets = useMemo(
    () => items.filter((it) => it.status !== 'uploading' && it.status !== 'checking'),
    [items],
  )

  function patchItem(id: string, patch: Partial<AddonComplianceItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }

  async function onPickFiles(files: FileList | null) {
    if (!files?.length) return
    const next: AddonComplianceItem[] = []
    for (const file of Array.from(files)) {
      if (mode === 'video' && !isVideoFile(file)) continue
      if (mode === 'script' && !isScriptFile(file)) continue
      next.push({
        id: newAddonComplianceItemId(),
        label: file.name || '未命名',
        kind: 'file',
        file,
        status: 'idle',
      })
    }
    if (!next.length) {
      window.alert(mode === 'video' ? '请选择视频文件' : '请选择 txt/doc/docx 文稿')
      return
    }
    setItems((prev) => [...prev, ...next])
  }

  function onAddLink() {
    const link = extractHttpUrl(linkInput)
    if (!link || !/^https?:\/\//i.test(link)) {
      window.alert('请填写有效的文档链接')
      return
    }
    setItems((prev) => [
      ...prev,
      {
        id: newAddonComplianceItemId(),
        label: '文档链接',
        kind: 'link',
        scriptLinkUrl: link,
        status: 'idle',
      },
    ])
    setLinkInput('')
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  async function prepareItem(item: AddonComplianceItem): Promise<AddonComplianceItem> {
    if (mode === 'video') {
      if (item.videoUrl) return item
      if (!item.file) throw new Error('缺少视频文件')
      patchItem(item.id, { status: 'uploading', statusText: '上传中…', statusTone: 'checking' })
      const up = await uploadIceLocalMediaFile(item.file)
      if (!up.ok) throw new Error(up.message)
      return { ...item, videoUrl: up.mediaUrl, status: 'idle' }
    }
    if (item.scriptLinkUrl) return item
    if (item.scriptText) return item
    if (!item.file) throw new Error('缺少文稿文件')
    const scriptText = await readScriptFileText(item.file)
    if (!scriptText.trim()) throw new Error('文稿内容为空，请检查文件')
    return { ...item, scriptText }
  }

  async function runCheck(item: AddonComplianceItem) {
    const prepared = await prepareItem(item)
    patchItem(item.id, { ...prepared, status: 'checking', ...getCheckingInlineStatus() })
    if (mode === 'video') {
      const res = await checkVideoCompliance({
        mpOrderId: 'addon',
        applicantId: prepared.id,
        platform,
        applicantName: prepared.label,
        videoUrl: prepared.videoUrl,
      })
      const st = formatVideoComplianceInline(res)
      patchItem(item.id, {
        status: 'done',
        statusText: st.text,
        statusTone: st.tone,
        detail: String(res.message || ''),
        videoUrl: prepared.videoUrl,
      })
      return
    }
    const res = await checkScriptCompliance({
      mpOrderId: 'addon',
      applicantId: prepared.id,
      platform,
      applicantName: prepared.label,
      scriptLinkUrl: prepared.scriptLinkUrl,
      scriptText: prepared.scriptText,
    })
    const st = formatScriptComplianceInline(res)
    patchItem(item.id, {
      status: 'done',
      statusText: st.text,
      statusTone: st.tone,
      detail: String(res.message || ''),
      scriptText: prepared.scriptText,
      scriptLinkUrl: prepared.scriptLinkUrl,
    })
  }

  async function onCheckOne(item: AddonComplianceItem) {
    if (busyId || batchBusy) return
    setBusyId(item.id)
    try {
      await runCheck(item)
    } catch (e) {
      patchItem(item.id, {
        status: 'error',
        statusText: e instanceof Error ? e.message : '检核失败',
        statusTone: 'warn',
      })
    } finally {
      setBusyId('')
    }
  }

  async function onBatchCheck() {
    if (batchBusy || busyId || !batchTargets.length) return
    setBatchBusy(true)
    let failed = 0
    try {
      for (const item of batchTargets) {
        setBusyId(item.id)
        try {
          await runCheck(item)
        } catch {
          failed += 1
          patchItem(item.id, { status: 'error', statusText: '检核失败', statusTone: 'warn' })
        }
      }
      if (failed > 0) window.alert(`批量检核完成，${failed} 条失败，请稍后重试单条检核`)
    } finally {
      setBusyId('')
      setBatchBusy(false)
    }
  }

  const pageTitle = merged ? MERGED_TITLE : mode === 'video' ? 'AI短视频审核' : 'AI审核'
  const pageSubtitle = merged
    ? MERGED_SUBTITLE
    : mode === 'video'
      ? '导入探店成片，AI 检核口播/字幕/画面违规风险，支持单条与批量检核。'
      : '导入 doc/txt 文稿或腾讯文档/飞书链接，逻辑与内置文稿审核 AI 检核一致，支持批量。'

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700">
          <ShieldCheck className="h-3.5 w-3.5" />
          星选增值 · AI 合规检核
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{pageTitle}</h1>
        <p className="text-sm text-[var(--shell-muted)]">{pageSubtitle}</p>
      </header>

      {showTabs ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === 'script'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'border border-[var(--shell-border)] text-[var(--shell-muted)] hover:bg-[var(--shell-hover)]'
            }`}
            onClick={() => setActiveMode('script')}
          >
            文稿审核
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === 'video'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'border border-[var(--shell-border)] text-[var(--shell-muted)] hover:bg-[var(--shell-hover)]'
            }`}
            onClick={() => setActiveMode('video')}
          >
            短视频审核
          </button>
        </div>
      ) : null}

      <section className="surface-card space-y-4 rounded-xl border p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-xs text-[var(--shell-muted)]">
            目标平台
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="mt-1 block rounded-lg border border-[var(--shell-border)] bg-transparent px-3 py-2 text-sm"
            >
              {PLATFORM_OPTS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            {panel.importLabel}
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={panel.accept}
            className="hidden"
            onChange={(e) => {
              void onPickFiles(e.target.files)
              e.target.value = ''
            }}
          />
          {batchTargets.length > 0 ? (
            <button
              type="button"
              disabled={batchBusy || !!busyId}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
              onClick={() => void onBatchCheck()}
            >
              {batchBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {batchBusy ? '批量检核中…' : `AI批量检核（${batchTargets.length}）`}
            </button>
          ) : null}
        </div>
        <p className="text-xs text-[var(--shell-muted)]">{panel.fileHint}</p>

        {panel.showLink ? (
          <div className="flex flex-wrap gap-2">
            <input
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              placeholder="粘贴腾讯文档 / 飞书文档链接"
              className="min-w-[240px] flex-1 rounded-lg border border-[var(--shell-border)] bg-transparent px-3 py-2 text-sm"
            />
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm hover:bg-[var(--shell-hover)]"
              onClick={onAddLink}
            >
              <Plus className="h-4 w-4" />
              添加链接
            </button>
          </div>
        ) : null}
      </section>

      {!items.length ? (
        <div className="surface-card rounded-xl border p-8 text-center text-sm text-[var(--shell-muted)]">
          {panel.emptyHint}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article key={item.id} className="surface-card rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium break-all">{item.label}</h3>
                  {item.scriptLinkUrl ? (
                    <p className="mt-1 text-xs text-violet-600 break-all">{item.scriptLinkUrl}</p>
                  ) : null}
                  {item.detail ? (
                    <p className="mt-2 text-xs text-[var(--shell-muted)] whitespace-pre-wrap">{item.detail}</p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {item.statusText ? (
                    <span className={`vr-ai-status vr-ai-status--${item.statusTone || 'checking'}`}>
                      {item.statusText}
                    </span>
                  ) : null}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === item.id || batchBusy || item.status === 'uploading'}
                      className="text-sm rounded-lg border border-emerald-500/40 px-3 py-1.5 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                      onClick={() => void onCheckOne(item)}
                    >
                      {busyId === item.id ? '检核中…' : 'AI检核'}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.id || batchBusy}
                      className="text-sm rounded-lg border px-3 py-1.5 text-[var(--shell-muted)] hover:bg-[var(--shell-hover)] disabled:opacity-50"
                      onClick={() => removeItem(item.id)}
                      aria-label="移除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
