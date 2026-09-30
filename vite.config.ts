import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// SINGLE_FILE=1 inlines fonts and assets so the build can be packed into one HTML page.
const single = process.env.SINGLE_FILE === '1'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: single ? './' : '/',
  build: {
    assetsInlineLimit: single ? 100_000_000 : 4096,
    chunkSizeWarningLimit: 2000,
  },
})
