import { cn } from '@/lib/utils'

export type RightPanelTabButtonProps = {
  label: string
  isActive: boolean
  onClick: () => void
}

export function RightPanelTabButton({ label, isActive, onClick }: RightPanelTabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-2 py-1 text-xs',
        isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/40'
      )}
    >
      {label}
    </button>
  )
}
