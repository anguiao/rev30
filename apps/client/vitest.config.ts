import { mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(viteConfig, {
  test: {
    environment: 'happy-dom',
    setupFiles: ['./__tests__/setup.ts'],
    unstubGlobals: true,
  },
})
