export const APPLICATIONS_KEY = 'meoo_my_applications_v1'
export const PUBLISH_KEY = 'meoo_my_published_orders_v1'

export type ApplicationLocal = {
  mpOrderId: string
  applicantId?: string
  title?: string
  platform?: string
  appliedAt?: string
}

export type PublishedOrderLocal = {
  mpOrderId: string
  title?: string
  publishedAt?: string
  hall?: string
}

export function readApplications(): ApplicationLocal[] {
  try {
    const raw = localStorage.getItem(APPLICATIONS_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? (list as ApplicationLocal[]) : []
  } catch {
    return []
  }
}

export function addApplication(entry: ApplicationLocal) {
  const list = readApplications()
  list.unshift({
    appliedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    ...entry,
  })
  localStorage.setItem(APPLICATIONS_KEY, JSON.stringify(list.slice(0, 80)))
}

export function readPublishedOrders(): PublishedOrderLocal[] {
  try {
    const raw = localStorage.getItem(PUBLISH_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? (list as PublishedOrderLocal[]) : []
  } catch {
    return []
  }
}

export function addPublishedOrder(entry: PublishedOrderLocal) {
  const list = readPublishedOrders()
  list.unshift({
    publishedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    ...entry,
  })
  localStorage.setItem(PUBLISH_KEY, JSON.stringify(list.slice(0, 80)))
}

export function hasAppliedToOrder(mpOrderId: string) {
  return readApplications().some((a) => a.mpOrderId === mpOrderId)
}
