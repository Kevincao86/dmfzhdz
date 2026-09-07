import { Film, Pencil, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../cn'
import SecretInput from '../../components/SecretInput'
import {
  fetchRegistry,
  postVideoAiBindings,
  type RegistryVideoAi,
} from '../opsRegistryApi'
import OpsArkModelEndpointsEditor from '../components/OpsArkModelEndpointsEditor'
import { catalogEndpointsCsv, DOUBAO_VIDEO_CATALOG } from '../../meooRegistryShared/arkModelCatalogShared'
import { QWEN_VIDEO_CATALOG } from '../../meooRegistryShared/qwenVisionCatalogShared'
import { useOpsModuleEdit } from '../useOpsModuleEdit'

function configured(v: string | undefined): boolean {
  return !!(v ?? '').trim()
}

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]',
        ok
          ? 'border-emerald-800/80 bg-emerald-950/50 text-emerald-200'
          : 'border-slate-700 bg-slate-950 text-slate-500',
      )}
    >
      {ok ? '已配置' : '未填'} · {label}
    </span>
  )
}

export default function OpsShortDramaPage() {
  const { canEdit } = useOpsModuleEdit()
  const [videoAi, setVideoAi] = useState<RegistryVideoAi>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [updatedAt, setUpdatedAt] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const [editing, setEditingState] = useState(false)
  const [pullingArk, setPullingArk] = useState(false)
  const editingRef = useRef(false)
  const baseline = useRef<RegistryVideoAi>({})

  const setEditing = (next: boolean) => {
    editingRef.current = next
    setEditingState(next)
  }

  const pull = useCallback(async (opts?: { background?: boolean }) => {
    const bg = !!opts?.background
    if (!bg) {
      setLoading(true)
      setHint(null)
    }
    try {
      const reg = await fetchRegistry()
      if (!editingRef.current) {
        setVideoAi(reg.videoAi ? { ...reg.videoAi } : {})
        setUpdatedAt(reg.videoAiUpdatedAt ?? '')
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message.trim() : String(e)
      if (!bg) setHint(detail ? `注册表请求失败：${detail}` : '无法读取注册表。')
    } finally {
      if (!bg) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void pull()
    const t = window.setInterval(() => void pull({ background: true }), 5000)
    return () => window.clearInterval(t)
  }, [pull])

  const beginEdit = () => {
    baseline.current = { ...videoAi }
    setVideoAi((prev) => {
      const video = (prev.arkVideoEndpoints ?? '').trim()
      const qwen = (prev.qwenVideoModels ?? '').trim()
      return {
        ...prev,
        arkVideoEndpoints: video ? prev.arkVideoEndpoints : catalogEndpointsCsv(DOUBAO_VIDEO_CATALOG),
        qwenVideoModels: qwen ? prev.qwenVideoModels : catalogEndpointsCsv(QWEN_VIDEO_CATALOG),
      }
    })
    setEditing(true)
    setHint(null)
  }

  const cancelEdit = () => {
    setVideoAi({ ...baseline.current })
    setEditing(false)
    setHint(null)
  }

  const save = async () => {
    setSaving(true)
    setHint(null)
    try {
      await postVideoAiBindings({ videoAi, lastWriter: 'ops' })
      await pull()
      baseline.current = { ...videoAi }
      setEditing(false)
      setHint('已保存短剧 / 视频凭据。未填的厂商不会出现在商家 ERP 短视频下拉。')
    } catch {
      setHint('保存失败：请确认运营台可写注册表。')
    } finally {
      setSaving(false)
    }
  }

  const pullVolcanoVideo = async () => {
    setPullingArk(true)
    setHint(null)
    try {
      const base =
        (import.meta.env.VITE_MEEO_SUPPORT_OPS_API_BASE as string | undefined)?.trim() ||
        'https://mofangdianai.com/erp-api'
      const url = `${base.replace(/\/$/, '')}/meoo-merchant-ai-ark-discover-models?refresh=1`
      const res = await fetch(url)
      const text = await res.text()
      let j: {
        ok?: boolean
        message?: string
        counts?: { video?: number }
        videoEndpointsCsv?: string
      } = {}
      try {
        j = JSON.parse(text) as typeof j
      } catch {
        throw new Error(res.ok ? '上游返回非 JSON' : `HTTP ${res.status}`)
      }
      if (!res.ok || !j.ok) throw new Error(j.message || `HTTP ${res.status}`)
      setVideoAi((p) => ({
        ...p,
        arkVideoEndpoints: j.videoEndpointsCsv || p.arkVideoEndpoints,
      }))
      setEditing(true)
      setHint(
        `已从火山 API 拉取视频模型 ${j.counts?.video ?? 0} 条。请点「保存」。未出现的模型需在方舟控制台先开通。`,
      )
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      setHint(`火山视频模型拉取失败：${detail}`)
    } finally {
      setPullingArk(false)
    }
  }

  const klingOk = configured(videoAi.klingAccessKey) && configured(videoAi.klingSecretKey)
  const seedanceOk = configured(videoAi.arkVideoEndpoints)
  const qwenOk = configured(videoAi.qwenVideoModels)
  const jimengOk = configured(videoAi.jimengAccessKeyId) && configured(videoAi.jimengSecretAccessKey)
  const viduOk = configured(videoAi.viduApiToken)
  const minimaxOk = configured(videoAi.minimaxVideoApiKey)

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">
            短剧 AI 制作
            {!canEdit ? <span className="ml-2 text-sm font-normal text-amber-300/90">· 仅查看</span> : null}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            运营侧维护短剧 / 短视频网关凭据。商家 ERP 只选已配置厂商，不暴露密钥。
            小云雀走<strong className="text-slate-400">即梦视觉云 AK/SK</strong>
            （文档 85621，HMAC），不是方舟模型列表；本页只存凭据，剧本→成片工坊下一期。
            语言模型 Key 仍在{' '}
            <Link to="/ai-models" className="text-cyan-400 hover:underline">
              语言模型 / Key
            </Link>
            。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <button
              type="button"
              onClick={() => void pullVolcanoVideo()}
              disabled={loading || saving || pullingArk}
              className="inline-flex items-center gap-2 rounded-lg border border-violet-800 bg-violet-950/50 px-3 py-2 text-xs font-medium text-violet-100 hover:bg-violet-900/40 disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', pullingArk && 'animate-spin')} />
              {pullingArk ? '拉取中…' : '从火山API拉取视频模型'}
            </button>
          ) : null}
          {canEdit ? (
            !editing ? (
              <button
                type="button"
                onClick={beginEdit}
                disabled={loading || saving}
                className="inline-flex items-center gap-2 rounded-lg border border-cyan-800 bg-cyan-950/60 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-900/50 disabled:opacity-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                编辑
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={loading || saving}
                  className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={loading || saving}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 bg-emerald-700 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  {saving ? '保存中…' : '保存'}
                </button>
              </>
            )
          ) : null}
        </div>
      </div>

      {hint ? (
        <p className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-amber-200/90">{hint}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <StatusChip ok={klingOk} label="可灵" />
        <StatusChip ok={seedanceOk} label="Seedance / 小云雀底层" />
        <StatusChip ok={qwenOk} label="千问视频" />
        <StatusChip ok={jimengOk} label="即梦 / 小云雀 Agent" />
        <StatusChip ok={viduOk} label="Vidu" />
        <StatusChip ok={minimaxOk} label="MiniMax 海螺" />
      </div>
      <p className="text-xs text-slate-600">
        更新时间：{updatedAt ? new Date(updatedAt).toLocaleString('zh-CN') : '—'}
      </p>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Film className="h-4 w-4 text-cyan-400" />
          已有网关（可灵 / Seedance / 千问）
        </h2>
        <p className="mb-4 text-xs text-slate-500">未填密钥或模型列表的厂商，商家短视频页不会出现在下拉中。</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-400">可灵 Access Key（JWT iss）</label>
            <SecretInput
              autoComplete="off"
              readOnly={!editing}
              disabled={loading}
              value={editing ? (videoAi.klingAccessKey ?? '') : ''}
              onChange={(e) => setVideoAi((p) => ({ ...p, klingAccessKey: e.target.value }))}
              placeholder={
                configured(videoAi.klingAccessKey) && !editing ? '已保存 · 请点击「编辑」修改' : '留空则清除'
              }
              className={cn(
                'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600',
                !editing && 'cursor-default opacity-80',
              )}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">可灵 Secret Key</label>
            <SecretInput
              autoComplete="off"
              readOnly={!editing}
              disabled={loading}
              value={editing ? (videoAi.klingSecretKey ?? '') : ''}
              onChange={(e) => setVideoAi((p) => ({ ...p, klingSecretKey: e.target.value }))}
              placeholder={
                configured(videoAi.klingSecretKey) && !editing ? '已保存 · 请点击「编辑」修改' : '留空则清除'
              }
              className={cn(
                'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600',
                !editing && 'cursor-default opacity-80',
              )}
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-slate-400">可灵 API 根域（可选）</label>
            <input
              type="text"
              autoComplete="off"
              readOnly={!editing}
              disabled={loading}
              value={videoAi.klingApiBase ?? ''}
              onChange={(e) => setVideoAi((p) => ({ ...p, klingApiBase: e.target.value }))}
              placeholder="https://api.klingai.com"
              className={cn(
                'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100',
                !editing && 'cursor-default opacity-80',
              )}
            />
          </div>
          <OpsArkModelEndpointsEditor
            label="Seedance · 视频模型（小云雀 / 即梦同款底层）"
            hint="点「从火山API拉取视频模型」导入账号已开通项（含 2.5）；也可一键填入内置目录。"
            placeholder="Seedance 2.5|doubao-seedance-2-5-260628"
            catalog={DOUBAO_VIDEO_CATALOG}
            value={videoAi.arkVideoEndpoints ?? ''}
            onChange={(v) => setVideoAi((p) => ({ ...p, arkVideoEndpoints: v }))}
            editing={editing}
            disabled={loading}
          />
          <OpsArkModelEndpointsEditor
            label="千问 · 视频模型"
            hint="须同时在「语言模型 / Key」配置通义千问 Key。"
            placeholder="wan2.6-i2v|wan2.6-i2v"
            catalog={QWEN_VIDEO_CATALOG}
            value={videoAi.qwenVideoModels ?? ''}
            onChange={(v) => setVideoAi((p) => ({ ...p, qwenVideoModels: v }))}
            editing={editing}
            disabled={loading}
          />
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-slate-400">方舟视频专用 API Key（可选）</label>
            <SecretInput
              autoComplete="off"
              readOnly={!editing}
              disabled={loading}
              value={editing ? (videoAi.arkVideoApiKey ?? '') : ''}
              onChange={(e) => setVideoAi((p) => ({ ...p, arkVideoApiKey: e.target.value }))}
              placeholder={
                configured(videoAi.arkVideoApiKey) && !editing ? '已保存 · 请点击「编辑」修改' : '留空则用豆包 Key'
              }
              className={cn(
                'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600',
                !editing && 'cursor-default opacity-80',
              )}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-violet-900/50 bg-slate-900 p-5">
        <h2 className="mb-1 text-sm font-semibold text-slate-200">即梦 / 小云雀 Agent（P1 凭据）</h2>
        <p className="mb-4 text-xs leading-relaxed text-slate-500">
          官方入口 <span className="font-mono text-slate-400">visual.volcengineapi.com</span>，
          Action=<span className="font-mono text-slate-400">CVSync2AsyncSubmitTask</span>
          。与方舟 Bearer Key 不是同一套。填 AK/SK 后才能在后续工坊调用智能生视频 / 短剧漫剧 Agent。
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-400">视觉云 Access Key ID</label>
            <SecretInput
              autoComplete="off"
              readOnly={!editing}
              disabled={loading}
              value={editing ? (videoAi.jimengAccessKeyId ?? '') : ''}
              onChange={(e) => setVideoAi((p) => ({ ...p, jimengAccessKeyId: e.target.value }))}
              placeholder={
                configured(videoAi.jimengAccessKeyId) && !editing ? '已保存 · 请点击「编辑」修改' : 'AK'
              }
              className={cn(
                'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600',
                !editing && 'cursor-default opacity-80',
              )}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">视觉云 Secret Access Key</label>
            <SecretInput
              autoComplete="off"
              readOnly={!editing}
              disabled={loading}
              value={editing ? (videoAi.jimengSecretAccessKey ?? '') : ''}
              onChange={(e) => setVideoAi((p) => ({ ...p, jimengSecretAccessKey: e.target.value }))}
              placeholder={
                configured(videoAi.jimengSecretAccessKey) && !editing ? '已保存 · 请点击「编辑」修改' : 'SK'
              }
              className={cn(
                'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600',
                !editing && 'cursor-default opacity-80',
              )}
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-slate-400">地域（默认 cn-north-1）</label>
            <input
              type="text"
              autoComplete="off"
              readOnly={!editing}
              disabled={loading}
              value={videoAi.jimengRegion ?? ''}
              onChange={(e) => setVideoAi((p) => ({ ...p, jimengRegion: e.target.value }))}
              placeholder="cn-north-1"
              className={cn(
                'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100',
                !editing && 'cursor-default opacity-80',
              )}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-1 text-sm font-semibold text-slate-200">Vidu · MiniMax 海螺（P1 凭据）</h2>
        <p className="mb-4 text-xs text-slate-500">
          本页只保存 Token / Key。商家端生成网关下一期再接；未填则不下发。
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Vidu API Token</label>
            <SecretInput
              autoComplete="off"
              readOnly={!editing}
              disabled={loading}
              value={editing ? (videoAi.viduApiToken ?? '') : ''}
              onChange={(e) => setVideoAi((p) => ({ ...p, viduApiToken: e.target.value }))}
              placeholder={
                configured(videoAi.viduApiToken) && !editing ? '已保存 · 请点击「编辑」修改' : '企业 Token'
              }
              className={cn(
                'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600',
                !editing && 'cursor-default opacity-80',
              )}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Vidu API 根域（可选）</label>
            <input
              type="text"
              autoComplete="off"
              readOnly={!editing}
              disabled={loading}
              value={videoAi.viduApiBase ?? ''}
              onChange={(e) => setVideoAi((p) => ({ ...p, viduApiBase: e.target.value }))}
              placeholder="https://api.vidu.cn"
              className={cn(
                'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100',
                !editing && 'cursor-default opacity-80',
              )}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">MiniMax 海螺视频 Key</label>
            <SecretInput
              autoComplete="off"
              readOnly={!editing}
              disabled={loading}
              value={editing ? (videoAi.minimaxVideoApiKey ?? '') : ''}
              onChange={(e) => setVideoAi((p) => ({ ...p, minimaxVideoApiKey: e.target.value }))}
              placeholder={
                configured(videoAi.minimaxVideoApiKey) && !editing
                  ? '已保存 · 请点击「编辑」修改'
                  : '可与对话 MiniMax Key 不同'
              }
              className={cn(
                'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600',
                !editing && 'cursor-default opacity-80',
              )}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">MiniMax Group ID（可选）</label>
            <input
              type="text"
              autoComplete="off"
              readOnly={!editing}
              disabled={loading}
              value={videoAi.minimaxGroupId ?? ''}
              onChange={(e) => setVideoAi((p) => ({ ...p, minimaxGroupId: e.target.value }))}
              className={cn(
                'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100',
                !editing && 'cursor-default opacity-80',
              )}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <p className="mb-3 text-xs font-medium text-cyan-400/90">灵祺AI云剪 · ICE</p>
        <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
          智能媒体服务云剪辑。密钥仅存服务端与注册表。
        </p>
        <label className="mb-1 block text-xs text-slate-400">ICE AppId</label>
        <input
          type="text"
          autoComplete="off"
          readOnly={!editing}
          disabled={loading}
          value={editing ? (videoAi.iceAppId ?? '') : ''}
          onChange={(e) => setVideoAi((p) => ({ ...p, iceAppId: e.target.value }))}
          placeholder={configured(videoAi.iceAppId) && !editing ? '已保存 · 请点击「编辑」修改' : '应用 AppId'}
          className={cn(
            'mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100',
            !editing && 'cursor-default opacity-80',
          )}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-400">AccessKey ID</label>
            <input
              type="text"
              autoComplete="off"
              readOnly={!editing}
              disabled={loading}
              value={editing ? (videoAi.iceAccessKeyId ?? '') : ''}
              onChange={(e) => setVideoAi((p) => ({ ...p, iceAccessKeyId: e.target.value }))}
              placeholder={
                configured(videoAi.iceAccessKeyId) && !editing ? '已保存 · 请点击「编辑」修改' : 'RAM AccessKey ID'
              }
              className={cn(
                'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100',
                !editing && 'cursor-default opacity-80',
              )}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">AccessKey Secret</label>
            <SecretInput
              autoComplete="off"
              readOnly={!editing}
              disabled={loading}
              value={editing ? (videoAi.iceAccessKeySecret ?? '') : ''}
              onChange={(e) => setVideoAi((p) => ({ ...p, iceAccessKeySecret: e.target.value }))}
              placeholder={
                configured(videoAi.iceAccessKeySecret) && !editing
                  ? '已保存 · 请点击「编辑」修改'
                  : 'RAM AccessKey Secret'
              }
              className={cn(
                'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600',
                !editing && 'cursor-default opacity-80',
              )}
            />
          </div>
        </div>
        <label className="mb-1 mt-3 block text-xs text-slate-400">地域（默认 cn-shanghai）</label>
        <input
          type="text"
          autoComplete="off"
          readOnly={!editing}
          disabled={loading}
          value={videoAi.iceRegion ?? ''}
          onChange={(e) => setVideoAi((p) => ({ ...p, iceRegion: e.target.value }))}
          placeholder="cn-shanghai"
          className={cn(
            'mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100',
            !editing && 'cursor-default opacity-80',
          )}
        />
        <label className="mb-1 block text-xs text-slate-400">点播 StorageLocation</label>
        <input
          type="text"
          autoComplete="off"
          readOnly={!editing}
          disabled={loading}
          value={videoAi.iceVodStorageLocation ?? ''}
          onChange={(e) => setVideoAi((p) => ({ ...p, iceVodStorageLocation: e.target.value }))}
          placeholder="out-xxx.oss-cn-shanghai.aliyuncs.com"
          className={cn(
            'mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100',
            !editing && 'cursor-default opacity-80',
          )}
        />
        <label className="mb-1 block text-xs text-slate-400">OSS 成片 URL 前缀</label>
        <input
          type="text"
          autoComplete="off"
          readOnly={!editing}
          disabled={loading}
          value={videoAi.iceOutputOssUrlPrefix ?? ''}
          onChange={(e) => setVideoAi((p) => ({ ...p, iceOutputOssUrlPrefix: e.target.value }))}
          placeholder="https://bucket.oss-cn-shanghai.aliyuncs.com/meoo-out/"
          className={cn(
            'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 placeholder:text-slate-600',
            !editing && 'cursor-default opacity-80',
          )}
        />
      </section>
    </div>
  )
}
