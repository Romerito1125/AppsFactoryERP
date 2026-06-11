import { cn } from '@/lib/utils'

export function BrandMark({ compact = false, className }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border border-primary/15 bg-white p-2 shadow-lg shadow-primary/10',
          compact ? 'h-16 w-16 rounded-3xl' : 'h-20 w-20 rounded-[1.75rem]',
        )}
      >
        <img
          src="/logo.jpeg"
          alt="Mundo Tienda Montes de Maria"
          className="h-full w-full object-contain object-center"
        />
      </div>
      <div className={cn('min-w-0', compact && 'hidden md:block')}>
        <p className="truncate text-sm font-semibold tracking-[0.16em] text-primary uppercase">
          Mundo Tienda
        </p>
        <p className="mt-1 truncate text-sm font-semibold text-foreground">
          Montes de Maria
        </p>
        <p className="truncate text-xs text-muted-foreground">
          Centro de control comercial
        </p>
      </div>
    </div>
  )
}
