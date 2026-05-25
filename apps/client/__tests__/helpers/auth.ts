import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { NConfigProvider, NDialogProvider, NMessageProvider, dateZhCN, zhCN } from 'naive-ui'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import type { AuthTokenResponse } from '@rev30/contracts'
import { USER_STATUS_ENABLED } from '@rev30/contracts'
import { canDirective } from '../../src/directives/can'
import { useAuthStore } from '../../src/stores/auth'
import { createTestPinia } from './pinia'
export { resetThemeDom, stubPreferredDark } from './dom'
export { createTestPinia, disposeActiveTestPinia } from './pinia'

export const session: AuthTokenResponse = {
  accessToken: 'access-token',
  tokenType: 'Bearer',
  expiresIn: 900,
  accessCodes: ['system:user:list', 'system:user:create', 'system:role:update'],
  menus: [
    {
      id: 'f905f4dc-c43f-41a8-b6fc-d381f291331a',
      parentId: null,
      type: 'directory',
      name: 'System',
      code: 'system',
      path: null,
      externalUrl: null,
      openTarget: 'self',
      icon: 'lucide:settings',
      hidden: false,
      status: 1,
      sortOrder: 0,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
      children: [
        {
          id: '83d85ddf-9ebf-4f62-af9f-368af6d0d2a5',
          parentId: 'f905f4dc-c43f-41a8-b6fc-d381f291331a',
          type: 'menu',
          name: 'Users',
          code: 'system:user:list',
          path: '/system/users',
          externalUrl: null,
          openTarget: 'self',
          icon: 'lucide:users',
          hidden: false,
          status: 1,
          sortOrder: 1,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
          children: [],
        },
      ],
    },
  ],
  user: {
    id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
    username: 'ada',
    nickname: 'Ada Lovelace',
    email: null,
    phone: null,
    status: USER_STATUS_ENABLED,
    builtIn: false,
    departments: [],
    roles: [],
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  },
}

export async function mountAuthRoute(
  path: string,
  routes: RouteRecordRaw[],
  authSession?: AuthTokenResponse,
): Promise<{
  router: ReturnType<typeof createRouter>
  wrapper: ReturnType<typeof mount>
}> {
  const pinia = createTestPinia()
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
        plugins: [pinia, PiniaColada, router],
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
