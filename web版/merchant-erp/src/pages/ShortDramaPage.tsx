import { Download, Film, Loader2, Sparkles, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../cn'
import { MpAddonPointsRateBadge } from '../components/MpAddonPointsRateBadge'
import { MembershipMediaLockedBanner, useMembership } from '../context/MembershipContext'
import { readMpSessionToken } from '../lib/merchantApiAuth'
import { probeVideoDurationSec } from '../lib/digitalHumanSubtitle'
import { sanitizePromptForSeedanceNativeAv } from '../lib/shortVideoPostProcess'
import {
  SEEDANCE_1_5_PRO_MODEL_ID,
  SEEDANCE_2_0_MODEL_ID,
  SEEDANCE_QUALITY_OPTIONS,
  VIDEO_ENGINE_LABEL_SEEDANCE,
  type SeedanceQualityId,
} from '../lib/shortVideoUiLabels'
import {
  checkMpAddonPointsAffordable,
  formatMpAddonPointsSpendHint,
  spendMpAddonPoints,
} from '../services/mpAddonPointsSpendClient'
import {
  downloadVideoUrlAsBlob,
  fetchVideoAiConfig,
  formatVideoAiUserError,
  runShortVideoJobWithFailover,
  type VideoAiBackendConfig,
} from '../services/videoAiApi'

type DramaTypeId = 'hook' | 'twist' | 'workplace' | 'romance' | 'teaser'
type MainTab = 'create' | 'works'

type DramaWork = {
  id: string
  title: string
  previewUrl: string
  createdAt: number
}

const DRAMA_TYPES: { id: DramaTypeId; name: string; hint: string; structure: string }[] = [
  {
    id: 'hook',
    name: '冲突钩子',
    hint: '前 3 秒冲突，悬念定格',
    structure: '角色亮相 → 意外/冲突 → 情绪顶点 → 悬念定格（引导完播/下集）',
  },
  {
    id: 'twist',
    name: '反转开场',
    hint: '先以为是 A，立刻打脸成 B',
    structure: '误导开场 → 打脸反转 → 真相落地 → 一句钩子定格',
  },
  {
    id: 'workplace',
    name: '职场爽剧',
    hint: '打脸 / 拆台 / 当场翻盘',
    structure: '被压/被嘲 → 证据或实力亮相 → 当场打脸 → 身份反差定格',
  },
  {
    id: 'romance',
    name: '情感悬念',
    hint: '一句对白把关系掀翻',
    structure: '亲密或冷战开场 → 一句关键对白 → 情绪决堤 → 未说完的悬念',
  },
  {
    id: 'teaser',
    name: '下集预告',
    hint: '本集高潮切黑，留钩子',
    structure: '高潮碎片闪回 → 最大冲突瞬间 → 突然切黑 → 旁白预告下集',
  },
]

const DURATION_OPTIONS = [8, 12, 15] as const

function newWorkId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `drama-${Date.now()}`
}

function buildDramaPrompt(input: {
  type: (typeof DRAMA_TYPES)[number]
  story: string
  roles: string
  conflict: string
  dialogue: string
  durationSec: number
}): string {
  const dialogue = input.dialogue.trim()
  const quoted = dialogue ? `对白钩子：${dialogue.includes('"') ? dialogue : `"${dialogue}"`}。` : ''
  return [
    `【AI短剧·${input.type.name}】`,
    `主题：${input.story.trim()}，前 3 秒必须有冲突或反转。`,
    input.roles.trim() ? `角色：${input.roles.trim()}。` : '',
    input.conflict.trim() ? `核心冲突：${input.conflict.trim()}。` : '',
    quoted,
    `结构：${input.type.structure}。`,
    `时长约 ${input.durationSec} 秒，竖屏 9:16，人物表情清晰、运镜跟拍，禁止拖沓空镜。`,
    '口播/对白短、狠、口语；可加一句旁白钩子。禁止电影片头、禁止片尾演职员表。',
  ]
    .filter(Boolean)
    .join('\n')
}

function isSeedance15ProModelId(id: string): boolean {
  const t = String(id || '').trim()
  return (
    t === SEEDANCE_1_5_PRO_MODEL_ID ||
    /seedance-1-5-pro/i.test(t) ||
    /seedance-1\.5-pro/i.test(t)
  )
}

function isSeedance20ModelId(id: string): boolean {
  return /seedance-2-0|seedance-2\.0|seedance-2-5|seedance-2\.5/i.test(String(id || ''))
}

