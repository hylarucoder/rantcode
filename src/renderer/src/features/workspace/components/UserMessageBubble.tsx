import { cn } from '@/lib/utils'

export function UserMessageBubble({ text }: { text: string }) {
  return (
    <div className={cn('flex justify-end')}>
      <div
        className={cn(
          'max-w-[80%] whitespace-pre-wrap rounded-xl px-3 py-1.5 text-sm bg-primary text-primary-foreground'
        )}
      >
        {text}
      </div>
    </div>
  )
}
