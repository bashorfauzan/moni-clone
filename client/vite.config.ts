import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  build: {
    target: 'es2019',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          if (id.includes('/xlsx/')) return 'xlsx';
          if (id.includes('/recharts/')) return 'charts';
          if (id.includes('/@supabase/')) return 'supabase';
          if (id.includes('/react-router/') || id.includes('/react-dom/') || id.includes('/react/')) {
            return 'react-core';
          }
          
          return undefined;
        }
      }
    }
  }
})
