import { cn } from '@/lib/utils'

export function BrandMark({ compact = false, className }) {
  const logoSrc = `${import.meta.env.BASE_URL}logo.jpeg`

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border border-primary/15 bg-white p-2 shadow-lg shadow-primary/10 transition-all duration-300',
          compact ? 'h-16 w-16 rounded-3xl' : 'h-20 w-20 rounded-[1.75rem]',
          'group-data-[state=collapsed]:h-10 group-data-[state=collapsed]:w-10 group-data-[state=collapsed]:rounded-xl group-data-[state=collapsed]:p-1.5'
        )}
      >
        <img
          src={logoSrc}
          alt="Mundo Tienda Montes de Maria"
          className="h-full w-full object-contain object-center"
        />
      </div>
      <div className={cn('min-w-0 transition-all duration-300', compact && 'hidden md:block', 'group-data-[state=collapsed]:hidden!')}>
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
