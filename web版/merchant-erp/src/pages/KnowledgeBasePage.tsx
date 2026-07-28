import { useCallback, useEffect, useState } from 'react'
import { BookOpen, Loader2, Trash2, Upload } from 'lucide-react'
import { usePartnerTenant } from '../context/PartnerTenantContext'
import { isPartnerEdition } from '../lib/appEdition'
import {
  deleteTenantKbDocument,
  fileToBase64,
  listTenantKbDocuments,
  updateTenantKbDocument,
  uploadTenantKbDocument,
  type KbDocument,
} from '../lib/knowledgeBaseApi'

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

export default function KnowledgeBasePage() {
  const { profile } = usePartnerTenant()
  const tenantHint = isPartnerEdition() ? profile.tenantId : undefined
  const [docs, setDocs] = useState<KbDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [plainText, setPlainText] = useState('')
  const [summary, setSummary] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setMsg('')
    try {
      setDocs(await listTenantKbDocuments(tenantHint))
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '加载失败')
      setDocs([])
    } finally {
      setLoading(false)
    }
  }, [tenantHint])

  useEffect(() => {
    void load()
  }, [load])

  async function onUpload() {
    if (!file && !plainText.trim()) {
      setMsg('请选择文件或粘贴文本')
      return
    }
    setBusy(true)
    setMsg('')
    try {
      if (file) {
        const contentBase64 = await fileToBase64(file)
        await uploadTenantKbDocument({
          tenantId: tenantHint,
          title: title.trim() || file.name,
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          contentBase64,
          summary: summary.trim(),
        })
      } else {
        await uploadTenantKbDocument({
          tenantId: tenantHint,
          title: title.trim() || '文本资料',
          fileName: 'note.txt',
          contentType: 'text/plain',
          plainText: plainText.trim(),
          summary: summary.trim(),
        })
      }
      setTitle('')
      setPlainText('')
      setSummary('')
      setFile(null)
      setMsg('上传成功，对话时将自动检索投喂')
      await load()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '上传失败')
    } finally {
      setBusy(false)
    }
  }

  async function onToggleFeed(doc: KbDocument) {
    try {
      await updateTenantKbDocument({
        tenantId: tenantHint,
        documentId: doc.id,
        feedEnabled: !doc.feed_enabled,
      })
      await load()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '更新失败')
    }
  }

  async function onDelete(doc: KbDocument) {
    if (!window.confirm(`删除「${doc.title}」？`)) return
    try {
      await deleteTenantKbDocument(doc.id, tenantHint)
      await load()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '删除失败')
    }
  }

  async function onSaveSummary(doc: KbDocument, next: string) {
    try {
      await updateTenantKbDocument({
        tenantId: tenantHint,
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
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <BookOpen className="h-5 w-5 text-cyan-600" />
          我的知识库
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          上传本品牌/本客户资料，仅本租户可见。使用「小灵同学 / AI 对话」时会自动检索本库与平台已下发的全局知识。
          {isPartnerEdition() && profile.name ? ` 当前租户：${profile.name}` : ''}
        </p>
      </div>

      {msg ? <p className="text-sm text-amber-700">{msg}</p> : null}

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium text-slate-800">上传资料</h2>
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500"
          placeholder="标题（可选）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          type="file"
          className="block w-full text-sm text-slate-600"
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <textarea
          className="min-h-[100px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500"
          placeholder="或直接粘贴文本"
          value={plainText}
          onChange={(e) => setPlainText(e.target.value)}
        />
        <textarea
          className="min-h-[72px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500"
          placeholder="说明/字幕摘要（图片/视频建议填写）"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void onUpload()}
          className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          上传
        </button>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-800">文档列表</h2>
          <button type="button" className="text-xs text-cyan-700 hover:underline" onClick={() => void load()}>
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
              <li key={doc.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-slate-900">{doc.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {doc.file_name} · {doc.file_type} · {fmtSize(doc.size_bytes)} ·{' '}
                      {statusLabel(doc.parse_status)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {doc.oss_url ? (
                      <a
                        href={doc.oss_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-cyan-700 hover:underline"
                      >
                        打开
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="text-xs text-slate-600 hover:text-slate-900"
                      onClick={() => void onToggleFeed(doc)}
                    >
                      {doc.feed_enabled ? '参与投喂' : '已关闭投喂'}
                    </button>
                    <button
                      type="button"
                      className="text-rose-500 hover:text-rose-600"
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
                  <input
                    className="mt-2 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                    defaultValue={doc.summary}
                    placeholder="填写摘要后回车保存并重新投喂"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        void onSaveSummary(doc, (e.target as HTMLInputElement).value)
                      }
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
