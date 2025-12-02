import { cn } from '@/lib/utils'

interface RangeSliderProps {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  /** Format function for display value */
  formatValue?: (value: number) => string
  className?: string
}

export function RangeSlider({
  value,
  onChange,
  min,
  max,
  step = 0.01,
  formatValue,
  className
}: RangeSliderProps) {
  const displayValue = formatValue ? formatValue(value) : String(value)

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-2 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
      />
      <span className="w-12 text-right text-sm font-mono tabular-nums text-muted-foreground">
        {displayValue}
      </span>
    </div>
  )
}

/** Common format functions */
export const formatPercent = (v: number): string => `${Math.round(v * 100)}%`
export const formatDecimal = (v: number): string => v.toFixed(1)
