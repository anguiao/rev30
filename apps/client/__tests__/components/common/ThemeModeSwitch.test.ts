import { flushPromises, mount } from '@vue/test-utils'
import { NDropdown } from 'naive-ui'
import { beforeEach, describe, expect, it } from 'vitest'
import ThemeModeSwitch from '../../../src/components/common/ThemeModeSwitch.vue'
import { createTestPinia } from '../../helpers/pinia'
import { resetThemeDom, stubPreferredDark } from '../../helpers/dom'

async function selectThemeMode(wrapper: ReturnType<typeof mount>, value: string) {
  wrapper.findComponent(NDropdown).vm.$emit('select', value)
  await flushPromises()
}

describe('theme mode switch', () => {
  beforeEach(() => {
    resetThemeDom()
    stubPreferredDark(false)
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
    expect(wrapper.find('[data-test="theme-mode-trigger"]').attributes('aria-label')).toContain(
      '跟随',
    )
  })
})
