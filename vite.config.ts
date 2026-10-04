import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import { heistApiPlugin } from './server/heistApi.ts'

// SINGLE_FILE=1 inlines fonts and assets so the build can be packed into one HTML page.
const single = process.env.SINGLE_FILE === '1'

// Local Python servers. The RVC voice-clone server in voice-server/ (npm run voice): /api/voice/convert -> :8765/convert
const voiceProxy: Record<string, ProxyOptions> = {
  '/api/voice': {
    target: process.env.VOICE_SERVER_URL || 'http://127.0.0.1:8765',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/voice/, ''),
  },
  // Face swap backend in backend/ (npm run faceswap). WebSocket: /api/faceswap/ws -> :8001/ws
  '/api/faceswap': {
    target: process.env.FACESWAP_SERVER_URL || 'http://127.0.0.1:8001',
    ws: true,
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/faceswap/, ''),
  },
  // The HeistAI voice server in heistai-server/ (npm run heistai). /api/alfred/talk -> :8766/talk
  '/api/alfred': {
    target: process.env.HEISTAI_SERVER_URL || 'http://127.0.0.1:8766',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/alfred/, ''),
  },
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxy: Record<string, ProxyOptions> = {
    ...voiceProxy,
    '/api/watchtower/weather': {
      target: env.WATCHTOWER_SERVER_URL || 'http://127.0.0.1:8080',
      changeOrigin: true,
    },
  }
  return {
    plugins: [react(), tailwindcss(), heistApiPlugin()],
    base: single ? './' : '/',
    server: { proxy, allowedHosts: ['colbys-pc.tail7246dc.ts.net'] },
    preview: { proxy },
    build: {
      assetsInlineLimit: single ? 100_000_000 : 4096,
      chunkSizeWarningLimit: 2000,
    },
  }
})
