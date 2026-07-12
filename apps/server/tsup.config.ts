import { defineConfig } from 'tsup'

export default defineConfig({
  // Bundled CommonJS dependencies may require Node built-ins at runtime.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url)",
  },
  clean: true,
  entry: ['src/index.ts'],
  format: ['esm'],
  noExternal: ['@rev30/contracts', '@rev30/rich-text', '@rev30/utils'],
  outDir: 'dist',
  platform: 'node',
  target: 'node24',
})
