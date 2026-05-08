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
const systemResourceId = 'f905f4dc-c43f-41a8-b6fc-d381f291331a'
const usersResourceId = '83d85ddf-9ebf-4f62-af9f-368af6d0d2a5'
const docsResourceId = '78093266-57fe-4e0f-b420-ab55a67df4e9'
const rolesResourceId = 'c54bf1f7-5c52-42ff-b055-b71f2606cc69'
const externalDocsResourceId = '5fe0dd74-45fc-42fd-a3da-dfe6fcc60e4e'
const adminSidebarCollapsedStorageKey = 'admin-sidebar-collapsed'

function createMenuSession(): AuthTokenResponse {
  return {
    ...session,
    accessCodes: ['system', 'system:user:list', 'system:role:list', 'docs:guide'],
    menus: [
      {
        id: systemResourceId,
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
            id: usersResourceId,
            parentId: systemResourceId,
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
            id: docsResourceId,
            parentId: systemResourceId,
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
                id: rolesResourceId,
                parentId: docsResourceId,
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
            id: externalDocsResourceId,
            parentId: systemResourceId,
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
      { path: '/account/settings', component: { template: '<main>Account Settings</main>' } },
      { path: '/system/users', component: { template: '<main>Users</main>' } },
      { path: '/system/users/:id', component: { template: '<main>User Detail</main>' } },
      { path: '/system/departments', component: { template: '<main>Departments</main>' } },
      { path: '/system/roles', component: { template: '<main>Roles</main>' } },
      { path: '/system/resources', component: { template: '<main>Resources</main>' } },
      { path: '/unknown', component: { template: '<main>Unknown</main>' } },
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
    expect(wrapper.get('[data-test="admin-breadcrumb"]').text()).toContain('系统管理')
    expect(wrapper.get('[data-test="admin-breadcrumb"]').text()).toContain('用户管理')
    expect(wrapper.find('.n-menu').exists()).toBe(true)
    expect(wrapper.get('[data-test="admin-sidebar-toggle"]').attributes('aria-label')).toBe(
      '收起侧边栏',
    )
    expect(wrapper.get('[data-test="admin-sidebar-toggle"]').element.tagName).toBe('BUTTON')
    expect(wrapper.get('[data-test="admin-sidebar-toggle"]').classes()).toContain(
      'focus-visible:outline-solid',
    )
    expect(wrapper.get('[data-test="admin-sidebar-toggle"]').classes()).toContain(
      'focus-visible:outline-primary',
    )
    expect(wrapper.get('[data-test="admin-sidebar-toggle"]').classes()).toContain('cursor-pointer')
    expect(wrapper.get('[data-test="admin-sidebar-toggle"]').classes()).toContain('mt-0.5')
    expect(wrapper.get('[data-test="admin-sidebar-toggle"]').classes()).not.toContain('n-button')
    expect(wrapper.get('[data-test="admin-sidebar-toggle-icon"]').classes()).toContain('size-4')
    expect(wrapper.get('[data-test="admin-shell"]').attributes('style')).toContain(
      '--admin-sidebar-width: 256px',
    )
    expect(wrapper.get('[data-test="admin-sidebar"]').classes()).not.toContain('px-5')
    expect(wrapper.get('[data-test="admin-sidebar"]').classes()).toContain('py-6')
    expect(wrapper.get('[data-test="admin-sidebar-header"]').classes()).toContain('relative')
    expect(wrapper.get('[data-test="admin-sidebar-header"]').classes()).toContain('h-20')
    expect(wrapper.get('[data-test="admin-sidebar-header"]').classes()).toContain('mb-6')
    expect(wrapper.get('[data-test="admin-sidebar-header-content"]').classes()).toContain('h-full')
    expect(wrapper.get('[data-test="admin-sidebar-header-content"]').classes()).toContain('px-5')
    expect(wrapper.get('[data-test="admin-sidebar-header-content"]').classes()).toContain(
      'items-start',
    )
    expect(wrapper.get('[data-test="admin-sidebar-header-separator"]').classes()).toContain(
      'bottom-0',
    )
    expect(wrapper.get('[data-test="admin-sidebar-header-separator"]').classes()).toContain(
      'left-5',
    )
    expect(wrapper.get('[data-test="admin-sidebar-header-separator"]').classes()).toContain(
      'right-5',
    )
    expect(wrapper.get('[data-test="admin-sidebar-footer-separator"]').classes()).toContain('mx-5')
    expect(wrapper.get('[data-test="admin-sidebar-footer-content"]').classes()).toContain('px-5')
    expect(menu.props('value')).toBe(usersResourceId)
    expect(menu.props('collapsed')).toBe(false)
    expect(menu.props('defaultExpandAll')).toBe(false)
    expect(menu.props('expandedKeys')).toEqual([systemResourceId])
    expect(menu.props('rootIndent')).toBe(20)
    expect(wrapper.text()).toContain('系统管理')
    expect(wrapper.text()).toContain('指南')
    expect(wrapper.get('a[href="/system/users"]').text()).toContain('用户管理')

    const externalLink = wrapper.get('a[href="https://example.com/docs"]')
    expect(externalLink.text()).toContain('开发文档')
    expect(externalLink.attributes('target')).toBe('_blank')
    expect(externalLink.attributes('rel')).toBe('noopener noreferrer')

    const icons = wrapper.findAll('[data-test="menu-icon"]').map((icon) => icon.text())
    expect(icons).toContain('lucide:settings')
    expect(icons).toContain('lucide:users')
    expect(icons).toContain('lucide:book-open')
    expect(icons).toContain('lucide:square-arrow-out-up-right')
    expect(wrapper.html()).not.toContain('i-[lucide--users]')
    expect(wrapper.find('[data-test="theme-mode-trigger"]').exists()).toBe(true)
  })

  it('collapses the desktop sidebar while keeping icon navigation available', async () => {
    const { wrapper } = await mountLayout()

    await wrapper.get('[data-test="admin-sidebar-toggle"]').trigger('click')
    await flushPromises()

    const menu = wrapper.getComponent(NMenu)

    expect(wrapper.get('[data-test="admin-sidebar-toggle"]').attributes('aria-label')).toBe(
      '展开侧边栏',
    )
    expect(wrapper.get('[data-test="admin-sidebar-toggle"]').classes()).not.toContain('mt-0.5')
    expect(wrapper.get('[data-test="admin-sidebar-toggle-icon"]').classes()).toContain('size-4.5')
    expect(wrapper.get('[data-test="admin-shell"]').attributes('style')).toContain(
      '--admin-sidebar-width: 60px',
    )
    expect(wrapper.get('[data-test="admin-sidebar"]').classes()).not.toContain('px-3')
    expect(wrapper.get('[data-test="admin-sidebar"]').classes()).toContain('py-6')
    expect(wrapper.get('[data-test="admin-sidebar-header"]').classes()).toContain('relative')
    expect(wrapper.get('[data-test="admin-sidebar-header"]').classes()).toContain('h-20')
    expect(wrapper.get('[data-test="admin-sidebar-header"]').classes()).toContain('mb-6')
    expect(wrapper.get('[data-test="admin-sidebar-header-content"]').classes()).toContain('h-full')
    expect(wrapper.get('[data-test="admin-sidebar-header-content"]').classes()).toContain('px-3')
    expect(wrapper.get('[data-test="admin-sidebar-header-content"]').classes()).toContain('gap-2')
    expect(wrapper.get('[data-test="admin-sidebar-brand-mark"] span').classes()).toContain('size-8')
    expect(wrapper.get('[data-test="admin-sidebar-header-separator"]').classes()).toContain(
      'left-3',
    )
    expect(wrapper.get('[data-test="admin-sidebar-header-separator"]').classes()).toContain(
      'right-3',
    )
    expect(wrapper.get('[data-test="admin-sidebar-footer-separator"]').classes()).toContain('mx-3')
    expect(wrapper.get('[data-test="admin-sidebar-footer-content"]').classes()).toContain('px-3')
    expect(wrapper.find('[data-test="admin-sidebar-brand"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="admin-sidebar-brand-mark"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="admin-sidebar-user"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="theme-mode-trigger"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="admin-logout"]').exists()).toBe(true)
    expect(menu.props('collapsed')).toBe(true)
    expect(menu.props('collapsedWidth')).toBe(60)
    expect(menu.props('collapsedIconSize')).toBe(18)
    expect(menu.props('value')).toBe(usersResourceId)
    expect(menu.props('expandedKeys')).toEqual([systemResourceId])
    expect(localStorage.getItem(adminSidebarCollapsedStorageKey)).toBe('true')
  })

  it('navigates to account settings from the expanded user area', async () => {
    const { router, wrapper } = await mountLayout()

    await wrapper.get('[data-test="admin-account-settings"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/account/settings')
  })

  it('navigates to account settings from the collapsed footer action', async () => {
    const { router, wrapper } = await mountLayout()

    await wrapper.get('[data-test="admin-sidebar-toggle"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="admin-account-settings"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/account/settings')
  })

  it('restores the collapsed sidebar state from storage', async () => {
    localStorage.setItem(adminSidebarCollapsedStorageKey, 'true')

    const { wrapper } = await mountLayout()
    const menu = wrapper.getComponent(NMenu)

    expect(menu.props('collapsed')).toBe(true)
    expect(wrapper.get('[data-test="admin-sidebar-toggle"]').attributes('aria-label')).toBe(
      '展开侧边栏',
    )
    expect(wrapper.get('[data-test="admin-shell"]').attributes('style')).toContain(
      '--admin-sidebar-width: 60px',
    )
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

  it('keeps the parent menu selected for nested internal routes', async () => {
    const { wrapper } = await mountLayout({
      initialPath: '/system/users/123',
    })
    const menu = wrapper.getComponent(NMenu)

    expect(menu.props('value')).toBe(usersResourceId)
    expect(menu.props('expandedKeys')).toEqual([systemResourceId])
  })

  it('expands only the current route ancestors by default', async () => {
    const { wrapper } = await mountLayout({
      initialPath: '/system/roles',
    })
    const menu = wrapper.getComponent(NMenu)

    expect(menu.props('value')).toBe(rolesResourceId)
    expect(menu.props('expandedKeys')).toEqual([systemResourceId, docsResourceId])
    expect(wrapper.get('a[href="/system/roles"]').text()).toContain('角色管理')
    expect(wrapper.findAll('[data-test="menu-icon"]').map((icon) => icon.text())).toContain(
      'lucide:shield-check',
    )
  })

  it('returns a null selected key for unknown routes', async () => {
    const { wrapper } = await mountLayout({
      initialPath: '/unknown',
    })
    const menu = wrapper.getComponent(NMenu)

    expect(menu.props('value')).toBeNull()
    expect(menu.props('expandedKeys')).toEqual([])
    expect(wrapper.find('[data-test="admin-breadcrumb"]').exists()).toBe(false)
  })

  it('allows the current route ancestors to be manually collapsed', async () => {
    const { wrapper } = await mountLayout()
    const menu = wrapper.getComponent(NMenu)

    menu.vm.$emit('update:expandedKeys', [])
    await flushPromises()

    expect(menu.props('expandedKeys')).toEqual([])
  })

  it('keeps user-expanded menu groups and expands new route ancestors on navigation', async () => {
    const { router, wrapper } = await mountLayout()
    const menu = wrapper.getComponent(NMenu)

    menu.vm.$emit('update:expandedKeys', [systemResourceId, docsResourceId])
    await flushPromises()

    expect(menu.props('expandedKeys')).toEqual([systemResourceId, docsResourceId])

    menu.vm.$emit('update:expandedKeys', [])
    await router.push('/system/roles')
    await flushPromises()

    expect(menu.props('expandedKeys')).toEqual([systemResourceId, docsResourceId])
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