/** 商家 CS：AI 创作 · AI短剧（独立工坊，不复用短视频创作台） */
export default function ShortDramaPage() {
  const { plan, requireAiVideoGen, openMembershipUpgrade } = useMembership()
  const [mainTab, setMainTab] = useState<MainTab>('create')
  const [dramaTypeId, setDramaTypeId] = useState<DramaTypeId>('hook')
  const [story, setStory] = useState('')
  const [roles, setRoles] = useState('')
  const [conflict, setConflict] = useState('')
  const [dialogue, setDialogue] = useState('')
  const [durationSec, setDurationSec] = useState<(typeof DURATION_OPTIONS)[number]>(12)
  const [resolution, setResolution] = useState<SeedanceQualityId>('720p')
  const [cfg, setCfg] = useState<VideoAiBackendConfig | null>(null)
  const [cfgLoaded, setCfgLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [works, setWorks] = useState<DramaWork[]>([])
  const [activeWorkId, setActiveWorkId] = useState<string | null>(null)
  const cancelRef = useRef(false)
  const mountedRef = useRef(true)
  const previewUrlsRef = useRef<string[]>([])

  const dramaType = DRAMA_TYPES.find((t) => t.id === dramaTypeId) ?? DRAMA_TYPES[0]!
  const activeWork = works.find((w) => w.id === activeWorkId) ?? works[0] ?? null

  const promptPreview = useMemo(
    () =>
      buildDramaPrompt({
        type: dramaType,
        story: story.trim() || '{一句话故事}',
        roles,
        conflict,
        dialogue,
        durationSec,
      }),
    [dramaType, story, roles, conflict, dialogue, durationSec],
  )

  const seedancePoolModels = useMemo(() => {
    const raw = (cfg?.arkVideoModels.map((m) => m.endpointId) ?? []).filter((id) => {
      const t = String(id || '').trim()
      if (!t) return false
      if (/^wan[\d._-]/i.test(t) || (/t2v|i2v/i.test(t) && /^wan/i.test(t))) return false
      return true
    })
    const pro15 = raw.filter(isSeedance15ProModelId)
    const fallback20 = raw.filter((id) => isSeedance20ModelId(id) && !/mini/i.test(id))
    const ordered = [...pro15, ...fallback20]
    return ordered.length > 0
      ? ordered
      : [SEEDANCE_1_5_PRO_MODEL_ID, SEEDANCE_2_0_MODEL_ID, 'doubao-seedance-2-0-fast-260128']
  }, [cfg?.arkVideoModels])

  const gateReason = useMemo((): string | null => {
    if (busy) return '正在生成短剧，请稍候…'
    if (!cfgLoaded) return '正在加载视频引擎配置…'
    if (cfg?.configLoadError) return `视频配置加载失败：${cfg.configLoadError.slice(0, 120)}`
    if (!cfg?.arkKeyConfigured) {
      return `当前环境未开通${VIDEO_ENGINE_LABEL_SEEDANCE}，请在运营台配置后再生成。`
    }
    if (!(cfg?.arkVideoModels?.length ?? 0)) {
      return '视频服务已配置但未设置模型端点，请在运营台 · 短剧 AI 制作中完成配置。'
    }
    if (!story.trim()) return '请先写一句话故事。'
    return null
  }, [busy, cfgLoaded, cfg, story])

  useEffect(() => {
    mountedRef.current = true
    void fetchVideoAiConfig()
      .then((c) => {
        if (mountedRef.current) setCfg(c)
      })
      .finally(() => {
        if (mountedRef.current) setCfgLoaded(true)
      })
    return () => {
      mountedRef.current = false
      previewUrlsRef.current.forEach((u) => URL.revokeObjectURL(u))
      previewUrlsRef.current = []
    }
  }, [])

  const chargePoints = useCallback(async (blob: Blob, billId: string, fallbackSec: number) => {
    let dur = Math.max(1, Math.ceil(Number(fallbackSec) || 1))
    try {
      const probed = await probeVideoDurationSec(blob)
      if (probed > 0.3) dur = Math.ceil(probed)
    } catch {
      /* use fallback */
    }
    try {
      const charge = await spendMpAddonPoints({
        kind: 'shortvideo',
        durationSec: dur,
        idempotencyKey: `shortdrama:${billId}`,
        note: `shortdrama:${billId}`,
      })
      if (!charge) return ''
      return formatMpAddonPointsSpendHint('shortvideo', charge, dur)
    } catch {
      return ''
    }
  }, [])

  const submitGenerate = async () => {
    if (!requireAiVideoGen()) return
    if (gateReason) {
      setErr(gateReason)
      setHint(null)
      setProgress(null)
      return
    }
    setErr(null)
    setHint(null)
    cancelRef.current = false
    const billId = newWorkId()
    setBusy(true)
    setProgress('正在检查积分与引擎…')
    const afford = await checkMpAddonPointsAffordable('shortvideo', durationSec)
    if (!afford.ok) {
      if (mountedRef.current) {
        setBusy(false)
        setProgress(null)
        setErr(afford.message)
      }
      return
    }

    const flags = `--dur ${durationSec} --fps 24 --ratio 9:16 --wm false --resolution ${resolution}`
    const prompt = sanitizePromptForSeedanceNativeAv(
      buildDramaPrompt({
        type: dramaType,
        story: story.trim(),
        roles,
        conflict,
        dialogue,
        durationSec,
      }),
    )
    setProgress('正在提交短剧生成任务…')
    try {
      const r = await runShortVideoJobWithFailover({
        engine: 'seedance',
        body: {
          prompt,
          flags,
          model: SEEDANCE_1_5_PRO_MODEL_ID,
          skip_qwen: true,
          lock_model: false,
          generate_audio: true,
        },
        poolModels: seedancePoolModels,
        shouldCancel: () => cancelRef.current,
        onProgress: (text) => {
          if (mountedRef.current) setProgress(text)
        },
        allowAutoHalveDuration: false,
      })
      if (!r.ok) {
        setErr(formatVideoAiUserError(r.message))
        return
      }
      if (cancelRef.current) {
        setHint('已停止等待；后台任务可能不会自动取消。')
        return
      }
      setProgress('正在拉取成片…')
      const blob = await downloadVideoUrlAsBlob(r.videoUrl, { maxAttempts: 3 })
      const previewUrl = URL.createObjectURL(blob)
      previewUrlsRef.current.push(previewUrl)
      const title = story.trim().slice(0, 24) || dramaType.name
      const work: DramaWork = {
        id: billId,
        title,
        previewUrl,
        createdAt: Date.now(),
      }
      setWorks((prev) => [work, ...prev])
      setActiveWorkId(work.id)
      setMainTab('works')
      const spendHint = await chargePoints(blob, billId, r.durationSecUsed ?? durationSec)
      setHint(
        [r.modelUsed ? `已使用视频模型：${r.modelUsed}` : '', spendHint].filter(Boolean).join(' · ') ||
          '成片已生成，请及时保存到本地。',
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      if (mountedRef.current) {
        setBusy(false)
        setProgress(null)
      }
    }
  }

  const cancelWait = () => {
    cancelRef.current = true
    setBusy(false)
    setProgress(null)
    setHint('已停止等待；后台任务可能不会自动取消。')
  }

  const downloadWork = (work: DramaWork) => {
    const a = document.createElement('a')
    a.href = work.previewUrl
    a.download = `ai短剧-${work.title.slice(0, 18)}.mp4`
    a.click()
  }

  const removeWork = (id: string) => {
    setWorks((prev) => {
      const next = prev.filter((w) => w.id !== id)
      const removed = prev.find((w) => w.id === id)
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl)
        previewUrlsRef.current = previewUrlsRef.current.filter((u) => u !== removed.previewUrl)
      }
      if (activeWorkId === id) setActiveWorkId(next[0]?.id ?? null)
      return next
    })
  }

  const fieldCls =
    'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 disabled:opacity-60'

  return (
    <div className="short-drama-page space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="relative pl-4">
          <span
            className="absolute left-0 top-1 h-[calc(100%-4px)] w-1 rounded-full bg-gradient-to-b from-violet-500 to-cyan-500"
            aria-hidden
          />
          <h1 className="erp-page-title">AI短剧</h1>
          <MpAddonPointsRateBadge kind="shortvideo" className="mt-2" />
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            写一句话故事和冲突钩子，直接出竖屏短剧。探店、套餐请走短视频 AI 处理；店员口播出镜请走数字人口播。
            {readMpSessionToken() ? (
              <span className="mt-1 block text-xs text-violet-700">
                星选账号：成片成功后按秒扣积分；套餐 ai_video_quota 次数优先，用尽后扣积分余额。
              </span>
            ) : null}
          </p>
          <div className="mt-2 max-w-2xl">
            <MembershipMediaLockedBanner
              kind="video"
              plan={plan}
              onUpgradeClick={() => openMembershipUpgrade('video')}
            />
          </div>
        </div>
        <div className="flex rounded-xl border border-slate-200/90 bg-white/80 p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setMainTab('create')}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition',
              mainTab === 'create' ? 'bg-violet-600 text-white shadow' : 'text-slate-600 hover:bg-slate-50',
            )}
          >
            创作剧本
          </button>
          <button
            type="button"
            onClick={() => setMainTab('works')}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition',
              mainTab === 'works' ? 'bg-violet-600 text-white shadow' : 'text-slate-600 hover:bg-slate-50',
            )}
          >
            成片{works.length ? ` ${works.length}` : ''}
          </button>
        </div>
      </div>

      {mainTab === 'create' ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
          <section className="space-y-5 rounded-2xl border border-slate-200/90 bg-white/90 p-5 shadow-sm">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">短剧类型</p>
              <div className="flex flex-wrap gap-2">
                {DRAMA_TYPES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={busy}
                    onClick={() => setDramaTypeId(t.id)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-sm transition',
                      dramaTypeId === t.id
                        ? 'border-violet-500 bg-violet-50 text-violet-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-violet-200',
                    )}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">{dramaType.hint}</p>
            </div>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-800">一句话故事</span>
              <textarea
                className={cn(fieldCls, 'min-h-[88px] resize-y')}
                disabled={busy}
                value={story}
                onChange={(e) => setStory(e.target.value)}
                placeholder="例：加班到凌晨的助理开门，发现老板正把合同塞进碎纸机。"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-800">角色</span>
              <input
                className={fieldCls}
                disabled={busy}
                value={roles}
                onChange={(e) => setRoles(e.target.value)}
                placeholder="例：25 岁女助理 / 40 岁西装老板"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-800">核心冲突</span>
              <input
                className={fieldCls}
                disabled={busy}
                value={conflict}
                onChange={(e) => setConflict(e.target.value)}
                placeholder="例：她手里还有一份备份，当场对质"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-800">对白钩子（可选）</span>
              <input
                className={fieldCls}
                disabled={busy}
                value={dialogue}
                onChange={(e) => setDialogue(e.target.value)}
                placeholder="例：这份合同，你以为碎了就没了？"
              />
            </label>

            <div className="flex flex-wrap gap-4">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-800">时长</span>
                <select
                  className={fieldCls}
                  disabled={busy}
                  value={durationSec}
                  onChange={(e) => setDurationSec(Number(e.target.value) as (typeof DURATION_OPTIONS)[number])}
                >
                  {DURATION_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n} 秒
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-800">清晰度</span>
                <select
                  className={fieldCls}
                  disabled={busy}
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value as SeedanceQualityId)}
                >
                  {SEEDANCE_QUALITY_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-950 shadow-sm">
              <div className="flex aspect-[9/16] max-h-[420px] w-full items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950">
                {activeWork ? (
                  <video
                    key={activeWork.id}
                    src={activeWork.previewUrl}
                    controls
                    playsInline
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="px-6 text-center text-sm text-slate-400">
                    <Film className="mx-auto mb-3 h-10 w-10 opacity-70" />
                    竖屏 9:16 成片预览
                  </div>
                )}
              </div>
            </div>
            <p className="rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-xs leading-relaxed text-amber-900">
              生成后请及时保存到本地。刷新页面后，本页成片将消失。
            </p>
            {progress ? <p className="text-sm text-violet-700">{progress}</p> : null}
            {hint ? <p className="text-sm text-slate-600">{hint}</p> : null}
            {err ? <p className="text-sm text-rose-600">{err}</p> : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!!gateReason}
                onClick={() => void submitGenerate()}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {busy ? '生成中' : '生成短剧'}
              </button>
              {busy ? (
                <button
                  type="button"
                  onClick={cancelWait}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600"
                >
                  停止等待
                </button>
              ) : null}
            </div>
            <details className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
              <summary className="cursor-pointer select-none text-slate-500">将发送的执导提示词</summary>
              <pre className="mt-2 whitespace-pre-wrap font-sans leading-relaxed">{promptPreview}</pre>
            </details>
          </aside>
        </div>
      ) : (
        <section className="space-y-4">
          {works.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-16 text-center text-sm text-slate-500">
              还没有成片。到「创作剧本」写一句话故事后生成。
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {works.map((w) => (
                <li
                  key={w.id}
                  className={cn(
                    'overflow-hidden rounded-2xl border bg-white shadow-sm',
                    activeWorkId === w.id ? 'border-violet-400' : 'border-slate-200',
                  )}
                >
                  <button type="button" className="block w-full" onClick={() => setActiveWorkId(w.id)}>
                    <video src={w.previewUrl} className="aspect-[9/16] w-full bg-slate-950 object-contain" muted />
                  </button>
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <p className="truncate text-sm font-medium text-slate-800">{w.title}</p>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        title="下载"
                        onClick={() => downloadWork(w)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-violet-700"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="删除"
                        onClick={() => removeWork(w.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
