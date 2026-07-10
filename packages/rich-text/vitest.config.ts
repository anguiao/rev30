import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

const nodeTestFiles = [
  '__tests__/features/*/server.test.ts',
  '__tests__/presets/compact.test.ts',
  '__tests__/schema.test.ts',
  '__tests__/server/*.test.ts',
]

export default defineConfig({
  plugins: [vue()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: nodeTestFiles,
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'happy-dom',
          exclude: nodeTestFiles,
          include: ['__tests__/**/*.test.ts'],
          sequence: {
            hooks: 'list',
          },
          setupFiles: ['./__tests__/setup.ts'],
        },
      },
    ],
    unstubGlobals: true,
  },
})
