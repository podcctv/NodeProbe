import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Proxy API requests during development to the FastAPI backend
  server: {
    proxy: {
      '/tests': {
        target: 'http://localhost:8380',
        changeOrigin: true,
      },
    },
  },
})
