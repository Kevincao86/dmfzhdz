import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchRegistry, type RegistryMpPrUser } from '../opsRegistryApi'

export default function OpsPrLibraryPage() {
  const [rows, setRows] = useState<RegistryMpPrUser[]>([])
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetchRegistry()
      setRows(r.mpPrUsers ?? [])
    } catch {
      setRows([])
    }
  }, [])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 8000)
    return () => window.clearInterval(t)
  }, [load])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let list = [...rows]
    if (needle) {
      list = list.filter((u) => {
        const blob = [
          u.lingqiPrId,
          u.companyName,
          u.personalName,
          u.contactName,
          u.contactPhone,
          u.wechatId,
          u.wxNickName,
          u.province,
          u.city,
        ]
          .join(' ')
          .toLowerCase()
        return blob.includes(needle)
      })
    }
    return list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  }, [rows, q])

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">PR 用户库</h1>
        <p className="mt-1 text-sm text-slate-500">
          小程序 PR 填写机构/企业/个人资料后自动入库；PRID（LQ-P-xxxxxx）与达人 ID 区分。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索 PRID / 机构 / 联系人 / 手机 / 微信"
          className="min-w-[240px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
        />
        <button type="button" onClick={() => void load()} className="text-xs text-indigo-400 hover:underline">
          刷新
        </button>
        <span className="text-xs text-slate-500">共 {filtered.length} 人</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="min-w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-900/80 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3">PRID</th>
              <th className="px-4 py-3">主体</th>
              <th className="px-4 py-3">名称</th>
              <th className="px-4 py-3">联系人</th>
              <th className="px-4 py-3">手机</th>
              <th className="px-4 py-3">微信</th>
              <th className="px-4 py-3">地区</th>
              <th className="px-4 py-3">更新时间</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-t border-slate-800/80 hover:bg-slate-900/50">
                <td className="px-4 py-3 font-mono text-indigo-300">{u.lingqiPrId}</td>
                <td className="px-4 py-3">{u.accountType === 'personal' ? '个人' : '机构'}</td>
                <td className="px-4 py-3">
                  {u.accountType === 'personal' ? u.personalName : u.companyName}
                </td>
                <td className="px-4 py-3">{u.contactName || '—'}</td>
                <td className="px-4 py-3">{u.contactPhone || '—'}</td>
                <td className="px-4 py-3">{u.wechatId || u.wxNickName || '—'}</td>
                <td className="px-4 py-3">
                  {[u.province, u.city].filter(Boolean).join(' · ') || '—'}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{u.updatedAt}</td>
              </tr>
            ))}
            {!filtered.length ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                  暂无 PR 用户，请引导小程序 PR 身份保存资料
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
