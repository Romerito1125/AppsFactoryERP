import { Package2 } from 'lucide-react'

import { cn } from '@/lib/utils'

export function ProductImage({ src, alt, className, iconClassName }) {
  return (
    <div
      className={cn(
        'flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-muted/30',
        className,
      )}
    >
      {src ? (
        <img src={src} alt={alt} className="size-full object-cover" loading="lazy" />
      ) : (
        <Package2 className={cn('size-5 text-muted-foreground', iconClassName)} />
      )}
    </div>
  )
}
