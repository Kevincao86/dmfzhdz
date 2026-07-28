import { useCallback, useEffect, useRef, useState } from 'react'
import { BookOpen, FolderOpen, Loader2, Trash2, Upload, X } from 'lucide-react'
import { usePartnerTenant } from '../context/PartnerTenantContext'
import { isPartnerEdition } from '../lib/appEdition'
import {
  collectFilesFromDataTransfer,
  deleteTenantKbDocument,
  fileToBase64,
  listTenantKbDocuments,
  mergeUniqueFiles,
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

function displayPath(f: File) {
  return f.webkitRelativePath || f.name
}

export default function KnowledgeBasePage() {
  const { profile } = usePartnerTenant()
  const tenantHint = isPartnerEdition() ? profile.tenantId : undefined
  const [docs, setDocs] = useState<KbDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [title, setTitle] = useState('')
  const [plainText, setPlainText] = useState('')
  const [summary, setSummary] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    const el = folderInputRef.current
    if (!el) return
    el.setAttribute('webkitdirectory', '')
    el.setAttribute('directory', '')
  }, [])

  const addFiles = useCallback((incoming: File[]) => {
    if (!incoming.length) return
    setFiles((prev) => mergeUniqueFiles(prev, incoming))
    setMsg(`已加入 ${incoming.length} 个文件，点击「一键上传」即可全部上传`)
  }, [])

  async function onDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (busy) return
    try {
      const collected = await collectFilesFromDataTransfer(e.dataTransfer)
      addFiles(collected)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : '读取拖入文件失败')
    }
  }

  async function onUpload() {
    if (!files.length && !plainText.trim()) {
      setMsg('请拖入/选择文件或粘贴文本')
      return
    }
    setBusy(true)
    setMsg('')
    setUploadProgress('')
    try {
      let ok = 0
      let fail = 0
      if (files.length) {
        const singleTitle = files.length === 1 ? title.trim() : ''
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          setUploadProgress(`上传中 ${i + 1}/${files.length}：${displayPath(file)}`)
          try {
            const contentBase64 = await fileToBase64(file)
            await uploadTenantKbDocument({
              tenantId: tenantHint,
              title: singleTitle || displayPath(file),
              fileName: file.name,
              contentType: file.type || 'application/octet-stream',
              contentBase64,
              summary: summary.trim(),
            })
            ok += 1
          } catch {
            fail += 1
          }
        }
      } else {
        await uploadTenantKbDocument({
          tenantId: tenantHint,
          title: title.trim() || '文本资料',
          fileName: 'note.txt',
          contentType: 'text/plain',
          plainText: plainText.trim(),
          summary: summary.trim(),
        })
        ok = 1
      }
      setTitle('')
      setPlainText('')
      setSummary('')
      setFiles([])
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (folderInputRef.current) folderInputRef.current.value = ''
      setMsg(
        fail
          ? `完成：成功 ${ok}，失败 ${fail}`
          : `上传成功 ${ok} 项，对话时将自动检索投喂`,
      )
      await load()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '上传失败')
    } finally {
      setBusy(false)
      setUploadProgress('')
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
      {uploadProgress ? <p className="text-sm text-cyan-700">{uploadProgress}</p> : null}

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium text-slate-800">上传资料</h2>
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500"
          placeholder="标题（可选；多文件时每项用文件名）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
        />

        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              fileInputRef.current?.click()
            }
          }}
          onDragEnter={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!busy) setDragOver(true)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!busy) setDragOver(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (e.currentTarget === e.target) setDragOver(false)
          }}
          onDrop={(e) => void onDrop(e)}
          onClick={() => !busy && fileInputRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
            dragOver
              ? 'border-cyan-500 bg-cyan-50'
              : 'border-slate-300 bg-slate-50 hover:border-cyan-400 hover:bg-cyan-50/50'
          } ${busy ? 'pointer-events-none opacity-60' : ''}`}
        >
          <Upload className={`mx-auto h-8 w-8 ${dragOver ? 'text-cyan-600' : 'text-slate-400'}`} />
          <p className="mt-2 text-sm font-medium text-slate-700">
            拖入文件或文件夹到此处（支持全部格式）
          </p>
          <p className="mt-1 text-xs text-slate-500">也可点击选择多文件；支持 PDF / Word / PPT / 图片 / 视频 / Markdown 等</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation()
                fileInputRef.current?.click()
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              选择文件
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation()
                folderInputRef.current?.click()
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              选择文件夹
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            addFiles(Array.from(e.target.files || []))
            e.target.value = ''
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            addFiles(Array.from(e.target.files || []))
            e.target.value = ''
          }}
        />

        {files.length > 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">
                待上传 {files.length} 个文件（共 {fmtSize(files.reduce((s, f) => s + f.size, 0))}）
              </span>
              <button
                type="button"
                disabled={busy}
                className="text-xs text-rose-600 hover:underline disabled:opacity-50"
                onClick={() => setFiles([])}
              >
                清空
              </button>
            </div>
            <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600">
              {files.map((f, idx) => (
                <li key={`${displayPath(f)}-${f.size}-${idx}`} className="flex items-center justify-between gap-2">
                  <span className="truncate" title={displayPath(f)}>
                    {displayPath(f)} · {fmtSize(f.size)}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    className="shrink-0 text-slate-400 hover:text-rose-500 disabled:opacity-50"
                    aria-label="移除"
                    onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <textarea
          className="min-h-[100px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500"
          placeholder="或直接粘贴文本"
          value={plainText}
          onChange={(e) => setPlainText(e.target.value)}
          disabled={busy}
        />
        <textarea
          className="min-h-[72px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500"
          placeholder="说明/字幕摘要（图片/视频建议填写；批量上传时共用）"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          disabled={busy}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void onUpload()}
          className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {files.length > 1 ? `一键上传（${files.length}）` : '一键上传'}
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
