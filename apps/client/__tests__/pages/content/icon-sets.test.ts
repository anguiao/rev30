import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AuthTokenResponse,
  BuiltinIconListResponse,
  BuiltinIconSetListResponse,
  CustomIconListResponse,
  CustomIconSetListResponse,
} from '@rev30/contracts'
import AdminPage from '../../../src/pages/index.vue'
import {
  deleteCustomIconSet,
  exportCustomIconSet,
  listBuiltinIconSets,
  listBuiltinIcons,
  listCustomIconSets,
  listCustomIcons,
  updateCustomIcon,
} from '../../../src/features/icons/requests'
import IconSetsPage from '../../../src/pages/index/content/icon-sets.vue'
import IconKeywordsInput from '../../../src/features/icons/forms/IconKeywordsInput.vue'
import { saveFile } from '../../../src/utils/download'
import { ApiRequestError } from '../../../src/utils/request'
import { mountAuthRoute, session, stubPreferredDark } from '../../helpers/auth'
import { getDialogButton } from '../../helpers/dom'
import { createDeferred } from '../../helpers/promise'

vi.mock('../../../src/features/icons/forms/IconSetFormDrawer.vue', () => ({
  default: {
    name: 'IconSetFormDrawerStub',
    props: ['show', 'prefix'],
    emits: ['update:show', 'saved'],
    template: `
      <div
        data-test="icon-set-form-drawer"
        :data-show="show"
        :data-prefix="prefix ?? ''"
      >
        {{ show ? (prefix === null ? '创建图标集' : '编辑图标集') : '' }}
      </div>
    `,
  },
}))

vi.mock('../../../src/features/icons/forms/IconUploadDrawer.vue', () => ({
  default: {
    name: 'IconUploadDrawerStub',
    props: ['show', 'prefix'],
    emits: ['update:show'],
    template: `
      <div data-test="icon-upload-drawer" :data-show="show" :data-prefix="prefix ?? ''">
        {{ show ? '上传 SVG 图标' : '' }}
      </div>
    `,
  },
}))

vi.mock('../../../src/utils/download', () => ({
  saveFile: vi.fn(),
}))

vi.mock('../../../src/features/icons/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/icons/requests')>()),
  deleteCustomIconSet: vi.fn(),
  listBuiltinIconSets: vi.fn(),
  listBuiltinIcons: vi.fn(),
  listCustomIconSets: vi.fn(),
  listCustomIcons: vi.fn(),
  exportCustomIconSet: vi.fn(),
  updateCustomIcon: vi.fn(),
}))

const listBuiltinIconSetsMock = vi.mocked(listBuiltinIconSets)
const listBuiltinIconsMock = vi.mocked(listBuiltinIcons)

const listCustomIconSetsMock = vi.mocked(listCustomIconSets)
const listCustomIconsMock = vi.mocked(listCustomIcons)

const deleteCustomIconSetMock = vi.mocked(deleteCustomIconSet)
const exportCustomIconSetMock = vi.mocked(exportCustomIconSet)

const updateCustomIconMock = vi.mocked(updateCustomIcon)
const saveFileMock = vi.mocked(saveFile)

const authSession: AuthTokenResponse = {
  ...session,
  accessCodes: [
    'content:icon-set:list',
    'content:icon-set:create',
    'content:icon-set:update',
    'content:icon-set:delete',
    'content:icon-set:export',
  ],
}

const builtinIconSetsResponse: BuiltinIconSetListResponse = {
  list: [
    {
      prefix: 'lucide',
      name: 'Lucide',
      total: 1,
    },
  ],
  total: 1,
}

const builtinIconsResponse: BuiltinIconListResponse = {
  list: [
    {
      icon: 'lucide:sun',
      prefix: 'lucide',
      name: 'sun',
      setName: 'Lucide',
      body: '<path d="M12 4V2" />',
      width: 24,
      height: 24,
    },
  ],
  nextCursor: null,
  pageSize: 80,
}

const emptyCustomIconSetsResponse: CustomIconSetListResponse = {
  list: [],
  total: 0,
}

const emptyCustomIconsResponse: CustomIconListResponse = {
  list: [],
  nextCursor: null,
  pageSize: 80,
}

const customIconSetsResponse: CustomIconSetListResponse = {
  list: [
    {
      prefix: 'acme',
      name: 'Acme Icons',
      description: null,
      iconCount: 1,
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T00:00:00.000Z',
    },
  ],
  total: 1,
}

const customIconsResponse: CustomIconListResponse = {
  list: [
    {
      icon: 'acme:logo',
      prefix: 'acme',
      name: 'logo',
      setName: 'Acme Icons',
      body: '<path d="M0 0h24v24H0z" />',
      width: 24,
      height: 24,
      keywords: [],
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T00:00:00.000Z',
    },
  ],
  nextCursor: null,
  pageSize: 80,
}

function setElementScrollMetrics(
  element: Element,
  metrics: {
    scrollTop: number
    clientHeight: number
    scrollHeight: number
  },
) {
  for (const [key, value] of Object.entries(metrics)) {
    Object.defineProperty(element, key, {
      configurable: true,
      writable: key === 'scrollTop',
      value,
    })
  }
}

