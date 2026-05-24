import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import vueDevTools from 'vite-plugin-vue-devtools'
import vueRouter from 'vue-router/vite'
import { getFileBasedRouteName } from 'vue-router/unplugin'

export default defineConfig({
  plugins: [
    vueRouter({
      watch: process.env.NODE_ENV === 'development' && !process.env.CI,
      getRouteName: (routeNode) => getFileBasedRouteName(routeNode).replace(/\/+/g, '/'),
    }),
    vue(),
    vueDevTools(),
    tailwindcss(),
  ],
  server: {
    port: 3200,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
