import { cn } from '@/lib/utils'

export function AssistantMessageBubble({ text }: { text: string }) {
  return (
    <div className={cn('flex justify-start')}>
      <div
        className={cn(
          'max-w-[80%] whitespace-pre-wrap rounded-xl px-3 py-1.5 text-sm bg-card text-card-foreground'
        )}
      >
        {text}
      </div>
    </div>
  )
}
