import { PiniaColada, useQueryCache } from '@pinia/colada'
import type { Plugin } from 'vue'
import { createTestPinia } from './pinia'

export function createTestQueryHarness() {
  const pinia = createTestPinia()
  let queryCache: ReturnType<typeof useQueryCache> | undefined

  const captureQueryCache: Plugin = {
    install(app) {
      queryCache = app.runWithContext(() => useQueryCache())
    },
  }

  return {
    getQueryCache() {
      if (!queryCache) {
        throw new Error('Expected Pinia Colada to be installed before reading the query cache')
      }

      return queryCache
    },
    pinia,
    plugins: [pinia, PiniaColada, captureQueryCache],
  }
}
