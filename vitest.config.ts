import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'hermes/**/*.test.ts'],
    passWithNoTests: true
  }
})
