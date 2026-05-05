import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import VueRouter from 'vue-router/vite'
import { getFileBasedRouteName } from 'vue-router/unplugin'

export default defineConfig({
  plugins: [
    VueRouter({
      watch: process.env.NODE_ENV === 'development' && !process.env.CI,
      getRouteName: (routeNode) => getFileBasedRouteName(routeNode).replace(/\/+/g, '/'),
    }),
    vue(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
