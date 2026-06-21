import { useRef, useState } from 'react'
import { parseLibraryFeaturesSheet } from './libraryFeaturesSheetParse'
import { batchPatchLibraryFeatures } from './opsRegistryApi'

type Props = {
  kind: 'pr' | 'talent'
  onDone: () => void | Promise<void>
}

export default function OpsLibraryFeaturesImport({ kind, onDone }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [open, setOpen] = useState(false)

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || importing) return
    setImporting(true)
    try {
      const buf = await file.arrayBuffer()
      const { rows, errors } = parseLibraryFeaturesSheet(buf, kind)
      if (!rows.length) {
        window.alert(errors.length ? errors.slice(0, 8).join('\n') : '未解析到有效行')
        return
      }
      const preview = errors.length
        ? `\n\n解析警告（${errors.length} 条）：\n${errors.slice(0, 5).join('\n')}`
        : ''
      if (
        !window.confirm(
          `将批量更新 ${rows.length} 条${kind === 'pr' ? ' PR' : '达人'}记录的功能开通状态，是否继续？${preview}`,
        )
      ) {
        return
      }
      const r = await batchPatchLibraryFeatures({ kind, rows })
      if (!r.ok) {
        window.alert(r.error ?? '批量更新失败')
        return
      }
      const skipped = r.skippedIds?.length ? `\n未匹配：${r.skippedIds.slice(0, 8).join('、')}` : ''
      window.alert(`已更新 ${r.updatedCount ?? 0} 条${skipped}`)
      setOpen(false)
      await onDone()
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
      >
        表格导入开通
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-xl">
            <h3 className="text-base font-semibold text-white">表格批量开通 / 关闭</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              上传 .xlsx，首列填写
              {kind === 'pr' ? '灵祺 PRID（LQ-P-xxxxxx）' : '灵祺达人 ID（LQ-D-xxxxxx）'}，可选列：
              <strong className="text-slate-300">增值服务</strong>、
              <strong className="text-slate-300">推荐大厅</strong>。填「开通/关闭」「是/否」「1/0」均可。
            </p>
            <label className="mt-4 block text-xs font-medium text-slate-400">选择表格（.xlsx）</label>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              disabled={importing}
              onChange={(ev) => void onFileChange(ev)}
              className="mt-1 block w-full text-xs text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-indigo-600 file:px-3 file:py-1.5 file:text-xs file:text-white"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={importing}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:text-white"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
