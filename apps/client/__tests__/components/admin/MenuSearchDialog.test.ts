import { flushPromises, mount } from '@vue/test-utils'
import type { ResourceTreeNode } from '@rev30/contracts'
import { defineComponent, nextTick, ref } from 'vue'
import { NConfigProvider } from 'naive-ui'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MenuSearchDialog from '../../../src/components/admin/navigation/MenuSearchDialog.vue'
import { session } from '../../helpers/auth'

const usersMenu = session.menus[0]!.children[0]!
const scrollIntoViewMock = vi.fn()
const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView')

function menu(overrides: Partial<ResourceTreeNode> & Pick<ResourceTreeNode, 'id' | 'name'>) {
  return { ...usersMenu, path: null, icon: null, children: [], ...overrides }
}

const menus: ResourceTreeNode[] = [
  menu({
    id: 'operations',
    name: '运维管理',
    children: [
      menu({ id: 'login-log', name: '登录日志', path: '/login-log' }),
      menu({ id: 'operation-log', name: '操作日志', path: '/operation-log' }),
    ],
  }),
  menu({
    id: 'docs',
    name: '开发文档',
    externalUrl: 'https://example.com/docs',
    openTarget: 'blank',
  }),
]

async function mountDialog(initialMenus = menus) {
  const show = ref(true)
  const availableMenus = ref(initialMenus)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login-log', component: { template: '<main>Login</main>' } },
      { path: '/operation-log', component: { template: '<main>Operation</main>' } },
    ],
  })
  await router.push('/login-log')

  const wrapper = mount(
    defineComponent({
      components: { MenuSearchDialog, NConfigProvider },
      setup: () => ({ show, availableMenus }),
      template:
        '<NConfigProvider><MenuSearchDialog v-model:show="show" :menus="availableMenus" /></NConfigProvider>',
    }),
    { global: { plugins: [router], stubs: { transition: false } } },
  )
  await flushPromises()

  return { wrapper, show, availableMenus, router }
}

function input() {
  return document.body.querySelector<HTMLInputElement>('[role="combobox"]')!
}

function options() {
  return [...document.body.querySelectorAll<HTMLElement>('[role="option"]')]
}

describe('menu search dialog', () => {
  beforeEach(() => {
    scrollIntoViewMock.mockClear()
    Element.prototype.scrollIntoView = scrollIntoViewMock
  })

  afterEach(() => {
    if (scrollIntoViewDescriptor) {
      Object.defineProperty(Element.prototype, 'scrollIntoView', scrollIntoViewDescriptor)
    } else {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
    }
  })

  it('shows all navigable menus, filters by name, and resets after reopening', async () => {
    const { show, availableMenus } = await mountDialog()

    expect(document.body.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(
      '搜索菜单',
    )
    await vi.waitFor(() => expect(document.activeElement).toBe(input()))
    expect(options().map((option) => option.textContent)).toEqual([
      expect.stringContaining('登录日志'),
      expect.stringContaining('操作日志'),
      expect.stringContaining('开发文档'),
    ])
    expect(options()[0]?.textContent).toContain('运维管理')

    input().value = '  日志  '
    input().dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(options()).toHaveLength(2)

    availableMenus.value = [menu({ id: 'users', name: '系统用户', path: '/login-log' })]
    await nextTick()
    expect(document.body.textContent).toContain('未找到匹配的菜单')
    expect(input().getAttribute('aria-activedescendant')).toBeNull()
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()
    expect(show.value).toBe(true)

    show.value = false
    await flushPromises()
    show.value = true
    await flushPromises()
    expect(input().value).toBe('')
    expect(options()).toHaveLength(1)
    expect(options()[0]?.getAttribute('aria-selected')).toBe('true')

    availableMenus.value = []
    await nextTick()
    expect(document.body.textContent).toContain('暂无可访问菜单')
  })

  it('cycles selection and closes before a guarded internal navigation', async () => {
    const { show, router } = await mountDialog()
    const guard = vi.fn(() => false)
    router.beforeEach(guard)

    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    await nextTick()
    expect(options()[2]?.getAttribute('aria-selected')).toBe('true')
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await nextTick()
    expect(options()[0]?.getAttribute('aria-selected')).toBe('true')
    expect(scrollIntoViewMock).toHaveBeenCalled()

    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()
    expect(show.value).toBe(false)
    expect(guard).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/login-log')
  })

  it('leaves selection and navigation untouched during composition', async () => {
    const { router, show } = await mountDialog()
    input().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }),
    )
    await flushPromises()

    expect(options()[0]?.getAttribute('aria-selected')).toBe('true')
    expect(router.currentRoute.value.path).toBe('/login-log')
    expect(show.value).toBe(true)
  })

  it('keeps external links and blank targets as ordinary links', async () => {
    const { show } = await mountDialog()
    const link = document.body.querySelector<HTMLAnchorElement>(
      'a[href="https://example.com/docs"]',
    )!

    expect(link.target).toBe('_blank')
    expect(link.rel).toBe('noopener noreferrer')
    link.addEventListener('click', (event) => event.preventDefault())
    link.click()
    await nextTick()
    expect(show.value).toBe(false)
  })

  it('keeps internal blank targets and modified clicks as browser links', async () => {
    const { router, show, availableMenus } = await mountDialog([
      menu({ id: 'new-window', name: '新窗口', path: '/operation-log', openTarget: 'blank' }),
    ])
    const link = document.body.querySelector<HTMLAnchorElement>('a[href="/operation-log"]')!
    expect(link.target).toBe('_blank')
    expect(link.rel).toBe('noopener noreferrer')
    const preventDefault = (event: MouseEvent) => event.preventDefault()
    link.addEventListener('click', preventDefault)
    link.click()
    await flushPromises()
    expect(show.value).toBe(false)
    expect(router.currentRoute.value.path).toBe('/login-log')
    link.removeEventListener('click', preventDefault)

    availableMenus.value = [menu({ id: 'same-window', name: '当前窗口', path: '/operation-log' })]
    show.value = true
    await flushPromises()
    const modifiedClick = new MouseEvent('click', {
      button: 0,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    document.body
      .querySelector<HTMLAnchorElement>('a[href="/operation-log"]')!
      .dispatchEvent(modifiedClick)
    expect(modifiedClick.defaultPrevented).toBe(false)
    expect(router.currentRoute.value.path).toBe('/login-log')
  })
})
