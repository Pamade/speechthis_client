import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'pdfjs-dist/build/pdf.worker.min.js': 'pdfjs-dist/build/pdf.worker.mjs'
    }
  },
  optimizeDeps: {
    include: ['pdfjs-dist', 'react', 'react-dom', 'react-router-dom'],
    esbuildOptions: {
      target: 'esnext'
    }
  },
  build: {
    target: 'esnext',
    commonjsOptions: {
      include: [/pdfjs-dist/, /node_modules/],
      transformMixedEsModules: true
    },
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  }
})