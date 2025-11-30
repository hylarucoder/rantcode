import type React from 'react'
import { Toaster as SonnerToaster, type ToasterProps } from 'sonner'
import { useThemeMode } from '@/shared/hooks/use-theme-mode'

export type { ToasterProps } from 'sonner'

export function Toaster(props: ToasterProps): React.JSX.Element {
  const mode = useThemeMode()
  return <SonnerToaster theme={mode} {...props} />
}
