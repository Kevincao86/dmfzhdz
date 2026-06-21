import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiUrl } from '../lib/mpApiBase'
import { buildPrInfoText, type PublisherDisplayHit } from '../lib/mpSync/prRecruitQr'

export default function PublicPrInfoPage() {
  const { orderId = '' } = useParams()
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [title, setTitle] = useState('')
  const [prText, setPrText] = useState('')

  useEffect(() => {
    const id = decodeURIComponent(String(orderId || '').trim())
    if (!id) {
      setErr('缺少招募单号')
      setLoading(false)
      return
    }
    void (async () => {
      setLoading(true)
      setErr('')
      try {
        const [hallRes, pubRes] = await Promise.all([
          fetch(apiUrl('/api/meoo-ops-mp-hall-registry'), { method: 'GET' }),
          fetch(apiUrl(`/api/meoo-ops-mp-publisher-display?mpOrderId=${encodeURIComponent(id)}`), {
            method: 'GET',
          }).catch(() => null),
        ])
        const data = (await hallRes.json()) as {
          ok?: boolean
          mpRecruitmentOrders?: Record<string, unknown>[]
          mpPrUsers?: Record<string, unknown>[]
        }
        if (!hallRes.ok || data.ok === false) {
          throw new Error('招募信息暂不可用')
        }
        const list = Array.isArray(data.mpRecruitmentOrders) ? data.mpRecruitmentOrders : []
        const mp = list.find((o) => o && String(o.id || '') === id)
        if (!mp) {
          setErr('招募单不存在或已结束')
          return
        }
        let publisherDisplay: PublisherDisplayHit | null = null
        if (pubRes && pubRes.ok) {
          try {
            const pub = (await pubRes.json()) as {
              ok?: boolean
              displayName?: string
              prUser?: Record<string, unknown> | null
            }
            if (pub.ok && (pub.displayName || pub.prUser)) {
              publisherDisplay = { displayName: pub.displayName, prUser: pub.prUser }
            }
          } catch {
            /* optional */
          }
        }
        const mpPrUsers = Array.isArray(data.mpPrUsers) ? data.mpPrUsers : []
        setTitle(String(mp.title || mp.customerName || '招募详情').trim())
        setPrText(
          buildPrInfoText(mp, {
            publisherDisplay,
            mpPrUsers,
          }),
        )
      } catch (e) {
        setErr(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [orderId])

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">灵祺星选 · 招募方认证</p>
        {loading ? <p className="text-sm text-slate-600">加载中…</p> : null}
        {err ? <p className="text-sm text-red-600">{err}</p> : null}
        {!loading && !err ? (
          <>
            <h1 className="text-lg font-bold leading-snug text-slate-900">{title || '招募方'}</h1>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-800">{prText}</pre>
          </>
        ) : null}
        <Link to="/" className="inline-block text-sm text-violet-700 hover:underline">
          打开灵祺星选
        </Link>
      </div>
    </div>
  )
}
