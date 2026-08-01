import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

const browserProvider = playwright({
  contextOptions: {
    colorScheme: 'light',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  },
})

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  test: {
    attachmentsDir: 'test-results/attachments',
    browser: {
      enabled: true,
      provider: browserProvider,
      headless: true,
      instances: [
        {
          browser: 'chromium',
          viewport: { width: 1280, height: 900 },
        },
      ],
      trace: { mode: 'retain-on-failure', tracesDir: 'test-results/traces' },
      screenshotFailures: false,
      locators: { testIdAttribute: 'data-test' },
    },
    fileParallelism: false,
    maxWorkers: 1,
    retry: 0,
    include: ['__tests__/**/*.browser.test.ts'],
    setupFiles: ['./__tests__/setup.browser.ts'],
  },
})
