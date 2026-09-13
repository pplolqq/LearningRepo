import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.VITE_PORT) || 5173,
    strictPort: true,
    // 前端统一请求相对路径 /api/...，由 dev server 代理到后端
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${Number(process.env.VITE_BACKEND_PORT) || 8000}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
