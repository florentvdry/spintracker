import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Pure modules only (no DOM): the HUD model and its editing actions.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
