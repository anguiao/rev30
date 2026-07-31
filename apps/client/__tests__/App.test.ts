import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { NConfigProvider, dateZhCN, zhCN } from 'naive-ui'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from '../src/App.vue'
import { createTestPinia } from './helpers/pinia'

async function mountApp() {
  const pinia = createTestPinia()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<main>Home</main>' } }],
  })

  await router.push('/')
  await router.isReady()

  return mount(App, {
    global: {
      plugins: [pinia, router],
    },
  })
}

describe('App', () => {
  it('configures Naive UI with Chinese locale', async () => {
    const wrapper = await mountApp()
    const configProvider = wrapper.findComponent(NConfigProvider)

    expect(configProvider.props('locale')).toBe(zhCN)
    expect(configProvider.props('dateLocale')).toBe(dateZhCN)
  })
})
