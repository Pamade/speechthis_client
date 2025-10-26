import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      'pdfjs-dist/build/pdf.worker.min.js': 'pdfjs-dist/build/pdf.worker.mjs',
      buffer: 'buffer'
    }
  },

  define: {
    global: 'globalThis',
  },

  optimizeDeps: {
    include: ['pdfjs-dist', 'react', 'react-dom', 'react-router-dom', 'buffer'],
    esbuildOptions: {
      target: 'esnext',
      define: {
        global: 'globalThis',
      },
    }
  },

  build: {
    target: 'esnext',

    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info'], // Remove specific console methods
        passes: 2 // Multiple passes for better compression
      },
      mangle: {
        safari10: true // Better Safari compatibility
      }
    },

    cssCodeSplit: true,
    cssMinify: true,
    sourcemap: false,

    // Reduce chunk size limits
    chunkSizeWarningLimit: 500,

    commonjsOptions: {
      include: [/pdfjs-dist/, /node_modules/],
      transformMixedEsModules: true
    },

    rollupOptions: {
      output: {
        // Improved manual chunks - more aggressive splitting
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            // PDF.js - HEAVY library (lazy load this!)
            if (id.includes('pdfjs-dist')) {
              return 'pdfjs'
            }

            // React core - split into smaller chunks
            if (id.includes('react/') && !id.includes('react-dom')) {
              return 'react'
            }

            if (id.includes('react-dom/')) {
              return 'react-dom'
            }

            // Scheduler (React dependency)
            if (id.includes('scheduler')) {
              return 'react'
            }

            // Router - separate for better caching
            if (id.includes('react-router-dom')) {
              return 'react-router'
            }

            // Buffer and other polyfills
            if (id.includes('buffer') || id.includes('process')) {
              return 'polyfills'
            }

            // UI libraries
            if (id.includes('@mui') || id.includes('antd') || id.includes('@ant-design')) {
              return 'ui-library'
            }

            // Utilities (lodash, date-fns, etc)
            if (id.includes('lodash') || id.includes('date-fns') || id.includes('moment')) {
              return 'utils'
            }

            // Other vendors in smaller chunk
            return 'vendor'
          }
        },

        // Better caching with consistent hashing
        entryFileNames: 'assets/js/[name]-[hash].js',
        chunkFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.names?.[0] || 'asset';

          if (name.endsWith('.css')) {
            return 'assets/css/[name]-[hash][extname]'
          }
          if (/\.(png|jpe?g|gif|svg|webp|avif)$/.test(name)) {
            return 'assets/images/[name]-[hash][extname]'
          }
          if (/\.(woff2?|eot|ttf|otf)$/.test(name)) {
            return 'assets/fonts/[name]-[hash][extname]'
          }
          return 'assets/[name]-[hash][extname]'
        }
      }
    },

    reportCompressedSize: true,

    // Additional optimizations
    assetsInlineLimit: 4096, // Inline assets < 4kb as base64
  }
})