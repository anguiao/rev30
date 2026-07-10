import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { NConfigProvider, dateZhCN, zhCN } from 'naive-ui'
import App from '../src/App.vue'
import { createTestPinia } from './helpers/pinia'

describe('App', () => {
  it('configures Naive UI with Chinese locale', () => {
    const wrapper = mount(App, {
      global: {
        plugins: [createTestPinia()],
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
