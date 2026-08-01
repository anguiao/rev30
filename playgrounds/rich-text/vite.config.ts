import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 2_500,
  },
  plugins: [vue(), tailwindcss()],
  server: {
    port: 3210,
  },
})
