// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { NConfigProvider, dateZhCN, zhCN } from 'naive-ui'
import App from '../src/App.vue'

describe('App', () => {
  it('configures Naive UI with Chinese locale', () => {
    const wrapper = mount(App, {
      global: {
        plugins: [createPinia()],
        stubs: {
          RouterView: { template: '<main />' },
        },
      },
    })

    const configProvider = wrapper.findComponent(NConfigProvider)

    expect(configProvider.props('locale')).toBe(zhCN)
    expect(configProvider.props('dateLocale')).toBe(dateZhCN)
  })
})
