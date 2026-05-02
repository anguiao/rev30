// @vitest-environment happy-dom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia'
import { NDropdown } from 'naive-ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ThemeModeSwitch from '../../../src/components/common/ThemeModeSwitch.vue'

enableAutoUnmount(afterEach)

let activeTestPinia: Pinia | undefined

function createTestPinia() {
  activeTestPinia = createPinia()
  setActivePinia(activeTestPinia)

  return activeTestPinia
}

function stubPreferredDark(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

async function selectThemeMode(wrapper: ReturnType<typeof mount>, value: string) {
  wrapper.findComponent(NDropdown).vm.$emit('select', value)
  await flushPromises()
}

describe('theme mode switch', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
    stubPreferredDark(false)
  })

  afterEach(() => {
    if (activeTestPinia !== undefined) {
      disposePinia(activeTestPinia)
      activeTestPinia = undefined
    }

    vi.unstubAllGlobals()
  })

  it('switches between light, dark, and system theme modes from the theme dropdown', async () => {
    stubPreferredDark(true)
    const wrapper = mount(ThemeModeSwitch, {
      global: {
        plugins: [createTestPinia()],
      },
    })

    await flushPromises()

    expect(wrapper.find('[data-test="theme-mode-trigger"]').exists()).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    await selectThemeMode(wrapper, 'light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    await selectThemeMode(wrapper, 'dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    await selectThemeMode(wrapper, 'auto')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(wrapper.find('[data-test="theme-mode-trigger"]').text()).toContain('跟随')
  })
})
