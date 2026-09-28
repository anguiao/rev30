import { getDialogButton } from '../../helpers/dom'
import { flushPromises, mount } from '@vue/test-utils'
import type { AuthTokenResponse } from '@rev30/contracts'
import { defineComponent } from 'vue'
import { NConfigProvider, NDialogProvider, dateZhCN, zhCN } from 'naive-ui'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminLayout from '../../../src/components/admin/AdminLayout.vue'
import { logout } from '../../../src/features/auth'
import { useAuthStore } from '../../../src/stores/auth'
import { session, stubPreferredDark } from '../../helpers/auth'
import { createTestQueryHarness } from '../../helpers/colada'
vi.mock('../../../src/features/auth', () => ({
  logout: vi.fn(),
}))

vi.mock('../../../src/features/users', () => ({
  UserAvatar: {
    name: 'UserAvatar',
    props: ['avatarId', 'nickname', 'username', 'size'],
    template:
      '<span data-test="admin-sidebar-user-avatar" :title="nickname || username">{{ avatarId || username }}</span>',
  },
}))

const logoutMock = vi.mocked(logout)
const systemMenuId = 'f905f4dc-c43f-41a8-b6fc-d381f291331a'
const usersMenuId = '83d85ddf-9ebf-4f62-af9f-368af6d0d2a5'
const auditLogMenuId = '4d6279f1-fdf9-487a-8a02-347ed201f59c'
const docsMenuId = '78093266-57fe-4e0f-b420-ab55a67df4e9'
const rolesMenuId = 'c54bf1f7-5c52-42ff-b055-b71f2606cc69'
const externalDocsMenuId = '5fe0dd74-45fc-42fd-a3da-dfe6fcc60e4e'
const adminSidebarCollapsedStorageKey = 'admin-sidebar-collapsed'

