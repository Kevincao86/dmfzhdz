import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { cn } from '../../cn'
import { readMerchantSession } from '../../lib/merchantSession'
import type { DouyinStoreRow } from '../../services/douyinMerchantApi'
import { getDouyinStoreDetail, postDouyinPoiClaim } from '../../services/douyinMerchantApi'
import { fetchStoresForPlatform } from '../../services/merchantStoresApi'

const STEPS = ['选择门店', '提交资质', '平台审核', '完成认领'] as const

const CLAIM_DOC =
  'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/life.capacity.shop/poi.claim'

type Props = {
  open: boolean
  onClose: () => void
  onFinished: () => void
}

function isLikelyAlreadyClaimed(row: DouyinStoreRow): boolean {
  const s = `${row.claimStatus ?? ''}${row.status ?? ''}${row.businessStatus ?? ''}`
  return /已认领|认领成功|认领通过/.test(s)
}

export default function DouyinClaimStoreWizard({ open, onClose, onFinished }: Props) {
  const [step, setStep] = useState(0)
  const [kw, setKw] = useState('')
  const [city, setCity] = useState('')
  const [category, setCategory] = useState('')
  const [candidates, setCandidates] = useState<DouyinStoreRow[]>([])
  const [rawPool, setRawPool] = useState<DouyinStoreRow[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [poiIdLookup, setPoiIdLookup] = useState('')
  const [lookupErr, setLookupErr] = useState<string | null>(null)
  const [selected, setSelected] = useState<DouyinStoreRow | null>(null)

  const [storeName, setStoreName] = useState('')
  const [majorIndustry, setMajorIndustry] = useState('010503')
  const [minorCodes, setMinorCodes] = useState('011608')
  const [brand, setBrand] = useState('')
  const [region, setRegion] = useState('')
  const [detailAddress, setDetailAddress] = useState('')
  const [bizStatus, setBizStatus] = useState('营业中')
  const [bizHours, setBizHours] = useState('周一至周日 00:00-24:00')
  const [bizPhone, setBizPhone] = useState('')

  const [companyName, setCompanyName] = useState('')
  const [licenseId, setLicenseId] = useState('')
  const [licenseUrls, setLicenseUrls] = useState('')
  const [legalName, setLegalName] = useState('')
  const [legalIdNo, setLegalIdNo] = useState('')
  const [legalExpire, setLegalExpire] = useState('')
  const [idFrontUrl, setIdFrontUrl] = useState('')
  const [idBackUrl, setIdBackUrl] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerRole, setOwnerRole] = useState('店长')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitErr, setSubmitErr] = useState<string | null>(null)
  const [submitRaw, setSubmitRaw] = useState<string | null>(null)

  const reset = useCallback(() => {
    setStep(0)
    setKw('')
    setCity('')
    setCategory('')
    setCandidates([])
    setRawPool([])
    setPoiIdLookup('')
    setLookupErr(null)
    setSelected(null)
    setSubmitErr(null)
    setSubmitRaw(null)
  }, [])

  useEffect(() => {
    if (open) reset()
  }, [open, reset])

  const filterLocal = useCallback(
    (rows: DouyinStoreRow[]) => {
      let out = rows
      const c = city.trim()
      if (c) {
        out = out.filter((r) =>
          `${r.addressHierarchy ?? ''}${r.address ?? ''}${r.city ?? ''}`.includes(c),
        )
      }
      const cat = category.trim()
      if (cat) {
        out = out.filter((r) => r.name.includes(cat))
      }
      return out
    },
    [city, category],
  )

  const searchStores = useCallback(async () => {
    setLoadingList(true)
    setLookupErr(null)
    const merged: DouyinStoreRow[] = []
    const seen = new Set<string>()
    try {
      for (let p = 1; p <= 12; p++) {
        const res = await fetchStoresForPlatform('douyin', {
          page: p,
          pageSize: 50,
          keyword: kw.trim() || undefined,
          claimScope: 'claimed',
          relationType: 'all',
          refresh: false,
        })
        if (!res.ok) {
          setLookupErr(res.message)
          setCandidates([])
          setRawPool([])
          return
        }
        for (const it of res.items) {
          if (!seen.has(it.id)) {
            seen.add(it.id)
            merged.push(it)
          }
        }
        if (res.items.length < 50) break
        if (merged.length >= res.total) break
      }
      setRawPool(merged)
      setCandidates(filterLocal(merged))
    } finally {
      setLoadingList(false)
    }
  }, [kw, filterLocal])

  useEffect(() => {
    if (!rawPool.length) return
    setCandidates(filterLocal(rawPool))
  }, [city, category, rawPool, filterLocal])

  useEffect(() => {
    if (!open) return
    void searchStores()
    // 仅在打开向导时拉首屏；关键词变更请点「搜索门店」
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const lookupByPoiId = async () => {
    const id = poiIdLookup.trim()
    if (!id) return
    const token = readMerchantSession('meoo_douyin_merchant_token')
    if (!token) {
      setLookupErr('请先绑定抖音来客')
      return
    }
    setLookupErr(null)
    const res = await getDouyinStoreDetail({ accessToken: token, poiId: id })
    if (!res.ok || !res.items[0]) {
      setLookupErr(res.ok ? '未查到该 POI' : res.message)
      return
    }
    const row = res.items[0]
    setRawPool((prev) => {
      if (prev.some((p) => p.id === row.id)) return prev
      return [row, ...prev]
    })
    setCandidates((prev) => {
      if (prev.some((p) => p.id === row.id)) return prev
      return [row, ...prev]
    })
  }

  const applySelectionToForm = (row: DouyinStoreRow) => {
    setStoreName(row.name)
    setDetailAddress(row.addressHierarchy ?? row.address ?? '')
    setRegion(row.city ?? '')
    setBrand(row.organization ?? '')
    setBizPhone(row.phone ?? '')
    setBizHours(row.businessHours ?? '周一至周日 00:00-24:00')
    setBizStatus(row.businessStatus ?? row.status ?? '营业中')
  }

  const goNext = () => {
    setSubmitErr(null)
    if (step === 0) {
      if (!selected) {
        setLookupErr('请先选择一家门店')
        return
      }
      setLookupErr(null)
      applySelectionToForm(selected)
      setStep(1)
      return
    }
    if (step === 1) {
      if (!storeName.trim() || !detailAddress.trim()) {
        setLookupErr('请填写门店名称与详细地址')
        return
      }
      setLookupErr(null)
      setStep(2)
      return
    }
    if (step === 2) {
      if (!companyName.trim() || !licenseId.trim() || !licenseUrls.trim()) {
        setLookupErr('请填写营业执照主体、证照编号及证照图片 URL')
        return
      }
      if (!legalName.trim() || !legalIdNo.trim() || !idFrontUrl.trim() || !idBackUrl.trim()) {
        setLookupErr('请完善法人信息与证件图 URL')
        return
      }
      if (!ownerPhone.trim()) {
        setLookupErr('请填写负责人手机号')
        return
      }
      setLookupErr(null)
      setStep(3)
      return
    }
    if (step === 3) {
      void submitClaim()
    }
  }

  const submitClaim = async () => {
    const token = readMerchantSession('meoo_douyin_merchant_token')
    const accountId = readMerchantSession('meoo_douyin_merchant_id')
    if (!token || !accountId || !selected) {
      setSubmitErr('缺少绑定信息或门店')
      return
    }
    const urls = licenseUrls
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean)
    const minor = minorCodes
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean)
    const body: Record<string, unknown> = {
      target_type: 100,
      datas: [
        {
          account_id: accountId,
          poi_id: selected.id,
          license: {
            use_ocr: false,
            company_name: companyName.trim(),
            license_id: licenseId.trim(),
            license_urls: urls,
            license_type: 91,
            expiration: '2031-12-31',
            province: region.split(/[\/／]/)[0] ?? '',
            city: region.split(/[\/／]/)[1] ?? region,
            address: detailAddress.trim(),
            sales_range: '门店服务',
            legal_person_name: legalName.trim(),
          },
          legal_person: {
            id_card_expiration: legalExpire.trim() || '2031-12-31',
            id_card_front_url: idFrontUrl.trim(),
            id_card_back_url: idBackUrl.trim(),
            id_card_no: legalIdNo.trim(),
            name: legalName.trim(),
            use_ocr: false,
            qualification_type: 116,
          },
          industry: {
            major_industry_code: majorIndustry.trim(),
            minor_industry_codes: minor.length ? minor : ['011608'],
            qualifications: [],
          },
          owner: {
            name: ownerName.trim() || legalName.trim(),
            role: ownerRole.trim() || '店长',
            phone: ownerPhone.trim(),
            email: ownerEmail.trim() || 'owner@example.com',
          },
        },
      ],
    }
    setSubmitting(true)
    setSubmitErr(null)
    const res = await postDouyinPoiClaim({ accessToken: token, body })
    setSubmitting(false)
    if (!res.ok) {
      setSubmitErr(res.message)
      return
    }
    setSubmitRaw(res.bodyText)
    setStep(4)
    onFinished()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h2 className="text-lg font-semibold text-gray-900">认领门店</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-gray-100 bg-gray-50 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full font-semibold',
                    i === step ? 'bg-blue-600 text-white' : i < step ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600',
                  )}
                >
                  {i + 1}
                </span>
                <span className={i === step ? 'font-medium text-blue-800' : ''}>{label}</span>
                {i < STEPS.length - 1 ? <ChevronRight className="h-4 w-4 text-gray-400" /> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {lookupErr && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {lookupErr}
            </div>
          )}

          {step === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                列表与搜索已与抖音来客门店数据同步；支持按 <strong>门店名称、门店 ID、三方 ID、备注</strong>{' '}
                检索。若在库中暂无对应 POI，可直接输入门店 POI ID 精确查询后加入列表。
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[140px]">
                  <label className="mb-1 block text-xs text-gray-500">选择城市</label>
                  <select
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm"
                  >
                    <option value="">全部</option>
                    <option value="北京">北京</option>
                    <option value="上海">上海</option>
                    <option value="杭州">杭州</option>
                    <option value="广州">广州</option>
                    <option value="佛山">佛山</option>
                    <option value="渭南">渭南</option>
                    <option value="池州">池州</option>
                    <option value="陕西">陕西</option>
                    <option value="浙江">浙江</option>
                  </select>
                </div>
                <div className="min-w-[140px]">
                  <label className="mb-1 block text-xs text-gray-500">选择品类（名称包含）</label>
                  <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="如 数码、餐饮"
                    className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm"
                  />
                </div>
                <div className="min-w-[200px] flex-1">
                  <label className="mb-1 block text-xs text-gray-500">关键词（门店名 / 门店 ID）</label>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      value={kw}
                      onChange={(e) => setKw(e.target.value)}
                      placeholder="门店名称或 POI ID"
                      className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-2 text-sm"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  disabled={loadingList}
                  onClick={() => void searchStores()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {loadingList ? '搜索中…' : '搜索门店'}
                </button>
              </div>
              <div className="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
                <div className="min-w-[200px] flex-1">
                  <label className="mb-1 block text-xs text-gray-500">按 POI ID 精确查询并加入列表</label>
                  <input
                    value={poiIdLookup}
                    onChange={(e) => setPoiIdLookup(e.target.value)}
                    placeholder="数字 POI ID"
                    className="w-full rounded-lg border border-gray-200 px-2 py-2 font-mono text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void lookupByPoiId()}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
                >
                  查询加入
                </button>
              </div>
              <p className="text-xs text-gray-500">请选择一家门店进行认领</p>
              <div className="grid max-h-[360px] grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                {candidates.map((row) => {
                  const claimed = isLikelyAlreadyClaimed(row)
                  const active = selected?.id === row.id
                  return (
                    <button
                      key={row.id}
                      type="button"
                      disabled={claimed}
                      onClick={() => !claimed && setSelected(row)}
                      className={cn(
                        'relative rounded-xl border p-3 text-left text-sm transition-colors',
                        claimed && 'cursor-not-allowed opacity-60',
                        active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300',
                      )}
                    >
                      {claimed && (
                        <span className="absolute right-2 top-2 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-700">
                          已认领
                        </span>
                      )}
                      {!claimed && (
                        <span
                          className={cn(
                            'absolute right-2 top-2 h-4 w-4 rounded-full border-2',
                            active ? 'border-blue-600 bg-blue-600' : 'border-gray-300',
                          )}
                        />
                      )}
                      <div className="pr-8 font-medium text-gray-900">{row.name}</div>
                      <div className="mt-1 font-mono text-[10px] text-gray-500">ID {row.id}</div>
                      <div className="mt-1 line-clamp-2 text-xs text-gray-600">
                        {row.addressHierarchy ?? row.address ?? '—'}
                      </div>
                    </button>
                  )
                })}
              </div>
              {!loadingList && candidates.length === 0 && (
                <p className="text-center text-sm text-gray-500">无匹配门店，请更换关键词或使用 POI ID 查询</p>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="mx-auto max-w-lg space-y-3 text-sm">
              <h3 className="font-semibold text-gray-900">门店信息</h3>
              <label className="block">
                <span className="text-xs text-gray-500">门店名称</span>
                <input
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">主营类目编码（major_industry_code）</span>
                <input
                  value={majorIndustry}
                  onChange={(e) => setMajorIndustry(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">辅营类目编码（逗号分隔）</span>
                <input
                  value={minorCodes}
                  onChange={(e) => setMinorCodes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">门店品牌</span>
                <input value={brand} onChange={(e) => setBrand(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">所在地区（省/市/区，斜杠分隔）</span>
                <input value={region} onChange={(e) => setRegion(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">详细地址</span>
                <textarea
                  value={detailAddress}
                  onChange={(e) => setDetailAddress(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">营业状态</span>
                <input value={bizStatus} onChange={(e) => setBizStatus(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">营业时间（文案）</span>
                <input value={bizHours} onChange={(e) => setBizHours(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">营业电话</span>
                <input value={bizPhone} onChange={(e) => setBizPhone(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" />
              </label>
              <p className="text-xs text-gray-500">
                以上字段与抖音来客「提交资质」页对齐；最终提交仍须符合{' '}
                <a className="text-blue-600 underline" href={CLAIM_DOC} target="_blank" rel="noreferrer">
                  poi.claim
                </a>{' '}
                的 JSON 结构。
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="mx-auto max-w-lg space-y-3 text-sm">
              <h3 className="font-semibold text-gray-900">营业执照 · 类目 · 法人</h3>
              <label className="block">
                <span className="text-xs text-gray-500">营业执照 · 公司名称</span>
                <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">统一社会信用代码 / 证照编号</span>
                <input value={licenseId} onChange={(e) => setLicenseId(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">证照图片 URL（每行一个，需公网可访问）</span>
                <textarea
                  value={licenseUrls}
                  onChange={(e) => setLicenseUrls(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">法人姓名</span>
                <input value={legalName} onChange={(e) => setLegalName(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">证件号</span>
                <input value={legalIdNo} onChange={(e) => setLegalIdNo(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">证件有效期（如 2035-12-31）</span>
                <input value={legalExpire} onChange={(e) => setLegalExpire(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">身份证人像面 URL</span>
                <input value={idFrontUrl} onChange={(e) => setIdFrontUrl(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">身份证国徽面 URL</span>
                <input value={idBackUrl} onChange={(e) => setIdBackUrl(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">负责人姓名</span>
                <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">负责人职务</span>
                <input value={ownerRole} onChange={(e) => setOwnerRole(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">负责人手机号</span>
                <input value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">负责人邮箱</span>
                <input value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" />
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 text-sm text-gray-700">
              <h3 className="font-semibold text-gray-900">平台审核</h3>
              <p>
                将把资质资料提交至抖音来客进行认领审核。提交后请留意平台返回的处理编号，可在抖音来客或通过「门店任务进度」等功能查看审核结果。
              </p>
              <ul className="list-inside list-disc text-xs text-gray-600">
                <li>门店：{selected?.name}</li>
                <li>POI：{selected?.id}</li>
                <li>主体：{companyName}</li>
              </ul>
              {submitErr && <p className="text-sm text-red-600">{submitErr}</p>}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3 text-sm">
              <h3 className="font-semibold text-green-800">完成认领</h3>
              <p className="text-gray-700">请求已发送，列表将自动刷新。以下为平台返回简要信息：</p>
              <pre className="max-h-48 overflow-auto rounded-lg bg-gray-900 p-3 text-xs text-green-100">{submitRaw ?? '（无返回体）'}</pre>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            disabled={step === 0 || step === 4}
            onClick={() => {
              setSubmitErr(null)
              setLookupErr(null)
              setStep((s) => Math.max(0, s - 1))
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            上一步
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              {step === 4 ? '关闭' : '取消'}
            </button>
            {step < 4 && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => goNext()}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {step === 3 ? (submitting ? '提交中…' : '提交审核') : '下一步'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
