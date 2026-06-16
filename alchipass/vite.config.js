import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En développement, pointe vers le serveur AlchiPass local (port 3000).
// Pour dev contre le Raspberry Pi, créez .env.local avec :
//   VITE_API_TARGET=http://10.115.166.244:3000
const API_TARGET = process.env.VITE_API_TARGET || 'http://localhost:3000'

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
      '/socket.io': {
        target: API_TARGET,
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