function createMenuSession(): AuthTokenResponse {
  return {
    ...session,
    accessCodes: ['system', 'system:user:list', 'system:role:list', 'docs:guide'],
    menus: [
      {
        id: systemMenuId,
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
            id: usersMenuId,
            parentId: systemMenuId,
            type: 'menu',
            name: '系统用户',
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
            id: docsMenuId,
            parentId: systemMenuId,
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
                id: rolesMenuId,
                parentId: docsMenuId,
                type: 'menu',
                name: '系统角色',
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
            id: auditLogMenuId,
            parentId: systemMenuId,
            type: 'menu',
            name: '审计日志',
            code: 'system:audit-log',
            path: '/system/audit-log',
            externalUrl: null,
            openTarget: 'self',
            icon: 'lucide:history',
            hidden: true,
            status: 1,
            sortOrder: 2,
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-01T00:00:00.000Z',
            children: [
              {
                id: 'c280d9d0-0da0-4149-a364-c6b302f42dab',
                parentId: auditLogMenuId,
                type: 'menu',
                name: '隐藏子项',
                code: 'system:department:list',
                path: '/system/departments',
                externalUrl: null,
                openTarget: 'self',
                icon: null,
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
            id: externalDocsMenuId,
            parentId: systemMenuId,
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
  const { plugins } = createTestQueryHarness()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/account/announcements', component: { template: '<main>My Announcements</main>' } },
      { path: '/account/settings', component: { template: '<main>Account Settings</main>' } },
      { path: '/system/users', component: { template: '<main>Users</main>' } },
      { path: '/system/users/:id', component: { template: '<main>User Detail</main>' } },
      { path: '/system/audit-log', component: { template: '<main>Audit Log</main>' } },
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

  const wrapper = mount(
    defineComponent({
      components: {
        AdminLayout,
        NConfigProvider,
        NDialogProvider,
      },
      setup() {
        return {
          dateZhCN,
          zhCN,
        }
      },
      template: `
        <NConfigProvider :date-locale="dateZhCN" :locale="zhCN">
          <NDialogProvider>
            <AdminLayout>
              <section data-test="layout-content">Content</section>
            </AdminLayout>
          </NDialogProvider>
        </NConfigProvider>
      `,
    }),
    {
      global: {
        plugins: [...plugins, router],
        stubs: { transition: false },
      },
    },
  )

  return { router, wrapper }
}

describe('admin layout', () => {
  beforeEach(() => {
    stubPreferredDark(false)
    logoutMock.mockReset()
  })

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'platform')
  })

  it.each(['self', 'blank'] as const)(
    'honors the %s target for internal menus',
    async (openTarget) => {
      const authSession = createMenuSession()
      const usersMenu = authSession.menus[0]!.children.find((menu) => menu.id === usersMenuId)!
      usersMenu.openTarget = openTarget
      const { router, wrapper } = await mountLayout({
        initialPath: '/system/roles',
        authSession,
      })

      const link = wrapper.get('a[href="/system/users"]')
      expect(link.attributes('target')).toBe(openTarget === 'blank' ? '_blank' : undefined)
      expect(link.attributes('rel')).toBe(
        openTarget === 'blank' ? 'noopener noreferrer' : undefined,
      )
      link.element.addEventListener('click', (event) => event.preventDefault())
      await link.trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.path).toBe(
        openTarget === 'blank' ? '/system/roles' : '/system/users',
      )
    },
  )

  it('renders navigation, branding, user summary, and content slot', async () => {
    const { wrapper } = await mountLayout()

    expect(wrapper.text()).toContain('Rev30')
    expect(wrapper.text()).toContain('后台管理')
    expect(wrapper.text()).toContain(session.user.nickname)
    expect(wrapper.text()).toContain(session.user.username)
    expect(wrapper.get('[data-test="layout-content"]').text()).toContain('Content')
    expect(wrapper.get('[data-test="admin-breadcrumb"]').text()).toContain('系统管理')
    expect(wrapper.get('[data-test="admin-breadcrumb"]').text()).toContain('系统用户')
    expect(wrapper.get('[data-test="admin-sidebar-toggle"]').attributes('aria-label')).toBe(
      '收起侧边栏',
    )
    expect(wrapper.get('[data-test="admin-sidebar-toggle"]').element.tagName).toBe('BUTTON')
    expect(wrapper.text()).toContain('系统管理')
    expect(wrapper.text()).toContain('指南')
    expect(wrapper.get('a[href="/system/users"]').text()).toContain('系统用户')
    expect(wrapper.find('[data-test="admin-sidebar-user-avatar"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/system/audit-log"]').exists()).toBe(false)

    const externalLink = wrapper.get('a[href="https://example.com/docs"]')
    expect(externalLink.text()).toContain('开发文档')
    expect(externalLink.attributes('target')).toBe('_blank')
    expect(externalLink.attributes('rel')).toBe('noopener noreferrer')

    const icons = wrapper.findAll('[data-test="iconify-icon"]').map((icon) => icon.text())
    expect(icons).toContain('lucide:settings')
    expect(icons).toContain('lucide:users')
    expect(icons).toContain('lucide:book-open')
    expect(icons).toContain('lucide:square-arrow-out-up-right')
    expect(wrapper.find('[data-test="theme-mode-trigger"]').exists()).toBe(true)
  })

  it('collapses the desktop sidebar while keeping icon navigation available', async () => {
    const { wrapper } = await mountLayout()

    await wrapper.get('[data-test="admin-sidebar-toggle"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="admin-sidebar-toggle"]').attributes('aria-label')).toBe(
      '展开侧边栏',
    )
    expect(wrapper.find('[data-test="admin-sidebar-brand"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="admin-sidebar-brand-mark"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="admin-sidebar-user"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="theme-mode-trigger"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="admin-logout"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="admin-sidebar-user-avatar"]').attributes('title')).toBe(
      session.user.nickname,
    )
    expect(localStorage.getItem(adminSidebarCollapsedStorageKey)).toBe('true')
  })

  it('navigates to account settings from the expanded user area', async () => {
    const { router, wrapper } = await mountLayout()

    await wrapper.get('[data-test="admin-account-settings"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/account/settings')
  })

  it('navigates to announcements from the expanded user area', async () => {
    const { router, wrapper } = await mountLayout()

    await wrapper.get('[data-test="admin-announcements"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/account/announcements')
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

    expect(wrapper.get('[data-test="admin-sidebar-toggle"]').attributes('aria-label')).toBe(
      '展开侧边栏',
    )
    expect(wrapper.find('[data-test="admin-sidebar-brand"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="admin-sidebar-brand-mark"]').exists()).toBe(true)
  })

  it('renders an empty navigation state when there are no accessible menus', async () => {
    const { wrapper } = await mountLayout({
      authSession: {
        ...createMenuSession(),
        accessCodes: [],
        menus: [],
      },
    })

    expect(wrapper.text()).toContain('暂无可访问菜单')
    expect(wrapper.find('a[href="/system/users"]').exists()).toBe(false)
  })

  it('renders the parent breadcrumb for nested internal routes', async () => {
    const { wrapper } = await mountLayout({
      initialPath: '/system/users/123',
    })

    expect(wrapper.get('[data-test="admin-breadcrumb"]').text()).toContain('系统管理')
    expect(wrapper.get('[data-test="admin-breadcrumb"]').text()).toContain('系统用户')
    expect(wrapper.get('a[href="/system/users"]').text()).toContain('系统用户')
  })

  it('renders nested route breadcrumbs and links', async () => {
    const { wrapper } = await mountLayout({
      initialPath: '/system/roles',
    })

    expect(wrapper.get('[data-test="admin-breadcrumb"]').text()).toContain('系统管理')
    expect(wrapper.get('[data-test="admin-breadcrumb"]').text()).toContain('指南')
    expect(wrapper.get('[data-test="admin-breadcrumb"]').text()).toContain('系统角色')
    expect(wrapper.get('a[href="/system/roles"]').text()).toContain('系统角色')
    expect(wrapper.findAll('[data-test="iconify-icon"]').map((icon) => icon.text())).toContain(
      'lucide:shield-check',
    )
  })

  it('does not render a breadcrumb on unknown routes', async () => {
    const { wrapper } = await mountLayout({
      initialPath: '/unknown',
    })

    expect(wrapper.find('[data-test="admin-breadcrumb"]').exists()).toBe(false)
  })

  it('uses hidden accessible menus for breadcrumbs without rendering them in the sidebar', async () => {
    const { wrapper } = await mountLayout({
      initialPath: '/system/audit-log',
    })

    expect(wrapper.find('a[href="/system/audit-log"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="admin-breadcrumb"]').text()).toContain('系统管理')
    expect(wrapper.get('[data-test="admin-breadcrumb"]').text()).toContain('审计日志')
  })

  it('logs out and clears the auth session', async () => {
    logoutMock.mockResolvedValue(undefined)
    const { router, wrapper } = await mountLayout()
    const auth = useAuthStore()

    await wrapper.get('[data-test="admin-logout"]').trigger('click')
    await flushPromises()

    expect(logoutMock).not.toHaveBeenCalled()

    getDialogButton('admin-logout-confirm').click()
    await flushPromises()

    expect(logoutMock).toHaveBeenCalledTimes(1)
    expect(auth.isAuthenticated).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/system/users')
  })

  it('keeps the session when logout confirmation is cancelled', async () => {
    const { router, wrapper } = await mountLayout()
    const auth = useAuthStore()

    await wrapper.get('[data-test="admin-logout"]').trigger('click')
    await flushPromises()

    getDialogButton('admin-logout-cancel').click()
    await flushPromises()

    expect(logoutMock).not.toHaveBeenCalled()
    expect(auth.isAuthenticated).toBe(true)
    expect(router.currentRoute.value.fullPath).toBe('/system/users')
  })

  it('clears the auth session when logout fails', async () => {
    logoutMock.mockRejectedValue(new Error('network'))
    const { router, wrapper } = await mountLayout()
    const auth = useAuthStore()

    await wrapper.get('[data-test="admin-logout"]').trigger('click')
    await flushPromises()

    getDialogButton('admin-logout-confirm').click()
    await flushPromises()

    expect(logoutMock).toHaveBeenCalledTimes(1)
    expect(auth.isAuthenticated).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/system/users')
  })

  it('opens search in expanded and collapsed sidebars and omits hidden menus', async () => {
    const { wrapper } = await mountLayout()
    const trigger = wrapper.get('aside button[aria-label="搜索菜单"]')

    expect(trigger.text()).toContain('搜索菜单')
    await trigger.trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(document.body.querySelector('[role="combobox"]'))
    expect(document.body.querySelector('[role="dialog"] a[href="/system/users"]')).not.toBeNull()
    expect(document.body.querySelector('[role="dialog"] a[href="/system/audit-log"]')).toBeNull()
    expect(document.body.querySelector('[role="dialog"] a[href="/system/departments"]')).toBeNull()

    document.body.querySelector<HTMLButtonElement>('button[aria-label="关闭搜索"]')!.click()
    await flushPromises()
    await wrapper.get('[data-test="admin-sidebar-toggle"]').trigger('click')
    expect(trigger.text()).not.toContain('搜索菜单')
    expect(trigger.attributes('title')).toContain('搜索菜单')
    await trigger.trigger('click')
    await flushPromises()
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('uses the platform shortcut, keeps an open query, and restores focus on Escape', async () => {
    Object.defineProperty(navigator, 'platform', { configurable: true, value: 'MacIntel' })
    const { wrapper } = await mountLayout()
    const trigger = wrapper.get('aside button[aria-label="搜索菜单"]')
    expect(trigger.text()).toContain('⌘K')

    const ordinaryInput = document.createElement('input')
    document.body.append(ordinaryInput)
    ordinaryInput.focus()
    ordinaryInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true }),
    )
    await flushPromises()
    const searchInput = document.body.querySelector<HTMLInputElement>('[role="combobox"]')!
    expect(document.activeElement).toBe(searchInput)
    searchInput.value = '日志'
    searchInput.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()

    document.body.querySelector<HTMLButtonElement>('button[aria-label="关闭搜索"]')!.focus()
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true }),
    )
    await flushPromises()
    expect(document.activeElement).toBe(searchInput)
    expect(searchInput.value).toBe('日志')

    searchInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }),
    )
    await flushPromises()
    expect(document.activeElement).toBe(ordinaryInput)
  })

  it('ignores handled, repeating, composing, editable, and modal shortcuts', async () => {
    Object.defineProperty(navigator, 'platform', { configurable: true, value: 'Win32' })
    const { wrapper } = await mountLayout()
    expect(wrapper.get('aside button[aria-label="搜索菜单"]').text()).toContain('Ctrl+K')

    const input = document.createElement('input')
    document.body.append(input)
    const keydown = (options: KeyboardEventInit = {}) =>
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, ...options })

    const handled = keydown({ cancelable: true })
    handled.preventDefault()
    input.dispatchEvent(handled)
    input.dispatchEvent(keydown({ repeat: true }))
    input.dispatchEvent(keydown({ isComposing: true }))
    await flushPromises()
    expect(document.body.querySelector('[role="combobox"]')).toBeNull()

    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    const child = document.createElement('span')
    editor.append(child)
    document.body.append(editor)
    child.dispatchEvent(keydown())
    await flushPromises()
    expect(document.body.querySelector('[role="combobox"]')).toBeNull()

    const modal = document.createElement('div')
    modal.setAttribute('role', 'dialog')
    modal.append(input)
    document.body.append(modal)
    input.dispatchEvent(keydown())
    await flushPromises()
    expect(document.body.querySelector('[role="combobox"]')).toBeNull()

    modal.remove()
    document.body.append(input)
    input.dispatchEvent(keydown())
    await flushPromises()
    expect(document.body.querySelector('[role="combobox"]')).not.toBeNull()

    document.body.querySelector<HTMLButtonElement>('button[aria-label="关闭搜索"]')!.click()
    await flushPromises()
    const textarea = document.createElement('textarea')
    document.body.append(textarea)
    textarea.dispatchEvent(keydown())
    await flushPromises()
    expect(document.body.querySelector('[role="combobox"]')).not.toBeNull()
  })
})