async function mountIconSetsPage(nextSession: AuthTokenResponse = authSession) {
  return mountAuthRoute(
    '/content/icon-sets',
    [
      {
        path: '/',
        component: AdminPage,
        children: [{ path: 'content/icon-sets', component: IconSetsPage }],
      },
    ],
    nextSession,
  )
}

function getBodyButton(label: string) {
  const button = Array.from(document.body.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )

  expect(button).toBeDefined()
  return button!
}

function getIconNameInput() {
  const input = document.body.querySelector<HTMLInputElement>('input[placeholder="请输入图标名称"]')
  expect(input).not.toBeNull()
  return input!
}

async function setIconName(name: string) {
  const input = await vi.waitFor(getIconNameInput)
  input.value = name
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

describe('icon sets page', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    deleteCustomIconSetMock.mockReset()
    listBuiltinIconSetsMock.mockReset()
    listBuiltinIconsMock.mockReset()
    listCustomIconSetsMock.mockReset()
    listCustomIconsMock.mockReset()
    exportCustomIconSetMock.mockReset()
    updateCustomIconMock.mockReset()
    saveFileMock.mockReset()

    listBuiltinIconSetsMock.mockResolvedValue(builtinIconSetsResponse)
    listBuiltinIconsMock.mockResolvedValue(builtinIconsResponse)
    listCustomIconSetsMock.mockResolvedValue(emptyCustomIconSetsResponse)
    listCustomIconsMock.mockResolvedValue(emptyCustomIconsResponse)
    exportCustomIconSetMock.mockResolvedValue({
      blob: new Blob(['{}'], { type: 'application/json' }),
      filename: 'acme.json',
    })

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
    stubPreferredDark(false)
  })

  it('loads built-in icons and opens custom icon set creation', async () => {
    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    expect(wrapper.text()).toContain('图标库')
    expect(wrapper.get('[data-test="builtin-icon-set"]').text()).toContain('Lucide')
    expect(wrapper.get('[data-test="icon-grid-item"]').text()).toContain('sun')
    expect(wrapper.get('[data-test="icon-grid-name"]').text()).toContain('sun')
    expect(listBuiltinIconsMock).toHaveBeenCalledWith({ cursor: undefined, pageSize: 80 })
    expect(listCustomIconSetsMock).not.toHaveBeenCalled()
    expect(listCustomIconsMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="custom-icon-set-create"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="编辑图标"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="删除图标"]').exists()).toBe(false)

    await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
    await flushPromises()

    expect(listCustomIconSetsMock).toHaveBeenCalled()
    expect(listCustomIconsMock).toHaveBeenCalled()

    const createButton = wrapper.get('[data-test="custom-icon-set-create"]')
    await createButton.trigger('click')
    await flushPromises()

    const drawer = wrapper.get('[data-test="icon-set-form-drawer"]')
    expect(drawer.attributes('data-show')).toBe('true')
    expect(drawer.attributes('data-prefix')).toBe('')
    expect(drawer.text()).toBe('创建图标集')
  })

  it('keeps the selected built-in icon set when filtering hides it', async () => {
    listBuiltinIconSetsMock
      .mockResolvedValueOnce(builtinIconSetsResponse)
      .mockResolvedValueOnce({ list: [], total: 0 })
    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    await wrapper.get('[data-test="builtin-icon-set"]').trigger('click')
    await flushPromises()
    expect(listBuiltinIconsMock).toHaveBeenLastCalledWith({
      cursor: undefined,
      pageSize: 80,
      prefix: 'lucide',
    })

    await wrapper.find('[data-test="builtin-icon-set-filter"] input').setValue('missing')
    await vi.waitFor(() => {
      expect(listBuiltinIconSetsMock).toHaveBeenCalledWith({ keyword: 'missing' })
    })

    expect(wrapper.find('[data-test="builtin-icon-set"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Lucide')
    expect(listBuiltinIconsMock).toHaveBeenLastCalledWith({
      cursor: undefined,
      pageSize: 80,
      prefix: 'lucide',
    })
  })

  it('opens edit and upload drawers with the selected custom icon set prefix', async () => {
    listCustomIconSetsMock.mockResolvedValue(customIconSetsResponse)
    listCustomIconsMock.mockResolvedValue(customIconsResponse)
    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
    await flushPromises()
    await wrapper.get('button[aria-label="编辑图标集"]').trigger('click')
    await flushPromises()

    const formDrawer = wrapper.get('[data-test="icon-set-form-drawer"]')
    expect(formDrawer.attributes('data-show')).toBe('true')
    expect(formDrawer.attributes('data-prefix')).toBe('acme')
    expect(formDrawer.text()).toBe('编辑图标集')

    await wrapper.get('[data-test="custom-icon-set"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="custom-icon-set-upload"]').trigger('click')
    await flushPromises()

    const uploadDrawer = wrapper.get('[data-test="icon-upload-drawer"]')
    expect(uploadDrawer.attributes('data-show')).toBe('true')
    expect(uploadDrawer.attributes('data-prefix')).toBe('acme')
    expect(uploadDrawer.text()).toBe('上传 SVG 图标')
  })

  it('preserves custom icon browser state across tab switches', async () => {
    listCustomIconSetsMock.mockResolvedValue(customIconSetsResponse)
    listCustomIconsMock.mockResolvedValue(customIconsResponse)
    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="custom-icon-set"]').trigger('click')
    await wrapper.find('[data-test="custom-icon-filter"] input').setValue('logo')
    await vi.waitFor(() => {
      expect(listCustomIconsMock).toHaveBeenCalledWith({
        cursor: undefined,
        pageSize: 80,
        keyword: 'logo',
        prefix: 'acme',
      })
    })

    expect(wrapper.find('[data-test="icon-upload-drawer"]').exists()).toBe(false)

    await wrapper.get('[data-test="icon-sets-tab-builtin"]').trigger('click')
    await flushPromises()
    expect(
      wrapper.get<HTMLInputElement>('[data-test="builtin-icon-filter"] input').element.value,
    ).toBe('')
    expect(wrapper.get('[data-test="builtin-icon-set-all"]').attributes('aria-pressed')).toBe(
      'true',
    )
    await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
    await flushPromises()

    expect(
      wrapper.find<HTMLInputElement>('[data-test="custom-icon-filter"] input').element.value,
    ).toBe('logo')

    await wrapper.get('[data-test="custom-icon-set-upload"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="icon-upload-drawer"]').attributes('data-prefix')).toBe('acme')
  })

  it.each(['builtin', 'custom'] as const)(
    'defers pending %s filters until the tab is reactivated',
    async (source) => {
      vi.useFakeTimers()
      listCustomIconSetsMock.mockResolvedValue(customIconSetsResponse)
      listCustomIconsMock.mockResolvedValue(customIconsResponse)
      const { wrapper } = await mountIconSetsPage()
      await flushPromises()
      if (source === 'custom') {
        await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
        await flushPromises()
      }
      const listSets = source === 'builtin' ? listBuiltinIconSetsMock : listCustomIconSetsMock
      const listIcons = source === 'builtin' ? listBuiltinIconsMock : listCustomIconsMock
      const setCalls = listSets.mock.calls.length
      const iconCalls = listIcons.mock.calls.length

      await wrapper.get(`[data-test="${source}-icon-set-filter"] input`).setValue('icons')
      await wrapper.get(`[data-test="${source}-icon-filter"] input`).setValue('用户')
      const otherSource = source === 'builtin' ? 'custom' : 'builtin'
      await wrapper.get(`[data-test="icon-sets-tab-${otherSource}"]`).trigger('click')
      await vi.advanceTimersByTimeAsync(250)
      await flushPromises()

      expect(listSets).toHaveBeenCalledTimes(setCalls)
      expect(listIcons).toHaveBeenCalledTimes(iconCalls)

      await wrapper.get(`[data-test="icon-sets-tab-${source}"]`).trigger('click')
      await flushPromises()

      expect(listSets).toHaveBeenLastCalledWith({ keyword: 'icons' })
      expect(listIcons).toHaveBeenLastCalledWith({
        cursor: undefined,
        pageSize: 80,
        keyword: '用户',
      })
      expect(
        wrapper.get<HTMLInputElement>(`[data-test="${source}-icon-set-filter"] input`).element
          .value,
      ).toBe('icons')
      expect(
        wrapper.get<HTMLInputElement>(`[data-test="${source}-icon-filter"] input`).element.value,
      ).toBe('用户')
    },
  )

  it('loads the next built-in icon page when the icon grid scrolls near the bottom', async () => {
    listBuiltinIconsMock
      .mockResolvedValueOnce({
        ...builtinIconsResponse,
        nextCursor: 'lucide:sun',
      })
      .mockResolvedValueOnce({
        ...builtinIconsResponse,
        list: [
          {
            icon: 'lucide:moon',
            prefix: 'lucide',
            name: 'moon',
            setName: 'Lucide',
            body: '<path d="M12 3a9 9 0 1 0 9 9" />',
            width: 24,
            height: 24,
          },
        ],
        nextCursor: null,
      })

    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    const scrollPanel = wrapper.get('[data-test="builtin-icon-scroll"] .n-scrollbar-container')
    setElementScrollMetrics(scrollPanel.element, {
      scrollTop: 900,
      clientHeight: 300,
      scrollHeight: 1100,
    })

    await scrollPanel.trigger('scroll')
    await flushPromises()

    expect(listBuiltinIconsMock).toHaveBeenLastCalledWith({
      cursor: 'lucide:sun',
      pageSize: 80,
    })
    expect(wrapper.get('[data-test="icon-grid-item"]').text()).toContain('sun')
    expect(wrapper.text()).toContain('moon')
  })

  it('preserves loaded pages when only the normalized query spelling changes', async () => {
    vi.useFakeTimers()
    const secondPage = {
      ...builtinIconsResponse,
      list: [{ ...builtinIconsResponse.list[0]!, icon: 'lucide:moon', name: 'moon' }],
      nextCursor: null,
    }
    listBuiltinIconsMock.mockImplementation(({ keyword, cursor }) =>
      Promise.resolve(
        cursor === 'next-page'
          ? secondPage
          : { ...builtinIconsResponse, nextCursor: keyword === undefined ? null : 'next-page' },
      ),
    )
    const { wrapper } = await mountIconSetsPage()
    await flushPromises()
    const input = wrapper.get('[data-test="builtin-icon-filter"] input')
    await input.setValue('ＳＵＮ  moon')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    const scrollPanel = wrapper.get('[data-test="builtin-icon-scroll"] .n-scrollbar-container')
    setElementScrollMetrics(scrollPanel.element, {
      scrollTop: 900,
      clientHeight: 300,
      scrollHeight: 1100,
    })
    await scrollPanel.trigger('scroll')
    await flushPromises()
    expect(wrapper.text()).toContain('moon')
    const previousCalls = listBuiltinIconsMock.mock.calls.length

    await input.setValue('sun moon')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    expect(listBuiltinIconsMock).toHaveBeenCalledTimes(previousCalls)
    expect(wrapper.text()).toContain('sun')
    expect(wrapper.text()).toContain('moon')
    expect(wrapper.get('[data-test="builtin-icon-scroll"] .n-scrollbar-container').element).toBe(
      scrollPanel.element,
    )
  })

  it.each(['keyword', 'prefix', 'tab'] as const)(
    'reuses cached pages when returning after changing %s',
    async (filter) => {
      vi.useFakeTimers()
      const secondPage = {
        ...builtinIconsResponse,
        list: [{ ...builtinIconsResponse.list[0]!, icon: 'lucide:moon', name: 'moon' }],
        nextCursor: null,
      }
      const filteredPage = {
        ...builtinIconsResponse,
        list: [{ ...builtinIconsResponse.list[0]!, icon: 'lucide:search', name: 'search' }],
        nextCursor: null,
      }
      listBuiltinIconsMock.mockImplementation(({ keyword, prefix, cursor }) => {
        if (keyword === 'search' || prefix === 'lucide') return Promise.resolve(filteredPage)
        if (cursor === 'next-page') return Promise.resolve(secondPage)
        return Promise.resolve({ ...builtinIconsResponse, nextCursor: 'next-page' })
      })
      const { wrapper } = await mountIconSetsPage()
      await flushPromises()

      const scrollPanel = wrapper.get('[data-test="builtin-icon-scroll"] .n-scrollbar-container')
      setElementScrollMetrics(scrollPanel.element, {
        scrollTop: 900,
        clientHeight: 300,
        scrollHeight: 1100,
      })
      await scrollPanel.trigger('scroll')
      await flushPromises()
      expect(wrapper.text()).toContain('moon')

      if (filter === 'keyword') {
        await wrapper.get('[data-test="builtin-icon-filter"] input').setValue('search')
        await vi.advanceTimersByTimeAsync(250)
      } else if (filter === 'prefix') {
        await wrapper.get('[data-test="builtin-icon-set"]').trigger('click')
      } else {
        await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
      }
      await flushPromises()
      if (filter !== 'tab') {
        expect(wrapper.get('[data-test="builtin-icon-scroll"]').text()).toContain('search')
      } else {
        expect(listCustomIconsMock).toHaveBeenCalledOnce()
      }
      const previousCalls = listBuiltinIconsMock.mock.calls.length

      if (filter === 'keyword') {
        await wrapper.get('[data-test="builtin-icon-filter"] input').setValue('')
      } else if (filter === 'prefix') {
        await wrapper.get('[data-test="builtin-icon-set-all"]').trigger('click')
      } else {
        await wrapper.get('[data-test="icon-sets-tab-builtin"]').trigger('click')
      }
      await flushPromises()

      expect(listBuiltinIconsMock).toHaveBeenCalledTimes(previousCalls)
      expect(wrapper.get('[data-test="builtin-icon-scroll"]').text()).toContain('sun')
      expect(wrapper.get('[data-test="builtin-icon-scroll"]').text()).toContain('moon')
    },
  )

  it('recovers a library search after repeated preparing responses and clears to browsing', async () => {
    vi.useFakeTimers()
    const preparingError = new ApiRequestError(503, '正在准备', undefined, 'ICON_SEARCH_PREPARING')
    const readyPage = {
      ...builtinIconsResponse,
      list: [{ ...builtinIconsResponse.list[0]!, icon: 'lucide:users', name: 'users' }],
      nextCursor: null,
    }
    let userSearchCalls = 0
    let browseCalls = 0
    let pendingSearchCalls = 0
    listBuiltinIconsMock.mockImplementation(({ keyword }) => {
      if (keyword === '用户') {
        userSearchCalls += 1
        return userSearchCalls < 3 ? Promise.reject(preparingError) : Promise.resolve(readyPage)
      }
      if (keyword === '等待') {
        pendingSearchCalls += 1
        return Promise.reject(preparingError)
      }

      browseCalls += 1
      return Promise.resolve(builtinIconsResponse)
    })
    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    await wrapper.get('[data-test="builtin-icon-filter"] input').setValue('用户')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    expect(wrapper.text()).toContain('图标搜索正在准备')

    await vi.advanceTimersByTimeAsync(1_000)
    await flushPromises()
    expect(wrapper.text()).toContain('图标搜索正在准备')
    await vi.advanceTimersByTimeAsync(2_000)
    await flushPromises()
    expect(wrapper.text()).toContain('users')
    expect(userSearchCalls).toBe(3)

    await wrapper.get('[data-test="builtin-icon-filter"] input').setValue('等待')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    expect(wrapper.text()).toContain('图标搜索正在准备')

    await wrapper.get('[data-test="builtin-icon-filter"] input').setValue('')
    await flushPromises()
    expect(wrapper.text()).toContain('sun')
    expect(wrapper.text()).not.toContain('图标搜索正在准备')
    expect(browseCalls).toBe(1)

    await vi.advanceTimersByTimeAsync(2_000)
    await flushPromises()
    expect(pendingSearchCalls).toBe(1)
  })

  it('pauses preparing retries while the tab is inactive and resumes on activation', async () => {
    vi.useFakeTimers()
    const preparingError = new ApiRequestError(503, '正在准备', undefined, 'ICON_SEARCH_PREPARING')
    listBuiltinIconsMock.mockImplementation(({ keyword }) =>
      keyword ? Promise.reject(preparingError) : Promise.resolve(builtinIconsResponse),
    )
    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    await wrapper.get('[data-test="builtin-icon-filter"] input').setValue('用户')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    expect(wrapper.text()).toContain('图标搜索正在准备')
    await vi.advanceTimersByTimeAsync(1_000)
    await flushPromises()
    const callsBeforeLeaving = listBuiltinIconsMock.mock.calls.length
    expect(callsBeforeLeaving).toBe(3)

    await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(10_000)
    await flushPromises()
    expect(listBuiltinIconsMock).toHaveBeenCalledTimes(callsBeforeLeaving)

    await wrapper.get('[data-test="icon-sets-tab-builtin"]').trigger('click')
    await flushPromises()
    expect(listBuiltinIconsMock).toHaveBeenCalledTimes(callsBeforeLeaving + 1)
    expect(wrapper.text()).toContain('图标搜索正在准备')
    expect(
      wrapper.get<HTMLInputElement>('[data-test="builtin-icon-filter"] input').element.value,
    ).toBe('用户')

    await vi.advanceTimersByTimeAsync(1_000)
    await flushPromises()
    expect(listBuiltinIconsMock).toHaveBeenCalledTimes(callsBeforeLeaving + 2)
  })

  it.each(['builtin', 'custom'] as const)(
    'retries an unavailable %s search on demand',
    async (source) => {
      vi.useFakeTimers()
      const unavailable = new ApiRequestError(503, '暂不可用', undefined, 'ICON_SEARCH_UNAVAILABLE')
      listBuiltinIconsMock.mockImplementation(({ keyword }) =>
        keyword ? Promise.reject(unavailable) : Promise.resolve(builtinIconsResponse),
      )
      listCustomIconsMock.mockImplementation(({ keyword }) =>
        keyword ? Promise.reject(unavailable) : Promise.resolve(emptyCustomIconsResponse),
      )
      const { wrapper } = await mountIconSetsPage()
      await flushPromises()
      await wrapper.get(`[data-test="icon-sets-tab-${source}"]`).trigger('click')
      await flushPromises()
      await wrapper.get(`[data-test="${source}-icon-filter"] input`).setValue('用户')
      await vi.advanceTimersByTimeAsync(250)
      await flushPromises()
      expect(wrapper.text()).toContain('图标搜索暂不可用')

      listBuiltinIconsMock.mockResolvedValueOnce({ ...builtinIconsResponse, nextCursor: null })
      listCustomIconsMock.mockResolvedValueOnce(customIconsResponse)
      await wrapper
        .findAll('button')
        .find((button) => button.text() === '重试')!
        .trigger('click')
      await flushPromises()
      expect(
        source === 'builtin' ? listBuiltinIconsMock : listCustomIconsMock,
      ).toHaveBeenLastCalledWith({
        cursor: undefined,
        pageSize: 80,
        keyword: '用户',
      })
      expect(wrapper.text()).not.toContain('图标搜索暂不可用')
      expect(wrapper.findAll('[data-test="icon-grid-item"]').length).toBeGreaterThan(0)
    },
  )

  it('hides custom icon edit and delete actions without update or delete permission', async () => {
    listCustomIconSetsMock.mockResolvedValue(customIconSetsResponse)
    listCustomIconsMock.mockResolvedValue(customIconsResponse)
    const { wrapper } = await mountIconSetsPage({
      ...authSession,
      accessCodes: ['content:icon-set:list', 'content:icon-set:create'],
    })
    await flushPromises()

    await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('button[aria-label="复制图标名称"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="复制 SVG"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="编辑图标"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="删除图标"]').exists()).toBe(false)
  })

  it('refreshes loaded pages after editing a custom icon name and keywords', async () => {
    const renamedIcon = {
      ...customIconsResponse.list[0]!,
      icon: 'acme:mark',
      name: 'mark',
    }
    const secondPage = {
      ...customIconsResponse,
      list: [{ ...customIconsResponse.list[0]!, icon: 'acme:wordmark', name: 'wordmark' }],
    }
    listCustomIconSetsMock.mockResolvedValue(customIconSetsResponse)
    listCustomIconsMock
      .mockResolvedValueOnce({ ...customIconsResponse, nextCursor: 'after-logo' })
      .mockResolvedValueOnce(secondPage)
      .mockResolvedValueOnce({
        ...customIconsResponse,
        list: [renamedIcon],
        nextCursor: 'after-mark',
      })
      .mockResolvedValueOnce(secondPage)
    updateCustomIconMock.mockResolvedValue(renamedIcon)
    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
    await flushPromises()
    const scrollPanel = wrapper.get('[data-test="custom-icon-scroll"] .n-scrollbar-container')
    setElementScrollMetrics(scrollPanel.element, {
      scrollTop: 900,
      clientHeight: 300,
      scrollHeight: 1100,
    })
    await scrollPanel.trigger('scroll')
    await flushPromises()
    expect(wrapper.text()).toContain('wordmark')

    await wrapper.get('button[aria-label="编辑图标"]').trigger('click')
    await flushPromises()

    await setIconName('  mark  ')
    wrapper
      .findComponent(IconKeywordsInput)
      .vm.$emit('update:modelValue', ['  品牌  ', 'brand', 'BRAND'])
    await flushPromises()
    getBodyButton('保存').click()
    await flushPromises()

    expect(updateCustomIconMock).toHaveBeenCalledWith('acme', 'logo', {
      name: 'mark',
      keywords: ['品牌', 'brand'],
    })
    expect(document.body.textContent).toContain('编辑图标成功')
    expect(
      wrapper
        .findAll('[data-test="custom-icon-scroll"] [data-test="icon-grid-name"]')
        .map((name) => name.text()),
    ).toEqual(['mark', 'wordmark'])
    expect(listCustomIconsMock).toHaveBeenCalledTimes(4)
    expect(listCustomIconsMock).toHaveBeenLastCalledWith({ cursor: 'after-mark', pageSize: 80 })
    expect(listCustomIconSetsMock).toHaveBeenCalledTimes(2)
  })

  it('submits an explicit empty keyword list without changing the icon id', async () => {
    const iconWithKeywords = {
      ...customIconsResponse.list[0]!,
      keywords: ['品牌'],
    }
    listCustomIconSetsMock.mockResolvedValue(customIconSetsResponse)
    listCustomIconsMock.mockResolvedValue({ ...customIconsResponse, list: [iconWithKeywords] })
    updateCustomIconMock.mockResolvedValue({ ...iconWithKeywords, keywords: [] })
    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
    await flushPromises()
    await wrapper.get('button[aria-label="编辑图标"]').trigger('click')
    await flushPromises()

    expect(wrapper.findComponent(IconKeywordsInput).props('modelValue')).toEqual(['品牌'])
    getBodyButton('清空关键词').click()
    await flushPromises()
    getBodyButton('保存').click()
    await flushPromises()

    expect(updateCustomIconMock).toHaveBeenCalledWith('acme', 'logo', {
      name: 'logo',
      keywords: [],
    })
  })

  it('keeps a successful icon edit successful when active cache refresh returns preparing', async () => {
    listCustomIconSetsMock.mockResolvedValue(customIconSetsResponse)
    listCustomIconsMock
      .mockResolvedValueOnce(customIconsResponse)
      .mockRejectedValue(new ApiRequestError(503, '正在准备', undefined, 'ICON_SEARCH_PREPARING'))
    updateCustomIconMock.mockResolvedValue(customIconsResponse.list[0]!)
    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
    await flushPromises()
    await wrapper.get('button[aria-label="编辑图标"]').trigger('click')
    await flushPromises()
    getBodyButton('保存').click()
    await flushPromises()

    expect(updateCustomIconMock).toHaveBeenCalledOnce()
    expect(document.body.textContent).toContain('编辑图标成功')
    expect(document.body.textContent).not.toContain('编辑图标失败')
  })

  it('shows icon validation feedback under each field and clears it after correction', async () => {
    listCustomIconSetsMock.mockResolvedValue(customIconSetsResponse)
    listCustomIconsMock.mockResolvedValue(customIconsResponse)
    updateCustomIconMock.mockResolvedValue(customIconsResponse.list[0]!)
    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
    await flushPromises()
    await wrapper.get('button[aria-label="编辑图标"]').trigger('click')
    await flushPromises()

    await setIconName('invalid name')
    const keywords = wrapper.findComponent(IconKeywordsInput)
    keywords.vm.$emit('update:modelValue', ['!!!'])
    await flushPromises()
    getBodyButton('保存').click()
    await flushPromises()

    const nameItem = getIconNameInput().closest('.n-form-item')!
    const keywordsItem = keywords.element.closest('.n-form-item')!
    expect(nameItem.textContent).toContain('图标名称无效')
    expect(keywordsItem.textContent).toContain('关键词必须包含文字或数字')
    expect(updateCustomIconMock).not.toHaveBeenCalled()

    await setIconName('mark')
    keywords.vm.$emit('update:modelValue', ['品牌'])
    await flushPromises()
    expect(nameItem.textContent).not.toContain('图标名称无效')
    expect(keywordsItem.textContent).not.toContain('关键词必须包含文字或数字')

    getBodyButton('保存').click()
    await flushPromises()
    expect(updateCustomIconMock).toHaveBeenCalledWith('acme', 'logo', {
      name: 'mark',
      keywords: ['品牌'],
    })
  })

  it.each([
    { error: new ApiRequestError(409, '图标名称已存在', 'name'), isFieldError: true },
    { error: new Error('保存失败，请重试'), isFieldError: false },
  ])('keeps icon edits and allows retry after $error.message', async ({ error, isFieldError }) => {
    listCustomIconSetsMock.mockResolvedValue(customIconSetsResponse)
    listCustomIconsMock.mockResolvedValue(customIconsResponse)
    updateCustomIconMock
      .mockRejectedValueOnce(error)
      .mockResolvedValue(customIconsResponse.list[0]!)
    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
    await flushPromises()
    await wrapper.get('button[aria-label="编辑图标"]').trigger('click')
    await flushPromises()
    await setIconName('mark')
    getBodyButton('保存').click()
    await flushPromises()

    expect(getIconNameInput().value).toBe('mark')
    const errorArea = isFieldError
      ? getIconNameInput().closest('.n-form-item')
      : document.body.querySelector('.n-drawer .n-alert')
    expect(errorArea?.textContent).toContain(error.message)

    await setIconName('new-mark')
    getBodyButton('保存').click()
    await flushPromises()
    expect(updateCustomIconMock).toHaveBeenLastCalledWith('acme', 'logo', {
      name: 'new-mark',
      keywords: [],
    })
    expect(document.body.textContent).toContain('编辑图标成功')
  })

  it('confirms discarding icon edits and restores saved values when reopened', async () => {
    const icon = { ...customIconsResponse.list[0]!, keywords: ['品牌'] }
    listCustomIconSetsMock.mockResolvedValue(customIconSetsResponse)
    listCustomIconsMock.mockResolvedValue({ ...customIconsResponse, list: [icon] })
    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
    await flushPromises()
    await wrapper.get('button[aria-label="编辑图标"]').trigger('click')
    await vi.waitFor(getIconNameInput)

    getBodyButton('取消').click()
    await flushPromises()
    expect(document.body.textContent).not.toContain('放弃未保存的更改？')

    await wrapper.get('button[aria-label="编辑图标"]').trigger('click')
    await flushPromises()
    await setIconName('draft-name')
    getBodyButton('清空关键词').click()
    await flushPromises()
    getBodyButton('取消').click()
    await flushPromises()
    expect(document.body.textContent).toContain('放弃未保存的更改？')
    getDialogButton('unsaved-changes-discard-cancel').click()
    await flushPromises()
    expect(getIconNameInput().value).toBe('draft-name')
    expect(wrapper.findComponent(IconKeywordsInput).props('modelValue')).toEqual([])

    getBodyButton('取消').click()
    await flushPromises()
    const discardButton = new DOMWrapper(document.body)
      .findAll('[data-test="unsaved-changes-discard-confirm"]')
      .find((button) => button.isVisible())
    expect(discardButton).toBeDefined()
    await discardButton!.trigger('click')
    await flushPromises()
    expect(wrapper.getComponent({ name: 'IconFormDrawer' }).props('show')).toBe(false)
    await wrapper.get('button[aria-label="编辑图标"]').trigger('click')
    await flushPromises()
    expect(getIconNameInput().value).toBe(icon.name)
    expect(wrapper.findComponent(IconKeywordsInput).props('modelValue')).toEqual(icon.keywords)
    expect(updateCustomIconMock).not.toHaveBeenCalled()
  })

  it.each(['success', 'error'] as const)(
    'keeps saving icon edits open until the %s result is delivered',
    async (result) => {
      const pendingEdit = createDeferred<CustomIconListResponse['list'][number]>()
      listCustomIconSetsMock.mockResolvedValue(customIconSetsResponse)
      listCustomIconsMock.mockResolvedValue(customIconsResponse)
      updateCustomIconMock.mockImplementationOnce(() => pendingEdit.promise)
      const { wrapper } = await mountIconSetsPage()
      await flushPromises()

      await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
      await flushPromises()
      await wrapper.get('button[aria-label="编辑图标"]').trigger('click')
      await vi.waitFor(getIconNameInput)
      await setIconName('draft-name')
      getBodyButton('保存').click()
      await flushPromises()

      const cancelButton = getBodyButton('取消')
      expect(cancelButton.disabled).toBe(true)
      cancelButton.click()
      await flushPromises()
      expect(wrapper.getComponent({ name: 'IconFormDrawer' }).props('show')).toBe(true)
      expect(getIconNameInput().value).toBe('draft-name')

      if (result === 'success') {
        pendingEdit.resolve(customIconsResponse.list[0]!)
      } else {
        pendingEdit.reject(new ApiRequestError(409, '图标名称已存在', 'name'))
      }
      await flushPromises()

      if (result === 'success') {
        expect(document.body.textContent).toContain('编辑图标成功')
        expect(wrapper.getComponent({ name: 'IconFormDrawer' }).props('show')).toBe(false)
      } else {
        expect(document.body.textContent).toContain('图标名称已存在')
        expect(getIconNameInput().value).toBe('draft-name')
        expect(wrapper.getComponent({ name: 'IconFormDrawer' }).props('show')).toBe(true)
        expect(getBodyButton('取消').disabled).toBe(false)
        expect(document.body.textContent).not.toContain('编辑图标成功')
      }
    },
  )

  it('keeps ordinary pagination errors without resetting to the first page', async () => {
    listBuiltinIconsMock
      .mockResolvedValueOnce({ ...builtinIconsResponse, nextCursor: 'next-page' })
      .mockRejectedValueOnce(new Error('下一页加载失败'))
    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    const scrollPanel = wrapper.get('[data-test="builtin-icon-scroll"] .n-scrollbar-container')
    setElementScrollMetrics(scrollPanel.element, {
      scrollTop: 900,
      clientHeight: 300,
      scrollHeight: 1100,
    })
    await scrollPanel.trigger('scroll')
    await flushPromises()

    expect(listBuiltinIconsMock).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('下一页加载失败')
    expect(wrapper.text()).toContain('sun')
  })

  it.each(['builtin', 'custom'] as const)(
    'retries failed %s collection and icon requests',
    async (source) => {
      const listSets = source === 'builtin' ? listBuiltinIconSetsMock : listCustomIconSetsMock
      const listIcons = source === 'builtin' ? listBuiltinIconsMock : listCustomIconsMock
      listSets.mockRejectedValueOnce(new Error('图标集请求失败'))
      listIcons.mockRejectedValueOnce(new Error('图标请求失败'))
      if (source === 'custom') {
        listCustomIconSetsMock.mockResolvedValue(customIconSetsResponse)
        listCustomIconsMock.mockResolvedValue(customIconsResponse)
      }
      const { wrapper } = await mountIconSetsPage()
      await flushPromises()
      if (source === 'custom') {
        await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
        await flushPromises()
      }
      expect(wrapper.text()).toContain('图标集请求失败')
      expect(wrapper.text()).toContain('图标请求失败')

      const retryButtons = wrapper.findAll('button').filter((button) => button.text() === '重试')
      expect(retryButtons).toHaveLength(2)
      await retryButtons[0]!.trigger('click')
      await flushPromises()
      expect(wrapper.text()).not.toContain('图标集请求失败')
      expect(listSets).toHaveBeenCalledTimes(2)
      await wrapper
        .findAll('button')
        .find((button) => button.text() === '重试')!
        .trigger('click')
      await flushPromises()
      expect(wrapper.text()).not.toContain('图标请求失败')
      expect(listIcons).toHaveBeenCalledTimes(2)
      expect(wrapper.text()).toContain(source === 'builtin' ? 'sun' : 'logo')
    },
  )

  it('reports clipboard failures without interrupting icon browsing', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('Permission denied'))
    const { wrapper } = await mountIconSetsPage()
    await flushPromises()
    await wrapper.get('button[aria-label="复制图标名称"]').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('复制失败，请重试')
    expect(wrapper.get('[data-test="icon-grid-name"]').text()).toBe('sun')
  })

  it('resets an invalid next-page cursor and refetches only the first page', async () => {
    listBuiltinIconsMock
      .mockResolvedValueOnce({ ...builtinIconsResponse, nextCursor: 'stale-cursor' })
      .mockRejectedValueOnce(
        new ApiRequestError(400, '分页游标无效', undefined, 'INVALID_ICON_CURSOR'),
      )
      .mockResolvedValueOnce({
        ...builtinIconsResponse,
        list: [{ ...builtinIconsResponse.list[0]!, icon: 'lucide:moon', name: 'moon' }],
      })
    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    const scrollPanel = wrapper.get('[data-test="builtin-icon-scroll"] .n-scrollbar-container')
    setElementScrollMetrics(scrollPanel.element, {
      scrollTop: 900,
      clientHeight: 300,
      scrollHeight: 1100,
    })
    await scrollPanel.trigger('scroll')
    await flushPromises()

    await vi.waitFor(() => expect(listBuiltinIconsMock).toHaveBeenCalledTimes(3))
    expect(listBuiltinIconsMock).toHaveBeenLastCalledWith({ cursor: undefined, pageSize: 80 })
    expect(wrapper.text()).toContain('moon')
    expect(wrapper.text()).not.toContain('sun')
  })

  it('keeps icon set deletion available after failure and refreshes after success', async () => {
    listCustomIconSetsMock
      .mockResolvedValueOnce(customIconSetsResponse)
      .mockResolvedValue(emptyCustomIconSetsResponse)
    listCustomIconsMock.mockResolvedValue(customIconsResponse)
    deleteCustomIconSetMock
      .mockRejectedValueOnce(new Error('删除请求失败'))
      .mockResolvedValueOnce(undefined)
    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="custom-icon-set"]').trigger('click')
    await flushPromises()
    await wrapper.get('button[aria-label="删除图标集"]').trigger('click')
    await flushPromises()

    expect(document.body.textContent).toContain('确定删除自定义图标集“Acme Icons”吗？')
    getBodyButton('删除').click()
    await flushPromises()

    expect(deleteCustomIconSetMock).toHaveBeenCalledOnce()
    expect(document.body.textContent).toContain('删除请求失败')
    expect(
      document.body.querySelector('[data-test="custom-icon-set-delete-confirm"]'),
    ).not.toBeNull()

    getBodyButton('删除').click()
    await flushPromises()

    expect(deleteCustomIconSetMock).toHaveBeenCalledTimes(2)
    expect(deleteCustomIconSetMock).toHaveBeenLastCalledWith('acme')
    expect(document.body.textContent).toContain('删除图标集成功')
    expect(wrapper.find('[data-test="custom-icon-set"]').exists()).toBe(false)
    expect(listCustomIconSetsMock).toHaveBeenCalledTimes(2)
  })

  it('downloads custom icon set export through authenticated request', async () => {
    listCustomIconSetsMock.mockResolvedValue(customIconSetsResponse)
    listCustomIconsMock.mockResolvedValue(customIconsResponse)

    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="custom-icon-set"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="custom-icon-set-export"]').trigger('click')
    await flushPromises()

    expect(exportCustomIconSetMock).toHaveBeenCalledWith('acme')
    expect(saveFileMock).toHaveBeenCalledWith(expect.any(Blob), 'acme.json')
  })
})
