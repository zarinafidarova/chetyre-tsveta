import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// В режиме разработки (npm run dev) Vite проксирует WebSocket на Go-сервер.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
})
