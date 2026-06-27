import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true // O puedes usar '0.0.0.0' para escuchar en todas las direcciones
  }
})
