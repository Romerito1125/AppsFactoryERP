import { Badge } from '@/components/ui/badge'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

export function ModuleDetailsDrawer({
  open,
  onOpenChange,
  title,
  description,
  badge,
  fields = [],
  children,
}) {
  const isMobile = useIsMobile()

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction={isMobile ? 'bottom' : 'right'}>
      <DrawerContent className={cn(!isMobile && 'ml-auto h-screen max-w-xl border-l')}>
        <DrawerHeader className="border-b border-border/70">
          <div className="flex items-center gap-2">
            <DrawerTitle>{title}</DrawerTitle>
            {badge ? <Badge variant={badge.variant ?? 'outline'}>{badge.label}</Badge> : null}
          </div>
          {description ? <DrawerDescription>{description}</DrawerDescription> : null}
        </DrawerHeader>

        <ScrollArea className="h-[calc(100vh-8rem)] px-4 py-4">
          {children ?? (
            <div className="grid gap-4">
              {fields.map((section) => (
                <div key={section.label} className="rounded-2xl border border-border/70 bg-card p-4">
                  <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
                    {section.label}
                  </p>
                  <Separator className="my-3" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    {section.items.map((item) => (
                      <div key={item.label}>
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                        <div className="mt-1 text-sm font-medium text-foreground">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  )
}
