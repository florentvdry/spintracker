import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  // Tauri serves the bundle from its own origin, so relative assets are enough.
  base: './',
  clearScreen: false,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2021',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        replayer: path.resolve(__dirname, 'replayer.html'),
        hud: path.resolve(__dirname, 'hud.html'),
      },
    },
  },
  server: {
    port: 3000,
    strictPort: true,
  },
})
