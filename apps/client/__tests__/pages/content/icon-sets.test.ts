import { flushPromises } from '@vue/test-utils'
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
import IconKeywordsInput from '../../../src/features/icons/IconKeywordsInput.vue'
import { saveFile } from '../../../src/utils/download'
import { ApiRequestError } from '../../../src/utils/request'
import { mountAuthRoute, session, stubPreferredDark } from '../../helpers/auth'
import { createDeferred } from '../../helpers/promise'

vi.mock('../../../src/features/icons/IconSetFormDrawer.vue', () => ({
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

vi.mock('../../../src/features/icons/IconUploadDrawer.vue', () => ({
  default: {
    name: 'IconUploadDrawerStub',
    props: ['show', 'prefix'],
    emits: ['update:show', 'uploaded'],
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
    await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
    await flushPromises()

    expect(
      wrapper.find<HTMLInputElement>('[data-test="custom-icon-filter"] input').element.value,
    ).toBe('logo')

    await wrapper.get('[data-test="custom-icon-set-upload"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="icon-upload-drawer"]').attributes('data-prefix')).toBe('acme')
  })

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

  it('drops cached extra pages when returning to an earlier search combination', async () => {
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
    const refreshedFirstPage = {
      ...builtinIconsResponse,
      list: [{ ...builtinIconsResponse.list[0]!, icon: 'lucide:star', name: 'star' }],
      nextCursor: null,
    }
    let emptyFirstPageCalls = 0
    listBuiltinIconsMock.mockImplementation(({ keyword, cursor }) => {
      if (keyword === 'search') return Promise.resolve(filteredPage)
      if (cursor === 'next-page') return Promise.resolve(secondPage)

      emptyFirstPageCalls += 1
      return Promise.resolve(
        emptyFirstPageCalls === 1
          ? { ...builtinIconsResponse, nextCursor: 'next-page' }
          : refreshedFirstPage,
      )
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

    await wrapper.get('[data-test="builtin-icon-filter"] input').setValue('search')
    await vi.waitFor(() => expect(wrapper.text()).toContain('search'))
    await wrapper.get('[data-test="builtin-icon-filter"] input').setValue('')
    await vi.waitFor(() => expect(wrapper.text()).toContain('star'))

    expect(wrapper.text()).not.toContain('sun')
    expect(wrapper.text()).not.toContain('moon')
    expect(emptyFirstPageCalls).toBe(2)
  })

  it('drops cached extra pages when returning from a prefix to the all-icons view', async () => {
    const secondPage = {
      ...builtinIconsResponse,
      list: [{ ...builtinIconsResponse.list[0]!, icon: 'tabler:moon', name: 'moon' }],
      nextCursor: null,
    }
    const prefixPage = {
      ...builtinIconsResponse,
      list: [{ ...builtinIconsResponse.list[0]!, icon: 'lucide:search', name: 'search' }],
      nextCursor: null,
    }
    const refreshedAllPage = {
      ...builtinIconsResponse,
      list: [{ ...builtinIconsResponse.list[0]!, icon: 'lucide:star', name: 'star' }],
      nextCursor: null,
    }
    let allFirstPageCalls = 0
    listBuiltinIconsMock.mockImplementation(({ prefix, cursor }) => {
      if (prefix === 'lucide') return Promise.resolve(prefixPage)
      if (cursor === 'all-next-page') return Promise.resolve(secondPage)

      allFirstPageCalls += 1
      return Promise.resolve(
        allFirstPageCalls === 1
          ? { ...builtinIconsResponse, nextCursor: 'all-next-page' }
          : refreshedAllPage,
      )
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

    await wrapper.get('[data-test="builtin-icon-set"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('search'))
    expect(listBuiltinIconsMock).toHaveBeenLastCalledWith({
      cursor: undefined,
      pageSize: 80,
      prefix: 'lucide',
    })

    await wrapper.get('[data-test="builtin-icon-set-all"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('star'))

    expect(listBuiltinIconsMock).toHaveBeenLastCalledWith({ cursor: undefined, pageSize: 80 })
    expect(wrapper.text()).not.toContain('sun')
    expect(wrapper.text()).not.toContain('moon')
    expect(allFirstPageCalls).toBe(2)
  })

  it('drops cached extra pages when returning to the built-in tab', async () => {
    const secondPage = {
      ...builtinIconsResponse,
      list: [{ ...builtinIconsResponse.list[0]!, icon: 'lucide:moon', name: 'moon' }],
      nextCursor: null,
    }
    const refreshedFirstPage = {
      ...builtinIconsResponse,
      list: [{ ...builtinIconsResponse.list[0]!, icon: 'lucide:star', name: 'star' }],
      nextCursor: null,
    }
    let firstPageCalls = 0
    listBuiltinIconsMock.mockImplementation(({ cursor }) => {
      if (cursor === 'next-page') return Promise.resolve(secondPage)

      firstPageCalls += 1
      return Promise.resolve(
        firstPageCalls === 1
          ? { ...builtinIconsResponse, nextCursor: 'next-page' }
          : refreshedFirstPage,
      )
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

    await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="icon-sets-tab-builtin"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('star'))

    expect(listBuiltinIconsMock).toHaveBeenLastCalledWith({ cursor: undefined, pageSize: 80 })
    expect(wrapper.text()).not.toContain('sun')
    expect(wrapper.text()).not.toContain('moon')
    expect(firstPageCalls).toBe(2)
  })

  it('recovers a library search after repeated preparing responses and clears to browsing', async () => {
    vi.useFakeTimers()
    const preparingError = new ApiRequestError(503, '正在准备', undefined, 'ICON_SEARCH_PREPARING')
    const readyPage = {
      ...builtinIconsResponse,
      list: [{ ...builtinIconsResponse.list[0]!, icon: 'lucide:users', name: 'users' }],
      nextCursor: null,
    }
    const refreshedBrowsePage = {
      ...builtinIconsResponse,
      list: [{ ...builtinIconsResponse.list[0]!, icon: 'lucide:star', name: 'star' }],
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
      return Promise.resolve(browseCalls === 1 ? builtinIconsResponse : refreshedBrowsePage)
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
    await vi.advanceTimersByTimeAsync(1_000)
    await flushPromises()
    expect(wrapper.text()).toContain('users')
    expect(userSearchCalls).toBe(3)

    await wrapper.get('[data-test="builtin-icon-filter"] input').setValue('等待')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    expect(wrapper.text()).toContain('图标搜索正在准备')

    await wrapper.get('[data-test="builtin-icon-filter"] input').setValue('')
    await flushPromises()
    expect(wrapper.text()).toContain('star')
    expect(listBuiltinIconsMock).toHaveBeenLastCalledWith({ cursor: undefined, pageSize: 80 })

    await vi.advanceTimersByTimeAsync(2_000)
    await flushPromises()
    expect(pendingSearchCalls).toBe(1)
  })

  it('hides custom icon rename and delete actions without update or delete permission', async () => {
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

  it('edits a custom icon name and keywords and renders the refreshed icon list', async () => {
    const renamedIcon = {
      ...customIconsResponse.list[0]!,
      icon: 'acme:mark',
      name: 'mark',
    }
    listCustomIconSetsMock.mockResolvedValue(customIconSetsResponse)
    listCustomIconsMock
      .mockResolvedValueOnce(customIconsResponse)
      .mockResolvedValue({ ...customIconsResponse, list: [renamedIcon] })
    updateCustomIconMock.mockResolvedValue(renamedIcon)
    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
    await flushPromises()
    await wrapper.get('button[aria-label="编辑图标"]').trigger('click')
    await flushPromises()

    const input = document.body.querySelector(
      'input[placeholder="请输入图标名称"]',
    ) as HTMLInputElement | null
    expect(input).not.toBeNull()
    input!.value = '  mark  '
    input!.dispatchEvent(new Event('input', { bubbles: true }))
    wrapper.findComponent(IconKeywordsInput).vm.$emit('update:modelValue', ['  品牌  ', 'brand'])
    await flushPromises()
    getBodyButton('保存').click()
    await flushPromises()

    expect(updateCustomIconMock).toHaveBeenCalledWith('acme', 'logo', {
      name: 'mark',
      keywords: ['品牌', 'brand'],
    })
    expect(document.body.textContent).toContain('编辑图标成功')
    expect(wrapper.text()).toContain('mark')
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
    wrapper.findComponent(IconKeywordsInput).vm.$emit('clear')
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

  it('does not close a newly opened edit modal when an earlier edit succeeds', async () => {
    const pendingEdit = createDeferred<CustomIconListResponse['list'][number]>()
    listCustomIconSetsMock.mockResolvedValue(customIconSetsResponse)
    listCustomIconsMock.mockResolvedValue(customIconsResponse)
    updateCustomIconMock.mockImplementationOnce(() => pendingEdit.promise)
    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
    await flushPromises()
    await wrapper.get('button[aria-label="编辑图标"]').trigger('click')
    await flushPromises()
    getBodyButton('保存').click()
    await flushPromises()

    getBodyButton('取消').click()
    await flushPromises()
    await wrapper.get('button[aria-label="编辑图标"]').trigger('click')
    await flushPromises()
    const input = document.body.querySelector(
      'input[placeholder="请输入图标名称"]',
    ) as HTMLInputElement
    input.value = 'fresh-name'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()

    pendingEdit.resolve(customIconsResponse.list[0]!)
    await flushPromises()

    expect(document.body.querySelector('input[placeholder="请输入图标名称"]')).not.toBeNull()
    expect(input.value).toBe('fresh-name')
    expect(document.body.textContent).not.toContain('编辑图标成功')
  })

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
