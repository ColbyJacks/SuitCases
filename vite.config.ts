import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type ProxyOptions } from 'vite'
import { heistApiPlugin } from './server/heistApi.ts'

// SINGLE_FILE=1 inlines fonts and assets so the build can be packed into one HTML page.
const single = process.env.SINGLE_FILE === '1'

// The RVC voice-clone server in voice-server/ (npm run voice). /api/voice/convert -> :8765/convert
const voiceProxy: Record<string, ProxyOptions> = {
  '/api/voice': {
    target: process.env.VOICE_SERVER_URL || 'http://127.0.0.1:8765',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/voice/, ''),
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss(), heistApiPlugin()],
  base: single ? './' : '/',
  server: { proxy: voiceProxy },
  preview: { proxy: voiceProxy },
  build: {
    assetsInlineLimit: single ? 100_000_000 : 4096,
    chunkSizeWarningLimit: 2000,
  },
})
