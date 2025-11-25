import { app } from 'electron'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

export async function applyAutoLaunch(enabled: boolean): Promise<void> {
  try {
    if (process.platform === 'darwin' || process.platform === 'win32') {
      app.setLoginItemSettings({ openAtLogin: enabled, args: [] })
      return
    }

    // Linux: write desktop entry to ~/.config/autostart
    const home = process.env.HOME || process.env.USERPROFILE || ''
    if (!home) return
    const dir = path.join(home, '.config', 'autostart')
    const file = path.join(dir, 'rantcode.desktop')
    await fs.mkdir(dir, { recursive: true })
    if (!enabled) {
      try {
        await fs.unlink(file)
      } catch {}
      return
    }
    const exec = process.execPath
    const desktop =
      `
[Desktop Entry]
Type=Application
Name=Rantcode
Comment=Rantcode
Exec=${exec}
X-GNOME-Autostart-enabled=true
`.trim() + '\n'
    await fs.writeFile(file, desktop, 'utf8')
  } catch {
    // ignore
  }
}
