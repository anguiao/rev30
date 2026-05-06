// @vitest-environment happy-dom

import { PiniaColada } from '@pinia/colada'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import type { AuthTokenResponse } from '@rev30/shared'
import { createPinia, setActivePinia } from 'pinia'
import { NMenu } from 'naive-ui'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminLayout from '../../../src/components/admin/AdminLayout.vue'
import { logout } from '../../../src/features/auth'
import { useAuthStore } from '../../../src/stores/auth'
import { session, stubPreferredDark } from '../../helpers/auth'

enableAutoUnmount(afterEach)

vi.mock('../../../src/features/auth', () => ({
  logout: vi.fn(),
}))

vi.mock('@iconify/vue', () => ({
  Icon: defineComponent({
    name: 'Icon',
    props: {
      icon: {
        type: String,
        required: true,
      },
    },
    setup(props) {
      return () => h('span', { 'data-test': 'menu-icon' }, props.icon)
    },
  }),
}))

const logoutMock = vi.mocked(logout)

function createMenuSession(): AuthTokenResponse {
  return {
    ...session,
    accessCodes: [
      'system',
      'system:user:list',
      'system:role:list',
      'docs:guide',
    ],
    menus: [
      {
        id: 'f905f4dc-c43f-41a8-b6fc-d381f291331a',
        parentId: null,
        type: 'directory',
        name: '系统管理',
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
            name: '用户管理',
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
          {
            id: '78093266-57fe-4e0f-b420-ab55a67df4e9',
            parentId: 'f905f4dc-c43f-41a8-b6fc-d381f291331a',
            type: 'directory',
            name: '指南',
            code: 'docs',
            path: null,
            externalUrl: null,
            openTarget: 'self',
            icon: 'lucide:book-open',
            hidden: false,
            status: 1,
            sortOrder: 2,
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-01T00:00:00.000Z',
            children: [
              {
                id: 'c54bf1f7-5c52-42ff-b055-b71f2606cc69',
                parentId: '78093266-57fe-4e0f-b420-ab55a67df4e9',
                type: 'menu',
                name: '角色管理',
                code: 'system:role:list',
                path: '/system/roles',
                externalUrl: null,
                openTarget: 'self',
                icon: 'lucide:shield-check',
                hidden: false,
                status: 1,
                sortOrder: 0,
                createdAt: '2026-05-01T00:00:00.000Z',
                updatedAt: '2026-05-01T00:00:00.000Z',
                children: [],
              },
            ],
          },
          {
            id: '5fe0dd74-45fc-42fd-a3da-dfe6fcc60e4e',
            parentId: 'f905f4dc-c43f-41a8-b6fc-d381f291331a',
            type: 'external',
            name: '开发文档',
            code: 'docs:guide',
            path: null,
            externalUrl: 'https://example.com/docs',
            openTarget: 'blank',
            icon: 'lucide:square-arrow-out-up-right',
            hidden: false,
            status: 1,
            sortOrder: 3,
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-01T00:00:00.000Z',
            children: [],
          },
        ],
      },
    ],
  }
}

async function mountLayout(options?: { initialPath?: string; authSession?: AuthTokenResponse }) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/system/users', component: { template: '<main>Users</main>' } },
      { path: '/system/departments', component: { template: '<main>Departments</main>' } },
      { path: '/system/roles', component: { template: '<main>Roles</main>' } },
      { path: '/system/resources', component: { template: '<main>Resources</main>' } },
      { path: '/login', component: { template: '<main>Login</main>' } },
    ],
  })
  useAuthStore().setSession(options?.authSession ?? createMenuSession())
  await router.push(options?.initialPath ?? '/system/users')
  await router.isReady()

  const wrapper = mount(AdminLayout, {
    slots: {
      default: '<section data-test="layout-content">Content</section>',
    },
    global: {
      plugins: [pinia, PiniaColada, router],
    },
  })

  return { router, wrapper }
}

describe('admin layout', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
    stubPreferredDark(false)
    logoutMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders navigation, branding, user summary, and content slot', async () => {
    const { wrapper } = await mountLayout()
    const menu = wrapper.getComponent(NMenu)

    expect(wrapper.text()).toContain('Rev30')
    expect(wrapper.text()).toContain('后台管理')
    expect(wrapper.text()).toContain(session.user.nickname)
    expect(wrapper.text()).toContain(session.user.username)
    expect(wrapper.get('[data-test="layout-content"]').text()).toContain('Content')
    expect(wrapper.find('.n-menu').exists()).toBe(true)
    expect(menu.props('value')).toBe('/system/users')
    expect(wrapper.text()).toContain('系统管理')
    expect(wrapper.text()).toContain('指南')
    expect(wrapper.get('a[href="/system/users"]').text()).toContain('用户管理')
    expect(wrapper.get('a[href="/system/roles"]').text()).toContain('角色管理')

    const externalLink = wrapper.get('a[href="https://example.com/docs"]')
    expect(externalLink.text()).toContain('开发文档')
    expect(externalLink.attributes('target')).toBe('_blank')
    expect(externalLink.attributes('rel')).toBe('noreferrer')

    const icons = wrapper.findAll('[data-test="menu-icon"]').map((icon) => icon.text())
    expect(icons).toContain('lucide:settings')
    expect(icons).toContain('lucide:users')
    expect(icons).toContain('lucide:book-open')
    expect(icons).toContain('lucide:shield-check')
    expect(icons).toContain('lucide:square-arrow-out-up-right')
    expect(wrapper.html()).not.toContain('i-[lucide--users]')
    expect(wrapper.find('[data-test="theme-mode-trigger"]').exists()).toBe(true)
  })

  it('renders empty state when there are no accessible menus', async () => {
    const { wrapper } = await mountLayout({
      authSession: {
        ...createMenuSession(),
        accessCodes: [],
        menus: [],
      },
    })

    expect(wrapper.text()).toContain('暂无可访问菜单')
    expect(wrapper.find('.n-menu').exists()).toBe(false)
  })

  it('logs out, clears auth session, and navigates to login', async () => {
    logoutMock.mockResolvedValue(undefined)
    const { router, wrapper } = await mountLayout()
    const auth = useAuthStore()

    await wrapper.get('[data-test="admin-logout"]').trigger('click')
    await flushPromises()

    expect(logoutMock).toHaveBeenCalledTimes(1)
    expect(auth.isAuthenticated).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/login')
  })

  it('clears auth session and navigates to login when logout fails', async () => {
    logoutMock.mockRejectedValue(new Error('network'))
    const { router, wrapper } = await mountLayout()
    const auth = useAuthStore()

    await wrapper.get('[data-test="admin-logout"]').trigger('click')
    await flushPromises()

    expect(logoutMock).toHaveBeenCalledTimes(1)
    expect(auth.isAuthenticated).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/login')
  })
})
