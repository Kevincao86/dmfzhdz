import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FULFILLMENT_ROOT = path.dirname(fileURLToPath(import.meta.url))

/** 商家 ERP 源码根（页面与 /api 网关共用） */
export const MERCHANT_ERP_ROOT = path.resolve(FULFILLMENT_ROOT, '../web版/merchant-erp')

export const MERCHANT_ERP_SRC = path.join(MERCHANT_ERP_ROOT, 'src')
export const MERCHANT_ERP_PUBLIC = path.join(MERCHANT_ERP_ROOT, 'public')

process.env.MEOO_MERCHANT_VITE_ROOT = MERCHANT_ERP_ROOT
