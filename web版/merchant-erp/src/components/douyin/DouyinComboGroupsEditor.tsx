import { Plus, Trash2 } from 'lucide-react'
import {
  appendComboGroup,
  type ComboGroupFormRow,
  createEmptyComboItem,
  pickRuleSelectOptionsForItemCount,
} from '../../lib/douyinComboGroupsForm'
import { cn } from '../../cn'

type Props = {
  groups: ComboGroupFormRow[]
  onChange: (next: ComboGroupFormRow[]) => void
  className?: string
  /** 为 false 时由外层卡片标题栏/底栏提供「新增商品组」 */
  showAddGroupButton?: boolean
}

function newGroupId(): string {
  return `cg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function DouyinComboGroupsEditor({
  groups,
  onChange,
  className,
  showAddGroupButton = true,
}: Props) {
  const updateGroup = (gid: string, patch: Partial<ComboGroupFormRow>) => {
    onChange(groups.map((g) => (g.id === gid ? { ...g, ...patch } : g)))
  }

  const updateItem = (
    gid: string,
    iid: string,
    patch: Partial<ComboGroupFormRow['items'][0]>,
  ) => {
    onChange(
      groups.map((g) =>
        g.id === gid
          ? {
              ...g,
              items: g.items.map((it) => (it.id === iid ? { ...it, ...patch } : it)),
            }
          : g,
      ),
    )
  }

  const addGroup = () => {
    onChange(appendComboGroup(groups))
  }

  const removeGroup = (gid: string) => {
    const next = groups.filter((g) => g.id !== gid)
    onChange(next.length > 0 ? next : [{ id: newGroupId(), pickRule: '全部必选', items: [createEmptyComboItem()] }])
  }

  const moveGroup = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= groups.length) return
    const cp = [...groups]
    const tmp = cp[idx]!
    cp[idx] = cp[j]!
    cp[j] = tmp
    onChange(cp)
  }

  const addItem = (gid: string) => {
    onChange(
      groups.map((g) =>
        g.id === gid ? { ...g, items: [...g.items, createEmptyComboItem()] } : g,
      ),
    )
  }

  const removeItem = (gid: string, iid: string) => {
    onChange(
      groups.map((g) => {
        if (g.id !== gid) return g
        const next = g.items.filter((it) => it.id !== iid)
        return { ...g, items: next.length > 0 ? next : [createEmptyComboItem()] }
      }),
    )
  }

  const listedCount = groups.reduce(
    (n, g) => n + g.items.filter((it) => it.name.trim()).length,
    0,
  )

  return (
    <div className={cn('space-y-3', className)}>
      <p className="text-xs text-gray-600">
        与抖音来客「商品组」一致：每组可配置几选几规则与多个单品，保存时写入{' '}
        <code className="rounded bg-gray-100 px-1 text-[11px]">package_combo</code> 并由网关映射为{' '}
        <code className="rounded bg-gray-100 px-1 text-[11px]">combo_rule</code>。
      </p>
      {groups.map((g, gi) => {
        const listed = g.items.filter((it) => it.name.trim()).length
        const pickOpts = pickRuleSelectOptionsForItemCount(listed || 1)
        return (
          <div
            key={g.id}
            className="rounded-lg border border-indigo-100 bg-indigo-50/30 p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-gray-900">商品组 {gi + 1}</span>
              <select
                value={g.pickRule}
                onChange={(e) => updateGroup(g.id, { pickRule: e.target.value })}
                className="max-w-[10rem] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs"
                aria-label="几选几"
              >
                {pickOpts.map((o) => (
                  <option key={o.value || 'empty'} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              {g.items.map((it) => (
                <div
                  key={it.id}
                  className="grid gap-2 rounded-lg border border-white bg-white p-3 sm:grid-cols-[1fr_6rem_5rem_auto]"
                >
                  <label className="block text-xs text-gray-600 sm:col-span-1">
                    单品名称
                    <input
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      value={it.name}
                      onChange={(e) => updateItem(g.id, it.id, { name: e.target.value })}
                      placeholder="如：招牌牛肉面"
                    />
                  </label>
                  <label className="block text-xs text-gray-600">
                    标价（元）
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-2 text-sm"
                      value={it.priceYuan}
                      onChange={(e) => updateItem(g.id, it.id, { priceYuan: e.target.value })}
                    />
                  </label>
                  <label className="block text-xs text-gray-600">
                    数量
                    <input
                      type="number"
                      min={1}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-2 text-sm"
                      value={it.quantity}
                      onChange={(e) =>
                        updateItem(g.id, it.id, {
                          quantity: Math.max(1, Number.parseInt(e.target.value, 10) || 1),
                        })
                      }
                    />
                  </label>
                  <div className="flex items-end pb-1">
                    <button
                      type="button"
                      onClick={() => removeItem(g.id, it.id)}
                      className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                      title="删除单品"
                      aria-label="删除单品"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => addItem(g.id)}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              添加单品
            </button>
            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
              <button
                type="button"
                disabled={gi === 0}
                onClick={() => moveGroup(gi, -1)}
                className="hover:text-gray-800 disabled:opacity-30"
              >
                上移组
              </button>
              <button
                type="button"
                disabled={gi >= groups.length - 1}
                onClick={() => moveGroup(gi, 1)}
                className="hover:text-gray-800 disabled:opacity-30"
              >
                下移组
              </button>
              <button
                type="button"
                onClick={() => removeGroup(g.id)}
                className="text-red-600 hover:underline"
              >
                删除本组
              </button>
            </div>
          </div>
        )
      })}
      {showAddGroupButton ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
          <button
            type="button"
            onClick={addGroup}
            className="inline-flex items-center gap-1 rounded-lg border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            新增商品组
          </button>
          <span className="text-xs text-gray-500">
            共 {listedCount} 个单品 · {groups.length} 个组
          </span>
        </div>
      ) : (
        <p className="border-t border-gray-100 pt-2 text-xs text-gray-500">
          共 {listedCount} 个单品 · {groups.length} 个组
        </p>
      )}
    </div>
  )
}
