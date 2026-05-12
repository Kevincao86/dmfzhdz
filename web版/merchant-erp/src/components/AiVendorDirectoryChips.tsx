import AiVendorCatalogAvatar from './AiVendorCatalogAvatar'

export type AiVendorChipOption = { id: string; label: string; logoUrl?: string }

/** 目录内 AI 厂商：logo 在左、名称在右，用于设置页与商品向导「目前绑定的模型」展示 */
export default function AiVendorDirectoryChips({
  options,
  className = '',
}: {
  options: readonly AiVendorChipOption[]
  className?: string
}) {
  if (options.length === 0) return null
  return (
    <div className={`flex flex-wrap gap-2 ${className}`.trim()}>
      {options.map((m) => (
        <div
          key={m.id}
          className="inline-flex items-center gap-2 rounded-lg border border-indigo-100/80 bg-white px-2.5 py-1.5 shadow-sm"
        >
          <AiVendorCatalogAvatar id={m.id} label={m.label} logoUrl={m.logoUrl} size="sm" />
          <span className="text-sm font-medium text-gray-800">{m.label}</span>
        </div>
      ))}
    </div>
  )
}
