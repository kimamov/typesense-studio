import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // Relative asset URLs let one build run at any sub-path (BASE_PATH) and inside the desktop shell.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    // During development the Node server (apps/server) provides the CORS proxy.
    proxy: { '/proxy': 'http://localhost:8787' },
  },
})
