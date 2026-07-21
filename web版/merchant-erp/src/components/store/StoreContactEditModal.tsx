/**
 * 平台未返回电话/营业时间时，手填补充（写入租户 localStorage）。
 */
import { useEffect, useState } from 'react'
import {
  getStoreContactOverride,
  saveStoreContactOverride,
} from '../../lib/storeContactOverride'

type Props = {
  open: boolean
  platform: string
  poiId: string
  storeName?: string
  /** 平台已返回的值（有则只读展示，不手改） */
  platformPhone?: string
  platformBusinessHours?: string
  onClose: () => void
  onSaved: () => void
}

export default function StoreContactEditModal({
  open,
  platform,
  poiId,
  storeName,
  platformPhone,
  platformBusinessHours,
  onClose,
  onSaved,
}: Props) {
  const apiPhone = platformPhone?.trim() || ''
  const apiHours = platformBusinessHours?.trim() || ''
  const phoneLocked = Boolean(apiPhone)
  const hoursLocked = Boolean(apiHours)

  const [phone, setPhone] = useState('')
  const [businessHours, setBusinessHours] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const ov = getStoreContactOverride(platform, poiId)
    setPhone(apiPhone || ov?.phone || '')
    setBusinessHours(apiHours || ov?.businessHours || '')
    setErr(null)
  }, [open, platform, poiId, apiPhone, apiHours])

  if (!open) return null

  const bothFromPlatform = phoneLocked && hoursLocked

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="store-contact-edit-title"
        className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl"
      >
        <h2 id="store-contact-edit-title" className="text-base font-semibold text-gray-900">
          补充营业电话与营业时间
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          {storeName ? `门店：${storeName}` : `门店 ID：${poiId}`}
          。平台未返回的字段可手填，保存在本账号本地；平台已有值以平台为准。
        </p>

        {bothFromPlatform ? (
          <p className="mt-3 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
            该门店电话与营业时间均可从平台读取，无需手填。
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">营业电话</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={phoneLocked}
                placeholder={phoneLocked ? undefined : '如 0571-88888888 或 13800138000'}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
              />
              {phoneLocked ? (
                <p className="mt-1 text-[11px] text-gray-400">来自平台，不可改</p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">营业时间</label>
              <textarea
                value={businessHours}
                onChange={(e) => setBusinessHours(e.target.value)}
                disabled={hoursLocked}
                rows={3}
                placeholder={hoursLocked ? undefined : '如 周一至周日 10:00-22:00'}
                className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
              />
              {hoursLocked ? (
                <p className="mt-1 text-[11px] text-gray-400">来自平台，不可改</p>
              ) : null}
            </div>
          </div>
        )}

        {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            {bothFromPlatform ? '关闭' : '取消'}
          </button>
          {!bothFromPlatform ? (
            <button
              type="button"
              onClick={() => {
                const nextPhone = phoneLocked ? '' : phone.trim()
                const nextHours = hoursLocked ? '' : businessHours.trim()
                if (!nextPhone && !nextHours) {
                  setErr('请至少填写电话或营业时间之一')
                  return
                }
                saveStoreContactOverride(platform, poiId, {
                  phone: nextPhone,
                  businessHours: nextHours,
                })
                onSaved()
                onClose()
              }}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              保存
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
