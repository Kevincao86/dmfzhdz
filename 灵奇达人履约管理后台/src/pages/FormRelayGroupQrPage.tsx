import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchMpRegistry } from '../lib/mpApi'
import { groupQrFromRegistry } from '../lib/mpSync/mpGroupQr'
import { BtnOutline } from '../components/ui/MockupLayouts'
import {
  FORM_RELAY_GROUP_QR_COMING_SOON_MSG,
  FORM_RELAY_GROUP_QR_COMING_SOON_TITLE,
  isFormRelayGroupQrFeatureEnabled,
} from '@merchant/lib/formRelayGroupQrFeature'

export default function FormRelayGroupQrPage() {
  const { id } = useParams()
  const [title, setTitle] = useState('扫码进群')
  const [groupQrImage, setGroupQrImage] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!isFormRelayGroupQrFeatureEnabled()) {
      setTitle(FORM_RELAY_GROUP_QR_COMING_SOON_TITLE)
      setErr(FORM_RELAY_GROUP_QR_COMING_SOON_MSG)
      setLoading(false)
      return
    }
    const mpOrderId = String(id || '').trim()
    if (!mpOrderId) {
      setErr('缺少招募单号')
      setLoading(false)
      return
    }
    void (async () => {
      setLoading(true)
      setErr('')
      try {
        const reg = await fetchMpRegistry({ includeMpOrderIds: [mpOrderId] })
        const list = (Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []) as Record<
          string,
          unknown
        >[]
        const mp = list.find((o) => o && String(o.id) === mpOrderId) || null
        const qr = groupQrFromRegistry(reg, mpOrderId, mp)
        if (!qr) {
          setErr('群二维码暂不可用，请联系招募方')
          setGroupQrImage('')
        } else {
          setGroupQrImage(qr)
        }
        if (mp) {
          setTitle(String(mp.title || mp.customerName || '扫码进群'))
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  return (
    <div className="page-content-shell page-content-shell--narrow">
      <div className="surface-card rounded-2xl border border-slate-200 p-6 text-center">
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        {isFormRelayGroupQrFeatureEnabled() ? (
          <p className="mt-2 text-sm text-slate-500">长按或右键保存下方二维码，识别后即可加入微信群</p>
        ) : null}
        {loading ? <p className="mt-8 text-sm text-slate-400">加载中…</p> : null}
        {!loading && err ? <p className="mt-8 text-sm text-red-600">{err}</p> : null}
        {!loading && groupQrImage ? (
          <div className="mx-auto mt-8 max-w-xs rounded-2xl bg-slate-50 p-4">
            <img src={groupQrImage} alt="群二维码" className="mx-auto max-h-80 w-full object-contain" />
          </div>
        ) : null}
        <div className="mt-8">
          <Link to={id ? `/recruitment/${encodeURIComponent(id)}` : '/hall'}>
            <BtnOutline>返回招募详情</BtnOutline>
          </Link>
        </div>
      </div>
    </div>
  )
}
