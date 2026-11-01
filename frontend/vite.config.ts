/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const isProduction = mode === 'production' || command === 'build'
  return {
    base: process.env.VITE_BASE_PATH || (isProduction ? '/Software-Architecture-Drift-Detector/' : '/'),
    plugins: [react(), tailwindcss()],
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('@xyflow')) {
                return 'vendor-flow';
              }
              if (id.includes('recharts') || id.includes('d3') || id.includes('victory')) {
                return 'vendor-charts';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              return 'vendor-core';
            }
          }
        }
      }
    },
    test: {
      environment: 'jsdom',
      globals: true,
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: process.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000',
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('error', (_err, _req, res) => {
              if ('writeHead' in res && !res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(
                  JSON.stringify({
                    detail: 'Backend server is unavailable (502 Bad Gateway). Please verify that the FastAPI backend is running on http://127.0.0.1:8000.'
                  })
                );
              }
            });
          }
        }
      }
    },
    preview: {
      port: 4173,
      proxy: {
        '/api': {
          target: process.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000',
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('error', (_err, _req, res) => {
              if ('writeHead' in res && !res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(
                  JSON.stringify({
                    detail: 'Backend server is unavailable (502 Bad Gateway). Please verify that the FastAPI backend is running on http://127.0.0.1:8000.'
                  })
                );
              }
            });
          }
        }
      }
    }
  }
})
