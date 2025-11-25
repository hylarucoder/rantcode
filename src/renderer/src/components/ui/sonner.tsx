import type React from 'react'
import { Toaster as SonnerToaster, type ToasterProps } from 'sonner'

export type { ToasterProps } from 'sonner'

export function Toaster(props: ToasterProps): React.JSX.Element {
  return <SonnerToaster theme="dark" {...props} />
}
