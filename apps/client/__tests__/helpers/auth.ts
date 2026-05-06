import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import { vi } from 'vitest'
import type { AuthTokenResponse } from '@rev30/shared'
import { USER_STATUS_ENABLED } from '@rev30/shared'

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
    departments: [],
    roles: [],
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  },
}

let activeTestPinia: Pinia | undefined

export function createTestPinia() {
  activeTestPinia = createPinia()
  setActivePinia(activeTestPinia)

  return activeTestPinia
}

export function disposeActiveTestPinia() {
  if (activeTestPinia === undefined) {
    return
  }

  disposePinia(activeTestPinia)
  activeTestPinia = undefined
}

export function stubPreferredDark(matches: boolean) {
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

export async function mountAuthRoute(path: string, routes: RouteRecordRaw[]) {
  const pinia = createTestPinia()
  const router = createRouter({
    history: createMemoryHistory(),
    routes,
  })

  await router.push(path)
  await router.isReady()

  const wrapper = mount(
    defineComponent({
      template: '<RouterView />',
    }),
    {
      global: {
        plugins: [pinia, PiniaColada, router],
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
