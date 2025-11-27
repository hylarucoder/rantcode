import { useNavigate } from 'react-router'
import { FileQuestion, Home, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface NotFoundProps {
  title?: string
  message?: string
  showBackButton?: boolean
}

export default function NotFound({
  title = '页面不存在',
  message = '您访问的页面不存在或已被移除',
  showBackButton = true
}: NotFoundProps) {
  const navigate = useNavigate()

  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-br from-background to-muted/20">
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted/50">
          <FileQuestion className="h-10 w-10 text-muted-foreground/50" />
        </div>
        <h1 className="mb-2 text-2xl font-semibold text-foreground">404</h1>
        <h2 className="mb-2 text-lg font-medium text-foreground">{title}</h2>
        <p className="mb-6 text-sm text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          {showBackButton && (
            <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              返回上页
            </Button>
          )}
          <Button onClick={() => navigate('/')} className="gap-2">
            <Home className="h-4 w-4" />
            返回首页
          </Button>
        </div>
      </div>
    </div>
  )
}
