import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff } from 'lucide-react'

interface SecretInputProps {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function SecretInput({ id, value, onChange, placeholder, className }: SecretInputProps) {
  const [showSecret, setShowSecret] = useState(false)

  return (
    <div className="relative">
      <Input
        id={id}
        type={showSecret ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className ? `pr-10 ${className}` : 'pr-10'}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setShowSecret((v) => !v)}
        aria-label={showSecret ? 'Hide secret' : 'Show secret'}
      >
        {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
    </div>
  )
}
