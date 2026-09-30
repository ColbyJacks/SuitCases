import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { heistApiPlugin } from './server/heistApi.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), heistApiPlugin()],
})
