import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import {
  readOpsSession,
  resolveOpsPermissionKeyForPath,
  sessionCanEditModule,
  sessionCanViewModule,
  type OpsPermissionKey,
} from './opsStaffAuth'

/** 无编辑权限时禁用区块内所有表单控件（fieldset disabled） */
export function OpsEditableSection({
  children,
  permissionKey,
  className,
}: {
  children: ReactNode
  permissionKey?: OpsPermissionKey
  className?: string
}) {
  const { canEdit } = useOpsModuleEdit(permissionKey)
  return (
    <fieldset disabled={!canEdit} className={className ?? 'min-w-0 border-0 p-0 m-0'}>
      {children}
    </fieldset>
  )
}

type OpsModuleEditContextValue = {
  permissionKey: OpsPermissionKey | null
  canView: boolean
  canEdit: boolean
  readOnly: boolean
}

const OpsModuleEditContext = createContext<OpsModuleEditContextValue>({
  permissionKey: null,
  canView: true,
  canEdit: true,
  readOnly: false,
})

export function OpsModuleEditProvider({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation()
  const value = useMemo(() => {
    const session = readOpsSession()
    const permissionKey = resolveOpsPermissionKeyForPath(pathname, search)
    if (!permissionKey) {
      return { permissionKey, canView: true, canEdit: true, readOnly: false }
    }
    const canView = sessionCanViewModule(session, permissionKey)
    const canEdit = sessionCanEditModule(session, permissionKey)
    return {
      permissionKey,
      canView,
      canEdit,
      readOnly: canView && !canEdit,
    }
  }, [pathname, search])

  return <OpsModuleEditContext.Provider value={value}>{children}</OpsModuleEditContext.Provider>
}

/** 当前页模块编辑权限；可传入显式 key 覆盖路由解析 */
export function useOpsModuleEdit(explicitKey?: OpsPermissionKey): OpsModuleEditContextValue {
  const ctx = useContext(OpsModuleEditContext)
  if (!explicitKey || explicitKey === ctx.permissionKey) return ctx
  const session = readOpsSession()
  const canView = sessionCanViewModule(session, explicitKey)
  const canEdit = sessionCanEditModule(session, explicitKey)
  return {
    permissionKey: explicitKey,
    canView,
    canEdit,
    readOnly: canView && !canEdit,
  }
}

export function OpsReadOnlyBanner() {
  const { readOnly } = useOpsModuleEdit()
  if (!readOnly) return null
  return (
    <div
      className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/35 bg-amber-950/25 px-4 py-2.5 text-sm text-amber-100"
      role="status"
    >
      <span className="font-semibold text-amber-300">仅查看模式</span>
      <span className="text-amber-100/85">
        子账号对该模块未开通编辑权限，页面数据可浏览，不可保存、删除或变更配置。
      </span>
    </div>
  )
}

/** 无编辑权限时不渲染子节点 */
export function OpsEditGate({
  children,
  permissionKey,
}: {
  children: ReactNode
  permissionKey?: OpsPermissionKey
}) {
  const { canEdit } = useOpsModuleEdit(permissionKey)
  if (!canEdit) return null
  return <>{children}</>
}
