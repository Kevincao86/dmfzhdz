import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import DouyinProductCreateWizard from './douyin/DouyinProductCreateWizard'
import KuaishouProductCreateWizard from './kuaishou/KuaishouProductCreateWizard'
import { createPlatformLabel, isCreatePlatformId } from '../constants/productCreatePlatforms'

const GROUPBUY_EDIT_PLATFORMS = new Set(['douyin', 'kuaishou'])

export default function ProductEditFlowPage() {
  const { platform, productId } = useParams<{ platform: string; productId: string }>()
  const pid = productId ? decodeURIComponent(productId) : ''
  const plat = platform && isCreatePlatformId(platform) ? platform : undefined

  if (!plat || !pid) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <Link to="/products/list" className="text-sm text-indigo-600 hover:underline">
          ← 返回商品列表
        </Link>
        <p className="text-sm text-red-700">链接无效：缺少平台或商品 ID。</p>
      </div>
    )
  }

  if (!GROUPBUY_EDIT_PLATFORMS.has(plat)) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <Link to="/products/list" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回商品列表
        </Link>
        <p className="text-sm text-gray-700">
          「{createPlatformLabel(plat)}」的商品编辑暂未在本页开放，请先使用该平台官方后台或团购完整编辑流程；后续版本将陆续支持。
        </p>
      </div>
    )
  }

  const isKuaishou = plat === 'kuaishou'

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/products/list"
          className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回商品列表
        </Link>
      </div>
      <div>
        <h1 className="erp-page-title">{isKuaishou ? '快手团购' : '抖音来客'} · 编辑商品</h1>
        <p className="mt-1 text-sm text-gray-500">
          与「创建商品」相同的分步表单；数据来自{isKuaishou ? '快手团购' : '抖音来客'}或您曾保存的草稿。保存与提交将同步至
          {isKuaishou ? '快手团购' : '抖音来客'}。
        </p>
      </div>
      {isKuaishou ? (
        <KuaishouProductCreateWizard variant="edit" editProductId={pid} />
      ) : (
        <DouyinProductCreateWizard variant="edit" editProductId={pid} />
      )}
    </div>
  )
}
