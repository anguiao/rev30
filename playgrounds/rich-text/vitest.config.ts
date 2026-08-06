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

interface MouseDragPoint {
  readonly selector: string
  readonly x: number
  readonly y: number
}

function resolveMouseDragPoint(point: MouseDragPoint) {
  if (point.selector.length === 0 || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error('Mouse drag points require a selector and finite relative coordinates')
  }
}

const dragMouse = defineBrowserCommand(
  async (context, source: MouseDragPoint, target: MouseDragPoint) => {
    resolveMouseDragPoint(source)
    resolveMouseDragPoint(target)

    const provider = context.provider as PlaywrightBrowserProvider
    const { page, frame } = provider.getCommandsContext(context.sessionId)
    const testFrame = await frame()
    const resolvePoint = async (point: MouseDragPoint) => {
      const box = await testFrame.locator(point.selector).boundingBox()

      if (box === null) {
        throw new Error(
          `Could not find a visible element for mouse drag selector: ${point.selector}`,
        )
      }

      return {
        x: box.x + box.width * point.x,
        y: box.y + box.height * point.y,
      }
    }
    const sourcePoint = await resolvePoint(source)
    const targetPoint = await resolvePoint(target)

    await page.mouse.move(sourcePoint.x, sourcePoint.y)
    await page.mouse.down()
    await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 5 })
    await page.mouse.up()
  },
)

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
      trace: { mode: 'off', tracesDir: 'test-results/traces' },
      screenshotFailures: false,
      locators: { testIdAttribute: 'data-test' },
      commands: {
        dragMouse,
        setClipboard,
      },
    },
    fileParallelism: true,
    maxWorkers: 3,
    retry: 0,
    include: ['__tests__/**/*.browser.test.ts'],
    setupFiles: ['./__tests__/setup.browser.ts'],
  },
})
