import { CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface SettingsCardHeaderProps {
  icon: React.ReactNode
  iconClassName?: string
  title: string
  description?: string
  children?: React.ReactNode
}

export function SettingsCardHeader({
  icon,
  iconClassName,
  title,
  description,
  children
}: SettingsCardHeaderProps) {
  return (
    <CardHeader className="py-4 bg-gradient-to-r from-muted/50 to-transparent">
      <div className="flex items-center justify-between min-h-10">
        <div className="flex items-center gap-3">
          <div
            className={cn('flex h-10 w-10 items-center justify-center rounded-xl', iconClassName)}
          >
            {icon}
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
          </div>
        </div>
        {children}
      </div>
    </CardHeader>
  )
}

