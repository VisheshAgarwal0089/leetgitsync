import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import path from 'path';
import manifest from './manifest.config';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    modulePreload: false,
    rollupOptions: {
      input: {
        inject: path.resolve(__dirname, 'src/content/inject.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'inject') {
            return 'src/content/inject.js';
          }
          return 'assets/[name]-[hash].js';
        },
      },
    },
  },
});
