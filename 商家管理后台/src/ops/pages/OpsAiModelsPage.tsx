import {
  Cpu,
  KeyRound,
  Pencil,
  PlusCircle,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  catalogCustomEntriesOnly,
  isBuiltinAiVendorId,
  isValidAiVendorSlug,
  mergeBuiltinAiVendorCatalog,
  normalizeCatalogLogoUrl,
  slugifyAiVendorCandidate,
} from '../../meooRegistryShared/aiVendorCatalogShared'
import {
  TOKENMIX_LINKED_VENDOR_IDS,
  TOKENMIX_VENDOR_ID,
  expandVendorKeysForRegistrySave,
  isTokenmixLinkedVendor,
  resolveVendorKeyForDisplay,
} from '../../meooRegistryShared/aiVendorKeysShared'
import { cn } from '../../cn'
import AiVendorCatalogAvatar from '../../components/AiVendorCatalogAvatar'
import SecretInput from '../../components/SecretInput'
import {
  fetchRegistry,
  postAiModels,
  postVideoAiBindings,
  postVendorKeys,
  type AiVendorCatalogEntry,
  type RegistryVideoAi,
  type RegistryVendorKeys,
} from '../opsRegistryApi'
import OpsArkModelEndpointsEditor from '../components/OpsArkModelEndpointsEditor'
import {
  catalogEndpointsCsv,
  DOUBAO_CHAT_CATALOG,
  DOUBAO_VIDEO_CATALOG,
} from '../../meooRegistryShared/arkModelCatalogShared'
import { QWEN_VIDEO_CATALOG } from '../../meooRegistryShared/qwenVisionCatalogShared'

