import { flushPromises, mount } from '@vue/test-utils'
import { NConfigProvider, NDialogProvider, NMessageProvider, dateZhCN, zhCN } from 'naive-ui'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import type { AuthTokenResponse } from '@rev30/contracts'
import { canDirective } from '../../src/directives/can'
import { useAuthStore } from '../../src/stores/auth'
import { createTestQueryHarness } from './colada'
export { session } from './session'
export { resetThemeDom, stubPreferredDark } from './dom'
export { createTestPinia, disposeActiveTestPinia } from './pinia'

export async function mountAuthRoute(
  path: string,
  routes: RouteRecordRaw[],
  authSession?: AuthTokenResponse,
): Promise<{
  router: ReturnType<typeof createRouter>
  wrapper: ReturnType<typeof mount>
}> {
  const { pinia, plugins } = createTestQueryHarness()
  const auth = useAuthStore(pinia)

  if (authSession !== undefined) {
    auth.setSession(authSession)
  }

  const router = createRouter({
    history: createMemoryHistory(),
    routes,
  })

  await router.push(path)
  await router.isReady()

  const wrapper = mount(
    defineComponent({
      template: `
        <NConfigProvider :date-locale="dateZhCN" :locale="zhCN">
          <NDialogProvider>
            <NMessageProvider>
              <RouterView />
            </NMessageProvider>
          </NDialogProvider>
        </NConfigProvider>
      `,
      components: {
        NConfigProvider,
        NDialogProvider,
        NMessageProvider,
      },
      setup() {
        return {
          dateZhCN,
          zhCN,
        }
      },
    }),
    {
      global: {
        plugins: [...plugins, router],
        directives: {
          can: canDirective,
        },
      },
    },
  )

  return { router, wrapper }
}

export async function triggerBrowserSubmit(wrapper: ReturnType<typeof mount>) {
  const form = wrapper.find('form')

  await wrapper.find('[data-test$="-submit"]').trigger('click')
  await form.trigger('submit')
  await flushPromises()
}
