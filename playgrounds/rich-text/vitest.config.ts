import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineBrowserCommand, playwright } from '@vitest/browser-playwright'
import type { PlaywrightBrowserProvider } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

const browserProvider = playwright({
  contextOptions: {
    colorScheme: 'light',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  },
})

const setClipboard = defineBrowserCommand(async (context, value: string) => {
  const provider = context.provider as PlaywrightBrowserProvider
  const { page, context: browserContext } = provider.getCommandsContext(context.sessionId)
  const origin = new URL(page.url()).origin

  await browserContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin })
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), value)
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
      commands: {
        setClipboard,
      },
    },
    fileParallelism: false,
    maxWorkers: 1,
    retry: 0,
    include: ['__tests__/**/*.browser.test.ts'],
    setupFiles: ['./__tests__/setup.browser.ts'],
  },
})