export default function OpsAiModelsPage() {
  const [catalogFull, setCatalogFull] = useState<AiVendorCatalogEntry[]>([])
  const [keys, setKeys] = useState<RegistryVendorKeys>({})
  const [updatedAt, setUpdatedAt] = useState<string>('')
  const [vkAt, setVkAt] = useState<string>('')
  const [controlled, setControlled] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [videoAi, setVideoAi] = useState<RegistryVideoAi>({})
  const [videoAiSaving, setVideoAiSaving] = useState(false)
  const [videoAiUpdatedAt, setVideoAiUpdatedAt] = useState<string>('')

  const [editingVendorKeys, setEditingVendorKeysState] = useState(false)
  const [editingVideoAi, setEditingVideoAiState] = useState(false)
  const vendorKeysBaseline = useRef<RegistryVendorKeys>({})
  const videoAiBaseline = useRef<RegistryVideoAi>({})

  const editingVendorKeysRef = useRef(false)
  const editingVideoAiRef = useRef(false)

  /** Ref 必须与 state 同时更新（不可依赖 useEffect），否则定时 pull 会先读到旧 ref 而覆盖正在编辑的内容。 */
  const setEditingVendorKeys = (next: boolean) => {
    editingVendorKeysRef.current = next
    setEditingVendorKeysState(next)
  }
  const setEditingVideoAi = (next: boolean) => {
    editingVideoAiRef.current = next
    setEditingVideoAiState(next)
  }

  const [addOpen, setAddOpen] = useState(false)
  const [addLabel, setAddLabel] = useState('')
  const [addSlug, setAddSlug] = useState('')
  const [addHint, setAddHint] = useState('')
  const [addLogoUrl, setAddLogoUrl] = useState('')
  const [addErr, setAddErr] = useState<string | null>(null)

  const pull = useCallback(async (opts?: { background?: boolean }) => {
    const bg = !!opts?.background
    if (!bg) {
      setLoading(true)
      setHint(null)
    }
    try {
      const reg = await fetchRegistry()
      const catRaw = Array.isArray(reg.aiVendorCatalog) ? reg.aiVendorCatalog : []
      const cat = mergeBuiltinAiVendorCatalog(catRaw)
      setCatalogFull(cat)
      setUpdatedAt(reg.aiModels.updatedAt)
      setControlled(!!reg.aiModels.controlledByOps)
      if (!editingVendorKeysRef.current) {
        setKeys(expandVendorKeysForRegistrySave({ ...reg.vendorKeys }))
        setVkAt(reg.vendorKeysUpdatedAt)
      }
      if (!editingVideoAiRef.current) {
        setVideoAi(reg.videoAi ? { ...reg.videoAi } : {})
        setVideoAiUpdatedAt(reg.videoAiUpdatedAt ?? '')
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message.trim() : String(e)
      setHint(
        detail
          ? `注册表请求失败：${detail}`
          : '无法读写注册表：请确认 https://mofangdianai.com/erp-api/meoo-ops-sync-registry 在浏览器可打开 JSON；ECS 执行 git pull && pkill -f ecs-auth-api-server; bash scripts/ecs-run-auth-api.sh；Vercel 运营台 Redeploy。',
      )
      setCatalogFull((prev) => (prev.length > 0 ? prev : mergeBuiltinAiVendorCatalog([])))
    } finally {
      if (!bg) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void pull()
    const t = window.setInterval(() => void pull({ background: true }), 5000)
    return () => window.clearInterval(t)
  }, [pull])

  const buildVendorKeysPayload = (): RegistryVendorKeys => {
    const payloadKeys: RegistryVendorKeys = {}
    const baseline = vendorKeysBaseline.current
    for (const e of catalogFull) {
      const v = keys[e.id]
      if (typeof v !== 'string') continue
      const trimmed = v.trim()
      if (!trimmed) {
        // 基线有值、现为空 → 用户显式清除；双空 → 不传该字段，避免误删注册表
        if ((baseline[e.id] ?? '').trim()) payloadKeys[e.id] = ''
        continue
      }
      payloadKeys[e.id] = v
    }
    return expandVendorKeysForRegistrySave(payloadKeys)
  }

  const patchVendorKeyField = (id: string, value: string) => {
    setKeys((prev) => {
      const next: RegistryVendorKeys = { ...prev, [id]: value }
      if (id === TOKENMIX_VENDOR_ID) {
        for (const linked of TOKENMIX_LINKED_VENDOR_IDS) next[linked] = value
      }
      return next
    })
  }

  const saveAll = async () => {
    setSaving(true)
    setHint(null)
    try {
      await postVendorKeys({
        keys: buildVendorKeysPayload(),
        aiVendorCatalog: catalogCustomEntriesOnly(catalogFull),
        lastWriter: 'ops',
      })
      await postAiModels({ textModel: 'auto', imageModel: 'auto', lastWriter: 'ops' })
      await pull()
      setEditingVendorKeys(false)
    } catch {
      setHint('保存失败：请确认本后台 dev 已重启并具备写项目目录权限。')
    } finally {
      setSaving(false)
    }
  }

  const saveVendorKeysSection = async () => {
    setSaving(true)
    setHint(null)
    try {
      await postVendorKeys({
        keys: buildVendorKeysPayload(),
        aiVendorCatalog: catalogCustomEntriesOnly(catalogFull),
        lastWriter: 'ops',
      })
      await postAiModels({ textModel: 'auto', imageModel: 'auto', lastWriter: 'ops' })
      await pull()
      setEditingVendorKeys(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message.trim() : ''
      setHint(msg || '各厂商 Key 保存失败：请确认本后台 dev 可写注册表。')
    } finally {
      setSaving(false)
    }
  }

  const beginEditVendorKeys = () => {
    vendorKeysBaseline.current = { ...keys }
    setEditingVendorKeys(true)
    setHint(null)
  }

  const cancelEditVendorKeys = () => {
    setKeys({ ...vendorKeysBaseline.current })
    setEditingVendorKeys(false)
    setHint(null)
  }

  const saveVideoAiBindings = async () => {
    setVideoAiSaving(true)
    setHint(null)
    try {
      await postVideoAiBindings({ videoAi, lastWriter: 'ops' })
      await pull()
      videoAiBaseline.current = { ...videoAi }
      setEditingVideoAi(false)
    } catch {
      setHint('短视频 API 保存失败：请确认本后台 dev 可写注册表目录。')
    } finally {
      setVideoAiSaving(false)
    }
  }

  const beginEditVideoAi = () => {
    videoAiBaseline.current = { ...videoAi }
    setVideoAi((prev) => {
      const chat = (prev.arkChatEndpoints ?? '').trim()
      const video = (prev.arkVideoEndpoints ?? '').trim()
      return {
        ...prev,
        arkChatEndpoints: chat ? prev.arkChatEndpoints : catalogEndpointsCsv(DOUBAO_CHAT_CATALOG),
        arkVideoEndpoints: video ? prev.arkVideoEndpoints : catalogEndpointsCsv(DOUBAO_VIDEO_CATALOG),
      }
    })
    setEditingVideoAi(true)
    setHint(null)
  }

  const cancelEditVideoAi = () => {
    setVideoAi({ ...videoAiBaseline.current })
    setEditingVideoAi(false)
    setHint(null)
  }

  const openAddVendor = () => {
    setAddErr(null)
    setAddLabel('')
    setAddSlug('')
    setAddHint('')
    setAddLogoUrl('')
    setAddOpen(true)
  }

  const submitAddVendor = () => {
    setAddErr(null)
    const label = addLabel.trim()
    if (!label) {
      setAddErr('请填写显示名称')
      return
    }
    const slug = (addSlug.trim() || slugifyAiVendorCandidate(label, String(Date.now()))).toLowerCase()
    if (!isValidAiVendorSlug(slug)) {
      setAddErr('ID 格式无效：须以小写字母开头，2～48 位小写字母、数字、_-')
      return
    }
    if (isBuiltinAiVendorId(slug)) {
      setAddErr('与内置 MiniMax / 通义千问 / 豆包冲突，请换 ID')
      return
    }
    if (catalogFull.some((x) => x.id === slug)) {
      setAddErr('该 ID 已存在')
      return
    }
    const hintRow = addHint.trim() ? addHint.trim().slice(0, 280) : undefined
    const logoUrl = normalizeCatalogLogoUrl(addLogoUrl)
    setCatalogFull((prev) => [
      ...prev,
      { id: slug, label: label.slice(0, 64), hint: hintRow, ...(logoUrl ? { logoUrl } : {}) },
    ])
    setAddOpen(false)
  }

  const removeVendor = (id: string) => {
    if (!editingVendorKeys) {
      setHint('请先在本区块点击「编辑」后再移除自定义供应商。')
      return
    }
    if (isBuiltinAiVendorId(id)) return
    const ok = window.confirm(`确定从目录移除「${id}」及其 Key？ERP 将不再显示该项。`)
    if (!ok) return
    setCatalogFull((prev) => prev.filter((x) => x.id !== id))
    setKeys((prev) => {
      const n = { ...prev }
      delete n[id]
      return n
    })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">AI 模型</h1>
          <p className="mt-1 text-sm text-slate-500">
            在此维护各厂商 <strong className="text-slate-400">API Key</strong>、
            <strong className="text-slate-400">AI 供应商目录</strong>
            ，以及 <strong className="text-slate-400">短视频（可灵 / Seedance）网关绑定</strong>
            。商户 ERP 文案 / 生图默认<strong className="text-slate-400">自动</strong>
            选用已配置 Key 的厂商，不再由运营台固定「默认模型」。保存后写入项目根{' '}
            <span className="font-mono text-slate-400">.meoo-dev-sync</span>，ERP 约 2.5 秒内拉取。
            商户 ERP「短视频AI处理」页<strong className="text-slate-400">仅选择模型与参数</strong>
            ，不在商户端暴露密钥。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openAddVendor}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 bg-emerald-950/80 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-900/70"
          >
            <PlusCircle className="h-4 w-4" />
            新增 AI 供应商
          </button>
          <button
            type="button"
            onClick={() => void pull()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            立即同步
          </button>
          <button
            type="button"
            onClick={() => void saveAll()}
            disabled={saving || loading || editingVendorKeys || editingVideoAi}
            title={
              editingVendorKeys || editingVideoAi
                ? '请先在各密钥区块保存或取消后再使用顶部一键保存'
                : undefined
            }
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <KeyRound className="h-4 w-4" />
            {saving ? '保存中…' : '保存模型与 Key'}
          </button>
        </div>
      </div>

      {hint ? <p className="text-sm text-amber-400/90">{hint}</p> : null}

      {addOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => !saving && setAddOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">新增 AI 供应商</h2>
              <button type="button" className="text-slate-400 hover:text-white" onClick={() => setAddOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <label className="mb-1 block text-xs text-slate-400">显示名称（如：OpenAI）</label>
                <input
                  value={addLabel}
                  onChange={(e) => setAddLabel(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                  placeholder="在 ERP 与各页 pills 中展示"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  供应商 ID slug（ASCII，小写）；留空则根据名称自动生成
                </label>
                <input
                  value={addSlug}
                  onChange={(e) => setAddSlug(e.target.value.toLowerCase())}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-slate-100"
                  placeholder="如 my_vendor"
                  autoCapitalize="off"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">说明 / Key 占位提示（可选）</label>
                <input
                  value={addHint}
                  onChange={(e) => setAddHint(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                  placeholder="会显示在 ERP 弹窗与各厂商字段下方"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  Logo 图片地址（可选，https 或 ERP 相对路径如 /ai-vendors/xxx.svg）
                </label>
                <input
                  value={addLogoUrl}
                  onChange={(e) => setAddLogoUrl(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
                  placeholder="https://…"
                  autoCapitalize="off"
                />
              </div>
              {addErr ? <p className="text-xs text-red-400">{addErr}</p> : null}
              <button
                type="button"
                onClick={() => submitAddVendor()}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
              >
                加入目录（随后在「各厂商 API Key」中点「编辑」，填写 Key 后再点区块内「保存」或顶部「保存模型与 Key」）
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Sparkles className="h-4 w-4 text-violet-400" />
          租户侧 AI 路由说明
        </h2>
        <p className="text-xs leading-relaxed text-slate-500">
          商户 ERP 默认<strong className="text-slate-400">自动</strong>
          选择模型：按供应商目录顺序，优先使用<strong className="text-slate-400">已配置 Key</strong>
          的厂商；商户可在各业务页关闭「自动」后手动指定。注册表字段{' '}
          <span className="font-mono text-slate-400">textModel / imageModel</span> 固定为{' '}
          <span className="font-mono text-slate-400">auto</span>
          （保存各厂商 Key 或顶部一键保存时写入）。
        </p>
        <p className="mt-3 text-xs text-slate-500">
          路由元数据更新时间：{updatedAt ? new Date(updatedAt).toLocaleString('zh-CN') : '—'} · 运营接管：
          {controlled ? '是' : '否'}
        </p>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <KeyRound className="h-4 w-4 text-amber-400" />
            各厂商 API Key
          </h2>
          <div className="flex flex-wrap gap-2">
            {!editingVendorKeys ? (
              <button
                type="button"
                onClick={beginEditVendorKeys}
                disabled={loading || saving || editingVideoAi}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-800/70 bg-amber-950/50 px-3 py-2 text-xs font-medium text-amber-100 hover:bg-amber-900/35 disabled:opacity-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                编辑
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => cancelEditVendorKeys()}
                  disabled={loading || saving}
                  className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void saveVendorKeysSection()}
                  disabled={loading || saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
                >
                  {saving ? '保存中…' : '保存'}
                </button>
              </>
            )}
          </div>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          与原先 ERP 弹窗一致：点击<strong className="text-slate-400">编辑</strong>后可录入或清空各厂商 Key，
          <strong className="text-slate-400">保存</strong>
          后写入注册表并由 ERP 拉取（dev）。OpenAI / Claude / Gemini / Grok 与
          <strong className="text-slate-400"> TokenMix </strong>
          共用同一 Key，只需填写 TokenMix 栏。生产请接入密钥管理系统；勿将真实 Key 提交 Git。
        </p>
        <p className="text-xs text-slate-600">Key 更新时间：{vkAt ? new Date(vkAt).toLocaleString('zh-CN') : '—'}</p>
        <div className="mt-4 space-y-4">
          {catalogFull.map((k) => {
            const linkedReadOnly =
              editingVendorKeys && isTokenmixLinkedVendor(k.id) && k.id !== TOKENMIX_VENDOR_ID
            const displayKey = resolveVendorKeyForDisplay(keys, k.id)
            const saved = displayKey.length > 0
            return (
            <div key={k.id}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="flex min-w-0 flex-1 items-center gap-2 text-xs font-medium text-slate-300">
                  <AiVendorCatalogAvatar id={k.id} label={k.label} logoUrl={k.logoUrl} size="sm" />
                  <span className="min-w-0 truncate">
                    {k.label}（<span className="font-mono text-slate-500">{k.id}</span>）
                  </span>
                </label>
                {!isBuiltinAiVendorId(k.id) ? (
                  <button
                    type="button"
                    onClick={() => removeVendor(k.id)}
                    disabled={!editingVendorKeys || loading || saving}
                    className="inline-flex items-center gap-1 rounded-md border border-red-900/50 px-2 py-0.5 text-[10px] text-red-300 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="h-3 w-3" />
                    移除
                  </button>
                ) : null}
              </div>
              <SecretInput
                autoComplete="off"
                readOnly={!editingVendorKeys || linkedReadOnly}
                disabled={loading || linkedReadOnly}
                value={editingVendorKeys ? displayKey : ''}
                onChange={(e) => patchVendorKeyField(k.id, e.target.value)}
                placeholder={
                  saved && !editingVendorKeys
                    ? '已保存 · 请点击区块上方「编辑」修改'
                    : linkedReadOnly
                      ? '与 TokenMix 栏同步，请在 TokenMix 行填写'
                      : '留空表示清除该厂商 Key'
                }
                className={cn(
                  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600',
                  (!editingVendorKeys || linkedReadOnly) && 'cursor-default opacity-80',
                )}
              />
              {!editingVendorKeys && saved ? (
                <p className="mt-1 text-[11px] text-emerald-500/90">密钥已保存在注册表中。</p>
              ) : null}
              {!editingVendorKeys && !saved ? (
                <p className="mt-1 text-[11px] text-slate-600">此项尚未配置密钥。</p>
              ) : null}
              {linkedReadOnly ? (
                <p className="mt-1 text-[11px] text-amber-500/80">与 TokenMix 共用 Key，仅编辑上方 TokenMix 栏即可。</p>
              ) : null}
              <p className="mt-1 text-[11px] text-slate-500">
                {k.hint?.trim() ?? 'ERP 会使用此 Key；非内置网关厂商需在 merchant-erp 扩展上游后方可实际推理。'}
              </p>
              {!isBuiltinAiVendorId(k.id) && editingVendorKeys ? (
                <div className="mt-2">
                  <label className="mb-1 block text-[11px] text-slate-500">
                    Logo 图片地址（可选；商户 ERP 下拉与设置页展示）
                  </label>
                  <input
                    type="text"
                    value={k.logoUrl ?? ''}
                    onChange={(e) => {
                      const v = e.target.value
                      setCatalogFull((prev) => prev.map((x) => (x.id === k.id ? { ...x, logoUrl: v } : x)))
                    }}
                    placeholder="https://… 或 /path/logo.svg"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 placeholder:text-slate-600"
                  />
                </div>
              ) : null}
            </div>
          )})}
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Sparkles className="h-4 w-4 text-cyan-400" />
            短视频 / 视频模型 API（可灵 + Seedance / 方舟 + 千问）
          </h2>
          <div className="flex flex-wrap gap-2">
            {!editingVideoAi ? (
              <button
                type="button"
                onClick={beginEditVideoAi}
                disabled={loading || videoAiSaving || editingVendorKeys}
                className="inline-flex items-center gap-2 rounded-lg border border-cyan-800 bg-cyan-950/60 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-900/50 disabled:opacity-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                编辑
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => cancelEditVideoAi()}
                  disabled={loading || videoAiSaving}
                  className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void saveVideoAiBindings()}
                  disabled={loading || videoAiSaving}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 bg-emerald-700 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  {videoAiSaving ? '保存中…' : '保存'}
                </button>
              </>
            )}
          </div>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          以下凭据由<strong className="text-slate-400">运营侧</strong>维护，供商户 ERP 短视频页经 dev 网关调用。
          更新时间：{videoAiUpdatedAt ? new Date(videoAiUpdatedAt).toLocaleString('zh-CN') : '—'}
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-400">可灵 Access Key（JWT iss）</label>
            <SecretInput
              autoComplete="off"
              readOnly={!editingVideoAi}
              disabled={loading}
              value={editingVideoAi ? (videoAi.klingAccessKey ?? '') : ''}
              onChange={(e) => setVideoAi((p) => ({ ...p, klingAccessKey: e.target.value }))}
              placeholder={
                (videoAi.klingAccessKey ?? '').trim() && !editingVideoAi
                  ? '已保存 · 请点击「编辑」修改'
                  : '留空则清除'
              }
              className={cn(
                'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600',
                !editingVideoAi && 'cursor-default opacity-80',
              )}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">可灵 Secret Key（JWT 签名）</label>
            <SecretInput
              autoComplete="off"
              readOnly={!editingVideoAi}
              disabled={loading}
              value={editingVideoAi ? (videoAi.klingSecretKey ?? '') : ''}
              onChange={(e) => setVideoAi((p) => ({ ...p, klingSecretKey: e.target.value }))}
              placeholder={
                (videoAi.klingSecretKey ?? '').trim() && !editingVideoAi
                  ? '已保存 · 请点击「编辑」修改'
                  : '留空则清除'
              }
              className={cn(
                'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600',
                !editingVideoAi && 'cursor-default opacity-80',
              )}
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-slate-400">
              可灵 API 根域（可选，如 https://api.klingai.com，留空用默认）
            </label>
            <input
              type="text"
              autoComplete="off"
              readOnly={!editingVideoAi}
              disabled={loading}
              value={videoAi.klingApiBase ?? ''}
              onChange={(e) => setVideoAi((p) => ({ ...p, klingApiBase: e.target.value }))}
              className={cn(
                'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100',
                !editingVideoAi && 'cursor-default opacity-80',
              )}
            />
          </div>
          <OpsArkModelEndpointsEditor
            label="豆包 · 对话模型（逗号分隔「显示名|方舟模型ID或 ep-xxxx」；智能体 / 商品 AI 优先用此列表）"
            hint="勾选或「一键填入全部」加载系统内置豆包对话模型；保存后商户端额度不足时将按列表顺序自动切换。"
            placeholder="Character|doubao-seed-character-251128, Pro|ep-xxxxxxxx"
            catalog={DOUBAO_CHAT_CATALOG}
            value={videoAi.arkChatEndpoints ?? ''}
            onChange={(v) => setVideoAi((p) => ({ ...p, arkChatEndpoints: v }))}
            editing={editingVideoAi}
            disabled={loading}
          />
          <OpsArkModelEndpointsEditor
            label="Seedance · 视频模型（逗号分隔「显示名|模型ID或ep」；推荐模型 ID，勿填对话模型 ep）"
            hint="勾选或「一键填入全部」加载系统内置 Seedance / Seaweed / Wan 视频模型；勿填 Doubao-Seed 对话 ep。"
            placeholder="Seedance 1.5 Pro|doubao-seedance-1-5-pro-251215, Pro|ep-xxxxxxxx"
            catalog={DOUBAO_VIDEO_CATALOG}
            value={videoAi.arkVideoEndpoints ?? ''}
            onChange={(v) => setVideoAi((p) => ({ ...p, arkVideoEndpoints: v }))}
            editing={editingVideoAi}
            disabled={loading}
          />
          <OpsArkModelEndpointsEditor
            label="千问 · 视频模型（逗号分隔「显示名|百炼模型ID」；豆包额度用尽时商户端自动切换）"
            hint="勾选或「一键填入全部」加载系统内置千问/万相视频模型（文生/图生/参考生/口播/剪辑）；须同时在下方供应商 Key 配置通义千问 Key。"
            placeholder="wan2.6-i2v|wan2.6-i2v, wan2.7-t2v|wan2.7-t2v"
            catalog={QWEN_VIDEO_CATALOG}
            value={videoAi.qwenVideoModels ?? ''}
            onChange={(v) => setVideoAi((p) => ({ ...p, qwenVideoModels: v }))}
            editing={editingVideoAi}
            disabled={loading}
          />
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-slate-400">
              方舟视频专用 API Key（可选；留空则由商户网关使用上方「豆包」Key）
            </label>
            <SecretInput
              autoComplete="off"
              readOnly={!editingVideoAi}
              disabled={loading}
              value={editingVideoAi ? (videoAi.arkVideoApiKey ?? '') : ''}
              onChange={(e) => setVideoAi((p) => ({ ...p, arkVideoApiKey: e.target.value }))}
              placeholder={
                (videoAi.arkVideoApiKey ?? '').trim() && !editingVideoAi
                  ? '已保存 · 请点击「编辑」修改'
                  : '与豆包不同时再填'
              }
              className={cn(
                'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600',
                !editingVideoAi && 'cursor-default opacity-80',
              )}
            />
          </div>
          <div className="md:col-span-2 border-t border-slate-800 pt-4">
            <p className="mb-3 text-xs font-medium text-cyan-400/90">灵祺AI云剪 · 服务凭据</p>
            <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
              智能媒体服务云剪辑（ICE 2020-11-09）。商户 ERP 批量云剪经 BFF 调用，密钥仅存服务端与注册表。
            </p>
            <label className="mb-1 block text-xs text-slate-400">ICE AppId（IMS 控制台应用 ID）</label>
            <input
              type="text"
              autoComplete="off"
              readOnly={!editingVideoAi}
              disabled={loading}
              value={editingVideoAi ? (videoAi.iceAppId ?? '') : ''}
              onChange={(e) => setVideoAi((p) => ({ ...p, iceAppId: e.target.value }))}
              placeholder={
                (videoAi.iceAppId ?? '').trim() && !editingVideoAi
                  ? '已保存 · 请点击「编辑」修改'
                  : '应用 AppId'
              }
              className={cn(
                'mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100',
                !editingVideoAi && 'cursor-default opacity-80',
              )}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-slate-400">AccessKey ID</label>
                <input
                  type="text"
                  autoComplete="off"
                  readOnly={!editingVideoAi}
                  disabled={loading}
                  value={editingVideoAi ? (videoAi.iceAccessKeyId ?? '') : ''}
                  onChange={(e) => setVideoAi((p) => ({ ...p, iceAccessKeyId: e.target.value }))}
                  placeholder={
                    (videoAi.iceAccessKeyId ?? '').trim() && !editingVideoAi
                      ? '已保存 · 请点击「编辑」修改'
                      : 'RAM AccessKey ID'
                  }
                  className={cn(
                    'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100',
                    !editingVideoAi && 'cursor-default opacity-80',
                  )}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">AccessKey Secret</label>
                <SecretInput
                  autoComplete="off"
                  readOnly={!editingVideoAi}
                  disabled={loading}
                  value={editingVideoAi ? (videoAi.iceAccessKeySecret ?? '') : ''}
                  onChange={(e) => setVideoAi((p) => ({ ...p, iceAccessKeySecret: e.target.value }))}
                  placeholder={
                    (videoAi.iceAccessKeySecret ?? '').trim() && !editingVideoAi
                      ? '已保存 · 请点击「编辑」修改'
                      : 'RAM AccessKey Secret'
                  }
                  className={cn(
                    'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100',
                    !editingVideoAi && 'cursor-default opacity-80',
                  )}
                />
              </div>
            </div>
            <label className="mb-1 mt-3 block text-xs text-slate-400">地域（默认 cn-shanghai）</label>
            <input
              type="text"
              autoComplete="off"
              readOnly={!editingVideoAi}
              disabled={loading}
              value={videoAi.iceRegion ?? ''}
              onChange={(e) => setVideoAi((p) => ({ ...p, iceRegion: e.target.value }))}
              placeholder="cn-shanghai"
              className={cn(
                'mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100',
                !editingVideoAi && 'cursor-default opacity-80',
              )}
            />
            <label className="mb-1 block text-xs text-slate-400">
              点播存储地址 StorageLocation（链接拉取素材、成片输出到 VOD 时必填）
            </label>
            <input
              type="text"
              autoComplete="off"
              readOnly={!editingVideoAi}
              disabled={loading}
              value={videoAi.iceVodStorageLocation ?? ''}
              onChange={(e) => setVideoAi((p) => ({ ...p, iceVodStorageLocation: e.target.value }))}
              placeholder="out-xxx.oss-cn-shanghai.aliyuncs.com"
              className={cn(
                'mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100',
                !editingVideoAi && 'cursor-default opacity-80',
              )}
            />
            <div className="mt-4 rounded-lg border border-cyan-900/60 bg-cyan-950/30 p-4">
              <p className="mb-2 text-xs font-semibold text-cyan-200">
                本地上传 · OSS 成片 URL 前缀
                <span className="ml-2 rounded bg-cyan-900/80 px-1.5 py-0.5 text-[10px] font-medium text-cyan-100">
                  商户「灵祺AI云剪」必填
                </span>
              </p>
              <p className="mb-3 text-[11px] leading-relaxed text-slate-400">
                填写后商户 ERP 可将视频直传到该 Bucket 的{' '}
                <span className="font-mono text-slate-300">source/日期/</span> 目录；须为标准 OSS 域名，例如{' '}
                <span className="font-mono text-slate-300">
                  https://bucket.oss-cn-shanghai.aliyuncs.com/meoo-out/
                </span>
                。与 ICE AccessKey 须对该 Bucket 有写权限。
              </p>
              {(videoAi.iceOutputOssUrlPrefix ?? '').trim() && !editingVideoAi ? (
                <p className="mb-2 text-[11px] text-emerald-400/95">
                  已配置：{(videoAi.iceOutputOssUrlPrefix ?? '').trim()}
                </p>
              ) : !editingVideoAi ? (
                <p className="mb-2 text-[11px] text-amber-400/95">
                  未配置 — 商户端「本地上传视频」不可用（仍可用 HTTPS 链接）
                </p>
              ) : null}
              <label className="mb-1 block text-xs text-slate-400">OSS 成片 URL 前缀</label>
              <input
                type="text"
                autoComplete="off"
                readOnly={!editingVideoAi}
                disabled={loading}
                value={videoAi.iceOutputOssUrlPrefix ?? ''}
                onChange={(e) => setVideoAi((p) => ({ ...p, iceOutputOssUrlPrefix: e.target.value }))}
                placeholder="https://bucket.oss-cn-shanghai.aliyuncs.com/meoo-out/"
                className={cn(
                  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 placeholder:text-slate-600',
                  !editingVideoAi && 'cursor-default opacity-80',
                  editingVideoAi && 'border-cyan-800/80',
                )}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Cpu className="h-4 w-4 text-slate-400" />
          说明
        </h2>
        <ul className="list-inside list-disc space-y-1 text-xs text-slate-500">
          <li>「各厂商 API Key」与「短视频 API」需先<strong className="text-slate-400">编辑</strong>再<strong className="text-slate-400">保存</strong>写入注册表；编辑未保存时可点取消放弃修改。</li>
          <li>顶层「保存模型与 Key」在任一分区仍处于编辑状态时不可用，请先保存或取消该分区。</li>
          <li>磁盘：注册表文件为项目根 <span className="font-mono text-slate-400">.meoo-dev-sync/registry.json</span>；GET 网关合并内置厂商目录再下发 ERP。</li>
          <li>
            「短视频 API」与本页 Key 互不覆盖：ERP 服务端优先读部署环境变量，未配置时再回退本注册表中运营填写的绑定。
          </li>
        </ul>
      </section>
    </div>
  )
}
