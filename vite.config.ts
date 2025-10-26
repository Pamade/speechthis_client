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

    // Minifikacja z usunięciem console.log
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },

    // CSS optimization
    cssCodeSplit: true,
    cssMinify: true,

    // Wyłącz sourcemaps w produkcji (mniejszy bundle)
    sourcemap: false,

    commonjsOptions: {
      include: [/pdfjs-dist/, /node_modules/],
      transformMixedEsModules: true
    },

    rollupOptions: {
      output: {
        // CODE SPLITTING - kluczowa optymalizacja!
        manualChunks: (id) => {
          // Biblioteki w osobnych chunkach
          if (id.includes('node_modules')) {
            // PDF.js osobno (duża biblioteka - ładuj tylko gdy potrzeba)
            if (id.includes('pdfjs-dist')) {
              return 'pdfjs'
            }
            // React osobno
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor'
            }
            // Router osobno
            if (id.includes('react-router')) {
              return 'router'
            }
            // Reszta vendors
            return 'vendor'
          }
        },

        // Nazwy z hash dla lepszego cachowania
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },

    // Warning gdy chunk > 1MB
    chunkSizeWarningLimit: 1000,

    // Raportuj rozmiary
    reportCompressedSize: true
  }
})


