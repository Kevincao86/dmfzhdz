import { useState } from 'react'
import { cn } from '../cn'

export type AiVendorCatalogAvatarProps = {
  id: string
  label: string
  logoUrl?: string
  size?: 'xs' | 'sm' | 'md'
  className?: string
  title?: string
}

const sizeClass: Record<NonNullable<AiVendorCatalogAvatarProps['size']>, string> = {
  xs: 'h-4 w-4 text-[9px]',
  sm: 'h-5 w-5 text-[10px]',
  md: 'h-6 w-6 text-xs',
}

export default function AiVendorCatalogAvatar({
  id,
  label,
  logoUrl,
  size = 'sm',
  className,
  title,
}: AiVendorCatalogAvatarProps) {
  const [imgErr, setImgErr] = useState(false)
  const tip = title ?? label
  const dim = sizeClass[size]

  if (logoUrl && !imgErr) {
    return (
      <img
        src={logoUrl}
        alt=""
        title={tip}
        draggable={false}
        onError={() => setImgErr(true)}
        className={cn('shrink-0 rounded-md object-contain ring-1 ring-black/5', dim, className)}
      />
    )
  }

  const letter = (label.trim().slice(0, 1) || id.slice(0, 1)).toUpperCase()
  return (
    <span
      title={tip}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-slate-200 to-slate-300 font-bold text-slate-700 ring-1 ring-black/5',
        dim,
        className,
      )}
      aria-hidden
    >
      {letter}
    </span>
  )
}
