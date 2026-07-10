import { PiniaColada, useQueryCache } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { NConfigProvider, dateZhCN, zhCN } from 'naive-ui'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from '../src/App.vue'
import { useAuthStore } from '../src/stores/auth'
import { session } from './helpers/auth'
import { createTestPinia } from './helpers/pinia'

async function mountApp() {
  const pinia = createTestPinia()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', component: { template: '<main>Login</main>' } },
      { path: '/system/users', component: { template: '<main>Users</main>' } },
    ],
  })

  await router.push('/system/users')
  await router.isReady()

  const wrapper = mount(App, {
    global: {
      plugins: [pinia, PiniaColada, router],
    },
  })

  return { pinia, router, wrapper }
}

describe('App', () => {
  it('configures Naive UI with Chinese locale', async () => {
    const { wrapper } = await mountApp()
    const configProvider = wrapper.findComponent(NConfigProvider)

    expect(configProvider.props('locale')).toBe(zhCN)
    expect(configProvider.props('dateLocale')).toBe(dateZhCN)
  })

  it('clears user query state and navigates to login when an authenticated session ends', async () => {
    const { pinia, router, wrapper } = await mountApp()
    const auth = useAuthStore(pinia)
    const queryCache = wrapper.vm.$.appContext.app.runWithContext(() => useQueryCache())
    const cancelQueries = vi.spyOn(queryCache, 'cancelQueries')
    const queryKey = ['system', 'users', 'list']

    auth.setSession(session)
    await flushPromises()
    queryCache.setQueryData(queryKey, [{ id: session.user.id }])
    auth.clearSession()
    await flushPromises()

    expect(cancelQueries).toHaveBeenCalledOnce()
    expect(queryCache.get(queryKey)).toBeUndefined()
    expect(router.currentRoute.value.fullPath).toBe('/login')
  })
})
