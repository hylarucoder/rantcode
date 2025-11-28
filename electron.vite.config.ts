import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const rendererSrc = resolve(__dirname, 'src/renderer/src')
const sharedSrc = resolve(__dirname, 'src/shared')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    publicDir: resolve(__dirname, 'src/renderer/public'),
    resolve: {
      alias: {
        '@renderer': rendererSrc,
        '@': rendererSrc,
        '@shared': sharedSrc
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
