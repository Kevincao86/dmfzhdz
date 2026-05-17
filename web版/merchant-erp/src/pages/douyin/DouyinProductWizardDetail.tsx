import { ChevronLeft, Upload, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import DouyinStorePickerModal from '../../components/store/DouyinStorePickerModal'
import {
  NonConsumeDatesModal,
  PurchaseLimitModal,
  ReserveAdvanceModal,
  SalePeriodModal,
  TimePeriodsModal,
  VoucherUseLimitModal,
} from '../../components/douyin/DouyinProductFormModals'
import { cn } from '../../cn'
import {
  buildTradeRuleDescriptionLines,
  type DouyinProductFormRules,
  type DouyinTimePeriod,
  type DouyinWeekdayKey,
} from '../../lib/douyinProductRuleText'
import { DEFAULT_TEMPLATE_SALES_CHANNELS } from '../../services/douyinProductApi'

const MAX_AUX = 4
const MAX_ENV = 10

export type DouyinWizardDetailProps = {
  isEdit: boolean
  productType: number | null
  productName: string
  setProductName: (v: string) => void
  productDesc: string
  setProductDesc: (v: string) => void
  priceYuan: string
  setPriceYuan: (v: string) => void
  originYuan: string
  setOriginYuan: (v: string) => void
  headUrl: string
  auxUrls: string[]
  setAuxUrls: (v: string[]) => void
  envUrls: string[]
  setEnvUrls: (v: string[]) => void
  itemName: string
  setItemName: (v: string) => void
  itemPriceYuan: string
  setItemPriceYuan: (v: string) => void
  salesChannel: string
  setSalesChannel: (v: string) => void
  saleTimeLimited: boolean
  setSaleTimeLimited: (v: boolean) => void
  saleStart: string
  saleEnd: string
  setSalePeriod: (start: string, end: string) => void
  consumeValidDays: string
  setConsumeValidDays: (v: string) => void
  nonConsumeDateMode: 'all_dates' | 'partial_dates'
  setNonConsumeDateMode: (v: 'all_dates' | 'partial_dates') => void
  nonConsumeWeekdays: DouyinWeekdayKey[]
  nonConsumeHolidays: string[]
  nonConsumeSpecificDates: string[]
  setNonConsumePartial: (w: DouyinWeekdayKey[], h: string[], d: string[]) => void
  dailyAllDay: boolean
  setDailyAllDay: (v: boolean) => void
  dailyTimePeriods: DouyinTimePeriod[]
  setDailyTimePeriods: (p: DouyinTimePeriod[]) => void
  purchaseLimitMode: 'none' | 'limited'
  setPurchaseLimitMode: (v: 'none' | 'limited') => void
  purchaseLimitPerPerson: number
  purchaseLimitPerDay: number
  setPurchaseLimits: (perPerson: number, perDay: number) => void
  reserveMode: 'none' | 'required'
  setReserveMode: (v: 'none' | 'required') => void
  reserveAdvanceDays: number
  setReserveAdvanceDays: (v: number) => void
  voucherUseLimit: boolean
  setVoucherUseLimit: (v: boolean) => void
  voucherUseMax: number
  setVoucherUseMax: (v: number) => void
  afterSalePolicy: string
  setAfterSalePolicy: (v: string) => void
  selectedPoiIds: string[]
  selectedPoiNames: string[]
  storeModalOpen: boolean
  setStoreModalOpen: (v: boolean) => void
  onPoiConfirm: (ids: string[], names: string[]) => void
  uploading: boolean
  onPickImage: (file: File, slot: 'head' | 'aux' | 'env', index?: number) => void
  saving: boolean
  actionMsg: { text: string; ok: boolean } | null
  onSaveDraft: () => void
  onSubmit: () => void
  onBackType: () => void
}

export default function DouyinProductWizardDetail(props: DouyinWizardDetailProps) {
  const headRef = useRef<HTMLInputElement>(null)
  const auxRef = useRef<HTMLInputElement>(null)
  const envRef = useRef<HTMLInputElement>(null)

  const [saleModal, setSaleModal] = useState(false)
  const [nonConsumeModal, setNonConsumeModal] = useState(false)
  const [timeModal, setTimeModal] = useState(false)
  const [purchaseModal, setPurchaseModal] = useState(false)
  const [reserveModal, setReserveModal] = useState(false)
  const [voucherModal, setVoucherModal] = useState(false)

  const formRules: DouyinProductFormRules = useMemo(
    () => ({
      salesChannel: props.salesChannel,
      saleTimeLimited: props.saleTimeLimited,
      saleStart: props.saleStart,
      saleEnd: props.saleEnd,
      consumeValidDays: Number.parseInt(props.consumeValidDays, 10) || 360,
      nonConsumeDateMode: props.nonConsumeDateMode,
      nonConsumeWeekdays: props.nonConsumeWeekdays,
      nonConsumeHolidays: props.nonConsumeHolidays,
      nonConsumeSpecificDates: props.nonConsumeSpecificDates,
      dailyAllDay: props.dailyAllDay,
      dailyTimePeriods: props.dailyTimePeriods,
      purchaseLimitMode: props.purchaseLimitMode,
      purchaseLimitPerPerson: props.purchaseLimitPerPerson,
      purchaseLimitPerDay: props.purchaseLimitPerDay,
      reserveMode: props.reserveMode,
      reserveAdvanceDays: props.reserveAdvanceDays,
      voucherUseLimit: props.voucherUseLimit,
      voucherUseMax: props.voucherUseMax,
      afterSalePolicy: props.afterSalePolicy,
    }),
    [props],
  )

  const rulePreview = useMemo(() => buildTradeRuleDescriptionLines(formRules), [formRules])

  const uploadAux = (file: File, index: number) => {
    void props.onPickImage(file, 'aux', index)
  }

  const uploadEnv = (file: File, index: number) => {
    void props.onPickImage(file, 'env', index)
  }

  return (
    <section className="space-y-4">
      {!props.isEdit && (
        <button type="button" className="text-sm text-indigo-600" onClick={props.onBackType}>
          <ChevronLeft className="inline h-4 w-4" /> 返回类型
        </button>
      )}

      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        图片在对应区域展示；售卖/消费/预约等规则会写入<strong>商品说明</strong>并由服务端映射为开放平台字段（不影响当前可成功提交流程）。
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <h3 className="font-semibold text-gray-900">基础信息</h3>
          <label className="block text-sm">
            <span className="font-medium">商品名称 *</span>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={props.productName}
              onChange={(e) => props.setProductName(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">商品说明（含规则摘要）</span>
            <textarea
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              rows={4}
              value={props.productDesc}
              onChange={(e) => props.setProductDesc(e.target.value)}
              placeholder="欢迎到店体验，详询门店。"
            />
          </label>
          {rulePreview.length > 0 && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600 whitespace-pre-line">
              <p className="mb-1 font-medium text-gray-800">将一并写入说明的规则摘要：</p>
              {rulePreview.join('\n')}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="font-medium">售价（元）*</span>
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={props.priceYuan}
                onChange={(e) => props.setPriceYuan(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">划线价（元）</span>
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={props.originYuan}
                onChange={(e) => props.setOriginYuan(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <h3 className="font-semibold text-gray-900">图片</h3>
          <div>
            <span className="text-sm font-medium">头图 *</span>
            <div className="mt-2 flex items-center gap-3">
              {props.headUrl ? (
                <img src={props.headUrl} alt="" className="h-20 w-20 rounded-lg border object-cover" />
              ) : null}
              <button
                type="button"
                disabled={props.uploading}
                onClick={() => headRef.current?.click()}
                className="inline-flex items-center rounded-lg border px-3 py-2 text-sm"
              >
                <Upload className="mr-1 h-4 w-4" />
                上传头图
              </button>
              <input
                ref={headRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void props.onPickImage(f, 'head')
                }}
              />
            </div>
          </div>
          <div>
            <span className="text-sm font-medium">辅助图（最多 {MAX_AUX} 张）</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {props.auxUrls.map((u, i) => (
                <div key={i} className="relative">
                  {u ? (
                    <img src={u} alt="" className="h-16 w-16 rounded border object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded border border-dashed text-xs text-gray-400">
                      空
                    </div>
                  )}
                  {u ? (
                    <button
                      type="button"
                      className="absolute -right-1 -top-1 rounded-full bg-white shadow"
                      onClick={() => {
                        const next = [...props.auxUrls]
                        next[i] = ''
                        props.setAuxUrls(next.filter(Boolean).length ? next : [''])
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              ))}
              {props.auxUrls.filter(Boolean).length < MAX_AUX && (
                <button
                  type="button"
                  disabled={props.uploading}
                  onClick={() => {
                    if (props.auxUrls.length < MAX_AUX) {
                      props.setAuxUrls([...props.auxUrls, ''])
                    }
                    auxRef.current?.click()
                  }}
                  className="flex h-16 w-16 items-center justify-center rounded border border-dashed text-xs text-gray-500"
                >
                  +
                </button>
              )}
            </div>
            <input
              ref={auxRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                const idx = props.auxUrls.findIndex((u) => !u.trim())
                uploadAux(f, idx >= 0 ? idx : props.auxUrls.length)
              }}
            />
          </div>
          <div>
            <span className="text-sm font-medium">环境图（最多 {MAX_ENV} 张）</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {props.envUrls.map((u, i) => (
                <div key={i} className="relative">
                  {u ? (
                    <img src={u} alt="" className="h-16 w-16 rounded border object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded border border-dashed text-xs text-gray-400">
                      空
                    </div>
                  )}
                </div>
              ))}
              {props.envUrls.filter(Boolean).length < MAX_ENV && (
                <button
                  type="button"
                  disabled={props.uploading}
                  onClick={() => {
                    if (props.envUrls.length < MAX_ENV) props.setEnvUrls([...props.envUrls, ''])
                    envRef.current?.click()
                  }}
                  className="flex h-16 w-16 items-center justify-center rounded border border-dashed text-xs text-gray-500"
                >
                  +
                </button>
              )}
            </div>
            <input
              ref={envRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                const idx = props.envUrls.findIndex((u) => !u.trim())
                uploadEnv(f, idx >= 0 ? idx : props.envUrls.length)
              }}
            />
          </div>
        </div>
      </div>

      {props.productType === 1 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
          <h3 className="font-semibold">团购单品（商品组）</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm block">
              单品名称
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={props.itemName}
                onChange={(e) => props.setItemName(e.target.value)}
              />
            </label>
            <label className="text-sm block">
              单品标价（元）
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={props.itemPriceYuan}
                onChange={(e) => props.setItemPriceYuan(e.target.value)}
              />
            </label>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
        <h3 className="font-semibold">售卖与规则</h3>
        <label className="block text-sm max-w-md">
          投放渠道
          <select
            className="mt-1 w-full rounded-lg border px-3 py-2"
            value={props.salesChannel}
            onChange={(e) => props.setSalesChannel(e.target.value)}
          >
            {DEFAULT_TEMPLATE_SALES_CHANNELS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3 text-sm">
          <p className="font-medium">商品售卖日期</p>
          <div className="mt-2 flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={props.saleTimeLimited}
                onChange={() => props.setSaleTimeLimited(true)}
              />
              限时售卖
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={!props.saleTimeLimited}
                onChange={() => props.setSaleTimeLimited(false)}
              />
              不限时间
            </label>
            {props.saleTimeLimited && (
              <button
                type="button"
                className="text-indigo-600 underline"
                onClick={() => setSaleModal(true)}
              >
                选择时间段
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm block">
            售后政策
            <select
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={props.afterSalePolicy}
              onChange={(e) => props.setAfterSalePolicy(e.target.value)}
            >
              <option value="refund_anytime">随时退</option>
              <option value="refund_auto_expire">过期退</option>
              <option value="no_refund">不可退</option>
            </select>
          </label>
          <label className="text-sm block">
            有效天数
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={props.consumeValidDays}
              onChange={(e) => props.setConsumeValidDays(e.target.value)}
            />
          </label>
        </div>

        <div className="space-y-3 text-sm">
          <div className="rounded-lg border border-gray-100 p-3">
            <p className="font-medium">顾客可消费日期</p>
            <p className="mt-1 text-gray-600">购买后 {props.consumeValidDays} 天内可用</p>
          </div>
          <div className="rounded-lg border border-gray-100 p-3">
            <p className="font-medium">不可消费日期</p>
            <label className="mt-2 flex items-center gap-2">
              <input
                type="radio"
                checked={props.nonConsumeDateMode === 'all_dates'}
                onChange={() => props.setNonConsumeDateMode('all_dates')}
              />
              所有日期均可使用
            </label>
            <label className="mt-1 flex items-center gap-2">
              <input
                type="radio"
                checked={props.nonConsumeDateMode === 'partial_dates'}
                onChange={() => props.setNonConsumeDateMode('partial_dates')}
              />
              部分日期不可用
              {props.nonConsumeDateMode === 'partial_dates' && (
                <button type="button" className="text-indigo-600 underline" onClick={() => setNonConsumeModal(true)}>
                  设置
                </button>
              )}
            </label>
          </div>
          <div className="rounded-lg border border-gray-100 p-3">
            <p className="font-medium">每日使用时段</p>
            <label className="mt-2 flex items-center gap-2">
              <input type="radio" checked={props.dailyAllDay} onChange={() => props.setDailyAllDay(true)} />
              全天可用
            </label>
            <label className="mt-1 flex items-center gap-2">
              <input type="radio" checked={!props.dailyAllDay} onChange={() => props.setDailyAllDay(false)} />
              仅指定时间可用
              {!props.dailyAllDay && (
                <button type="button" className="text-indigo-600 underline" onClick={() => setTimeModal(true)}>
                  设置时段
                </button>
              )}
            </label>
          </div>
          <div className="rounded-lg border border-gray-100 p-3">
            <p className="font-medium">限制购买</p>
            <label className="mt-2 flex items-center gap-2">
              <input
                type="radio"
                checked={props.purchaseLimitMode === 'none'}
                onChange={() => props.setPurchaseLimitMode('none')}
              />
              不限制
            </label>
            <label className="mt-1 flex items-center gap-2">
              <input
                type="radio"
                checked={props.purchaseLimitMode === 'limited'}
                onChange={() => props.setPurchaseLimitMode('limited')}
              />
              限制购买
              {props.purchaseLimitMode === 'limited' && (
                <button type="button" className="text-indigo-600 underline" onClick={() => setPurchaseModal(true)}>
                  设置
                </button>
              )}
            </label>
          </div>
          <div className="rounded-lg border border-gray-100 p-3">
            <p className="font-medium">预约规则</p>
            <label className="mt-2 flex items-center gap-2">
              <input
                type="radio"
                checked={props.reserveMode === 'none'}
                onChange={() => props.setReserveMode('none')}
              />
              到店不需要预约
            </label>
            <label className="mt-1 flex items-center gap-2">
              <input
                type="radio"
                checked={props.reserveMode === 'required'}
                onChange={() => props.setReserveMode('required')}
              />
              到店需要预约
              {props.reserveMode === 'required' && (
                <button type="button" className="text-indigo-600 underline" onClick={() => setReserveModal(true)}>
                  设置
                </button>
              )}
            </label>
          </div>
          <div className="rounded-lg border border-gray-100 p-3">
            <p className="font-medium">使用张数</p>
            <label className="mt-2 flex items-center gap-2">
              <input
                type="radio"
                checked={!props.voucherUseLimit}
                onChange={() => props.setVoucherUseLimit(false)}
              />
              不限制张数
            </label>
            <label className="mt-1 flex items-center gap-2">
              <input
                type="radio"
                checked={props.voucherUseLimit}
                onChange={() => props.setVoucherUseLimit(true)}
              />
              限制张数
              {props.voucherUseLimit && (
                <button type="button" className="text-indigo-600 underline" onClick={() => setVoucherModal(true)}>
                  设置
                </button>
              )}
            </label>
          </div>
        </div>

        <button
          type="button"
          onClick={() => props.setStoreModalOpen(true)}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          选择适用门店（已选 {props.selectedPoiIds.length} 个）
        </button>
      </div>

      {props.actionMsg && (
        <p
          className={cn(
            'rounded-lg border px-3 py-2 text-sm',
            props.actionMsg.ok ? 'border-green-200 bg-green-50 text-green-900' : 'border-amber-200 bg-amber-50 text-amber-900',
          )}
        >
          {props.actionMsg.text}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={props.saving}
          onClick={props.onSaveDraft}
          className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm"
        >
          保存草稿
        </button>
        <button
          type="button"
          disabled={props.saving}
          onClick={props.onSubmit}
          className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white disabled:bg-gray-400"
        >
          {props.saving ? '提交中…' : '提交审核'}
        </button>
      </div>

      <DouyinStorePickerModal
        open={props.storeModalOpen}
        onClose={() => props.setStoreModalOpen(false)}
        initialPoiIds={props.selectedPoiIds}
        onConfirm={(ids, rows) => {
          props.onPoiConfirm(ids, rows.map((r) => r.name))
          props.setStoreModalOpen(false)
        }}
      />

      <SalePeriodModal
        open={saleModal}
        onClose={() => setSaleModal(false)}
        saleStart={props.saleStart}
        saleEnd={props.saleEnd}
        onConfirm={(s, e) => {
          props.setSalePeriod(s, e)
          setSaleModal(false)
        }}
      />
      <NonConsumeDatesModal
        open={nonConsumeModal}
        onClose={() => setNonConsumeModal(false)}
        weekdays={props.nonConsumeWeekdays}
        holidays={props.nonConsumeHolidays}
        specificDates={props.nonConsumeSpecificDates}
        onConfirm={(w, h, d) => {
          props.setNonConsumePartial(w, h, d)
          setNonConsumeModal(false)
        }}
      />
      <TimePeriodsModal
        open={timeModal}
        onClose={() => setTimeModal(false)}
        periods={props.dailyTimePeriods}
        onConfirm={(p) => {
          props.setDailyTimePeriods(p)
          setTimeModal(false)
        }}
      />
      <PurchaseLimitModal
        open={purchaseModal}
        onClose={() => setPurchaseModal(false)}
        perPerson={props.purchaseLimitPerPerson}
        perDay={props.purchaseLimitPerDay}
        onConfirm={(pp, pd) => {
          props.setPurchaseLimits(pp, pd)
          if (pp > 0 || pd > 0) props.setPurchaseLimitMode('limited')
          setPurchaseModal(false)
        }}
      />
      <ReserveAdvanceModal
        open={reserveModal}
        onClose={() => setReserveModal(false)}
        days={props.reserveAdvanceDays}
        onConfirm={(d) => {
          props.setReserveAdvanceDays(d)
          props.setReserveMode('required')
          setReserveModal(false)
        }}
      />
      <VoucherUseLimitModal
        open={voucherModal}
        onClose={() => setVoucherModal(false)}
        max={props.voucherUseMax}
        onConfirm={(n) => {
          props.setVoucherUseMax(n)
          props.setVoucherUseLimit(true)
          setVoucherModal(false)
        }}
      />
    </section>
  )
}