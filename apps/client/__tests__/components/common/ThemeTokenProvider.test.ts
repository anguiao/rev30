// @vitest-environment happy-dom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { NConfigProvider } from 'naive-ui'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ThemeTokenProvider from '../../../src/components/common/ThemeTokenProvider.vue'

enableAutoUnmount(afterEach)

describe('ThemeTokenProvider', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style')
    document.head.innerHTML = ''
  })

  it('publishes theme tokens in a root style tag for teleported overlays', async () => {
    mount({
      components: {
        NConfigProvider,
        ThemeTokenProvider,
      },
      template: `
        <NConfigProvider
          :theme-overrides="{
            common: {
              borderRadius: '7px',
              primaryColor: '#123456',
              primaryColorHover: '#234567',
              primaryColorPressed: '#345678',
              primaryColorSuppl: '#456789',
            },
          }"
        >
          <ThemeTokenProvider>
            <span>content</span>
          </ThemeTokenProvider>
        </NConfigProvider>
      `,
    })
    await flushPromises()

    const rootStyle = document.head.querySelector('#app-theme-tokens')
    expect(rootStyle?.textContent).toContain(':root')
    expect(rootStyle?.textContent).toContain('--app-border-radius: 7px;')
    expect(rootStyle?.textContent).toContain('--app-primary-color: #123456;')
    expect(rootStyle?.textContent).toContain('--app-primary-color-hover: #234567;')
    expect(rootStyle?.textContent).toContain('--app-primary-color-pressed: #345678;')
    expect(rootStyle?.textContent).toContain('--app-primary-color-suppl: #456789;')
  })
})
