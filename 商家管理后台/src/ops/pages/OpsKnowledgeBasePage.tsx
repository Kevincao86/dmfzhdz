import { useCallback, useEffect, useState } from 'react'
import { BookOpen, Loader2, Trash2, Upload } from 'lucide-react'
import {
  deleteOpsKbDocument,
  fileToBase64,
  listOpsKbDocuments,
  updateOpsKbDocument,
  uploadOpsKbDocument,
  type KbDocument,
  type KbVisibility,
} from '../opsKnowledgeBaseApi'
import { requireOpsModuleEdit } from '../opsStaffAuth'
import { OpsEditableSection, useOpsModuleEdit } from '../useOpsModuleEdit'

function statusLabel(s: string) {
  if (s === 'ready') return '可用'
  if (s === 'manual') return '摘要可用'
  if (s === 'pending') return '解析中'
  if (s === 'failed') return '解析失败'
  return s
}

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export default function OpsKnowledgeBasePage() {
  const { canEdit } = useOpsModuleEdit('knowledge_base')
  const [docs, setDocs] = useState<KbDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [plainText, setPlainText] = useState('')
  const [summary, setSummary] = useState('')
  const [visibility, setVisibility] = useState<KbVisibility>('ops_only')
  const [file, setFile] = useState<File | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setMsg('')
    try {
      setDocs(await listOpsKbDocuments())
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '加载失败')
      setDocs([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function onUpload() {
    const denied = requireOpsModuleEdit('knowledge_base')
    if (denied) {
      setMsg(denied)
      return
    }
    if (!file && !plainText.trim()) {
      setMsg('请选择文件或粘贴文本')
      return
    }
    setBusy(true)
    setMsg('')
    try {
      if (file) {
        const contentBase64 = await fileToBase64(file)
        await uploadOpsKbDocument({
          title: title.trim() || file.name,
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          contentBase64,
          summary: summary.trim(),
          visibility,
        })
      } else {
        await uploadOpsKbDocument({
          title: title.trim() || '文本资料',
          fileName: 'note.txt',
          contentType: 'text/plain',
          plainText: plainText.trim(),
          summary: summary.trim(),
          visibility,
        })
      }
      setTitle('')
      setPlainText('')
      setSummary('')
      setFile(null)
      setMsg('上传成功')
      await load()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '上传失败')
    } finally {
      setBusy(false)
    }
  }

  async function onToggleFeed(doc: KbDocument) {
    const denied = requireOpsModuleEdit('knowledge_base')
    if (denied) {
      setMsg(denied)
      return
    }
    try {
      await updateOpsKbDocument({ documentId: doc.id, feedEnabled: !doc.feed_enabled })
      await load()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '更新失败')
    }
  }

  async function onVisibility(doc: KbDocument, v: KbVisibility) {
    const denied = requireOpsModuleEdit('knowledge_base')
    if (denied) {
      setMsg(denied)
      return
    }
    try {
      await updateOpsKbDocument({ documentId: doc.id, visibility: v })
      await load()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '更新失败')
    }
  }

  async function onDelete(doc: KbDocument) {
    const denied = requireOpsModuleEdit('knowledge_base')
    if (denied) {
      setMsg(denied)
      return
    }
    if (!window.confirm(`删除「${doc.title}」？`)) return
    try {
      await deleteOpsKbDocument(doc.id)
      await load()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '删除失败')
    }
  }

  async function onSaveSummary(doc: KbDocument, next: string) {
    const denied = requireOpsModuleEdit('knowledge_base')
    if (denied) {
      setMsg(denied)
      return
    }
    try {
      await updateOpsKbDocument({
        documentId: doc.id,
        summary: next,
        reparseWithSummary: true,
      })
      await load()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '保存摘要失败')
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
          <BookOpen className="h-5 w-5 text-cyan-300" />
          知识库
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          运营全局知识库：上传 PDF/Word/PPT/图片/视频/Markdown 或粘贴文本。默认仅运营智能体可用，可勾选下发给商家/服务商智能体。
        </p>
      </div>

      {msg ? <p className="text-sm text-amber-300">{msg}</p> : null}

      <OpsEditableSection
        permissionKey="knowledge_base"
        className="rounded-xl border border-[var(--ops-border)] bg-[var(--ops-panel)] p-5 space-y-4 block"
      >
        <h2 className="text-sm font-medium text-slate-200">上传资料</h2>
        <input
          className="w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
          placeholder="标题（可选）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={!canEdit}
        />
        <input
          type="file"
          className="block w-full text-sm text-slate-300"
          disabled={!canEdit || busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <textarea
          className="min-h-[100px] w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
          placeholder="或直接粘贴文本资料"
          value={plainText}
          onChange={(e) => setPlainText(e.target.value)}
          disabled={!canEdit}
        />
        <textarea
          className="min-h-[72px] w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
          placeholder="说明/字幕摘要（图片/视频建议填写，参与智能体投喂）"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          disabled={!canEdit}
        />
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <span>可见性</span>
          <select
            className="rounded border border-slate-600 bg-slate-900 px-2 py-1"
            value={visibility}
            disabled={!canEdit}
            onChange={(e) => setVisibility(e.target.value as KbVisibility)}
          >
            <option value="ops_only">仅运营智能体</option>
            <option value="tenant_agents">下发商家/服务商智能体</option>
            <option value="all_agents">全部智能体</option>
          </select>
        </label>
        <button
          type="button"
          disabled={!canEdit || busy}
          onClick={() => void onUpload()}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          上传
        </button>
      </OpsEditableSection>

      <div className="rounded-xl border border-[var(--ops-border)] bg-[var(--ops-panel)] p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-200">文档列表</h2>
          <button type="button" className="text-xs text-cyan-300 hover:underline" onClick={() => void load()}>
            刷新
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-slate-500">加载中…</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-slate-500">暂无文档</p>
        ) : (
          <ul className="space-y-3">
            {docs.map((doc) => (
              <li
                key={doc.id}
                className="rounded-lg border border-slate-700/80 bg-slate-900/40 p-3 text-sm text-slate-200"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-white">{doc.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {doc.file_name} · {doc.file_type} · {fmtSize(doc.size_bytes)} ·{' '}
                      {statusLabel(doc.parse_status)}
                      {doc.parse_error ? `（${doc.parse_error}）` : ''}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {doc.oss_url ? (
                      <a
                        href={doc.oss_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-cyan-300 hover:underline"
                      >
                        打开文件
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="text-xs text-slate-300 hover:text-white"
                      disabled={!canEdit}
                      onClick={() => void onToggleFeed(doc)}
                    >
                      {doc.feed_enabled ? '投喂中' : '已停投喂'}
                    </button>
                    <select
                      className="rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-xs"
                      value={doc.visibility}
                      disabled={!canEdit}
                      onChange={(e) => void onVisibility(doc, e.target.value as KbVisibility)}
                    >
                      <option value="ops_only">仅运营</option>
                      <option value="tenant_agents">下发租户</option>
                      <option value="all_agents">全部</option>
                    </select>
                    <button
                      type="button"
                      className="text-rose-400 hover:text-rose-300"
                      disabled={!canEdit}
                      onClick={() => void onDelete(doc)}
                      aria-label="删除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {(doc.parse_status === 'failed' ||
                  doc.parse_status === 'manual' ||
                  doc.file_type === 'image' ||
                  doc.file_type === 'video') && (
                  <div className="mt-2 flex gap-2">
                    <input
                      className="flex-1 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs"
                      defaultValue={doc.summary}
                      placeholder="填写摘要后回车保存并重新投喂"
                      disabled={!canEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          void onSaveSummary(doc, (e.target as HTMLInputElement).value)
                        }
                      }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
