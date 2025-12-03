interface SettingsHintProps {
  children: React.ReactNode
}

export function SettingsHint({ children }: SettingsHintProps) {
  return (
    <div className="mt-6 pt-4 border-t border-border/50">
      <p className="text-xs text-muted-foreground flex items-center gap-2">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/50" />
        {children}
      </p>
    </div>
  )
}

