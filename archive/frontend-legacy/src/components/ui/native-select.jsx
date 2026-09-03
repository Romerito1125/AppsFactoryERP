import { ChevronDownIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

export function NativeSelect({ className, children, ...props }) {
  return (
    <div className="relative">
      <select
        className={cn(
          'flex h-8 w-full appearance-none rounded-lg border border-input bg-transparent py-2 pr-8 pl-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}
