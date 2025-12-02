import { app } from 'electron'
import type { HealthResponse } from '../../shared/orpc/schemas'

export class SystemService {
  async health(): Promise<HealthResponse> {
    return { status: 'ok' }
  }

  async version(): Promise<{ version: string }> {
    return { version: app.getVersion() }
  }
}

