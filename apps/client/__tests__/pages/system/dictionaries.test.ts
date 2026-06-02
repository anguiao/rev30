import { useQueryCache } from '@pinia/colada'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NDataTable, NPagination, NSelect } from 'naive-ui'
import {
  DICTIONARY_STATUS_DISABLED,
  DICTIONARY_STATUS_ENABLED,
  type DictionaryListItem,
  type DictionaryListResponse,
} from '@rev30/contracts'
import { defineComponent, h } from 'vue'
import {
  deleteDictionary,
  formatDateTime,
  listDictionaries,
  SystemRequestError,
} from '../../../src/features/system'
import DictionariesPage from '../../../src/pages/index/system/dictionaries.vue'
import {
  disposeActiveTestPinia,
  mountAuthRoute,
  session,
  stubPreferredDark,
} from '../../helpers/auth'
vi.mock('../../../src/features/system/DictionaryFormDrawer.vue', () => ({
  default: defineComponent({
    name: 'DictionaryFormDrawerStub',
    props: {
      show: {
        type: Boolean,
        required: true,
      },
      dictionaryId: {
        type: String,
        default: null,
      },
    },
    emits: ['update:show', 'saved'],
    setup(props) {
      return () =>
        h('div', {
          'data-dictionary-id': props.dictionaryId ?? '',
          'data-show': String(props.show),
          'data-test': 'dictionary-form-drawer',
        })
    },
  }),
}))

vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  deleteDictionary: vi.fn(),
  listDictionaries: vi.fn(),
}))

const deleteDictionaryMock = vi.mocked(deleteDictionary)
const listDictionariesMock = vi.mocked(listDictionaries)

const baseDictionary: DictionaryListItem = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'order_status',
  name: '订单状态',
  description: '订单状态类型',
  itemCount: 3,
  status: DICTIONARY_STATUS_ENABLED,
  sortOrder: 1,
  createdAt: '2026-05-18T01:02:03.000Z',
  updatedAt: '2026-05-18T01:02:03.000Z',
}

const dictionariesResponse: DictionaryListResponse = {
  list: [
    baseDictionary,
    {
      ...baseDictionary,
      id: '22222222-2222-4111-8111-111111111112',
      code: 'user_level',
      name: '用户等级',
      description: null,
      itemCount: 5,
      status: DICTIONARY_STATUS_DISABLED,
      sortOrder: 2,
      updatedAt: '2026-05-19T01:02:03.000Z',
    },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
}

async function mountDictionariesPage(accessCodes: string[] = session.accessCodes) {
  return mountAuthRoute(
    '/system/dictionaries',
    [{ path: '/system/dictionaries', component: DictionariesPage }],
    {
      ...session,
      accessCodes,
    },
  )
}

describe('dictionaries page', () => {
  beforeEach(() => {
    deleteDictionaryMock.mockReset()
    listDictionariesMock.mockReset()
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
    document.body.innerHTML = ''
    stubPreferredDark(false)
  })

  afterEach(() => {
    disposeActiveTestPinia()
    vi.unstubAllGlobals()
  })

  it('loads and renders dictionary list with pagination', async () => {
    listDictionariesMock.mockResolvedValue(dictionariesResponse)
    const { wrapper } = await mountDictionariesPage()
    await flushPromises()

    expect(listDictionariesMock).toHaveBeenCalledWith({ page: 1, pageSize: 20 })
    expect(wrapper.text()).toContain('数据字典')
    expect(wrapper.text()).toContain('共 2 个')
    expect(wrapper.text()).toContain(baseDictionary.code)
    expect(wrapper.text()).toContain(baseDictionary.name)
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain(formatDateTime(baseDictionary.updatedAt))
    expect(wrapper.getComponent(NDataTable).props('pagination')).toBe(false)
    expect(wrapper.findComponent(NPagination).exists()).toBe(true)
  })

  it('filters by keyword and status, and reset avoids duplicate requests', async () => {
    listDictionariesMock.mockResolvedValue(dictionariesResponse)
    const { wrapper } = await mountDictionariesPage()
    await flushPromises()

    await wrapper.find('[data-test="dictionaries-keyword"] input').setValue('  order  ')
    wrapper
      .get('[data-test="dictionaries-status"]')
      .getComponent(NSelect)
      .vm.$emit('update:value', DICTIONARY_STATUS_DISABLED)
    await flushPromises()
    await wrapper.get('[data-test="dictionaries-search"]').trigger('click')
    await flushPromises()
    const callCountAfterSearch = listDictionariesMock.mock.calls.length

    expect(listDictionariesMock).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 20,
      keyword: 'order',
      status: DICTIONARY_STATUS_DISABLED,
    })

    const queryCache = useQueryCache()
    const initialQueryEntry = queryCache.get(['system', 'dictionaries', 'list', 1, 20, '', null])
    if (initialQueryEntry !== undefined) {
      queryCache.remove(initialQueryEntry)
    }

    await wrapper.get('[data-test="dictionaries-reset"]').trigger('click')
    await flushPromises()
    await vi.waitFor(() => {
      expect(listDictionariesMock.mock.calls.length).toBe(callCountAfterSearch + 1)
    })
    expect(listDictionariesMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 })

    expect(
      (wrapper.get('[data-test="dictionaries-keyword"] input').element as HTMLInputElement).value,
    ).toBe('')
    expect(
      wrapper.get('[data-test="dictionaries-status"]').getComponent(NSelect).props('value'),
    ).toBe('all')

    const callCountAfterFirstReset = listDictionariesMock.mock.calls.length
    await wrapper.get('[data-test="dictionaries-reset"]').trigger('click')
    await flushPromises()

    expect(listDictionariesMock.mock.calls.length).toBe(callCountAfterFirstReset)
  })

  it('shows create and row actions according to permissions', async () => {
    listDictionariesMock.mockResolvedValue(dictionariesResponse)
    const { wrapper: unauthorizedWrapper } = await mountDictionariesPage([])
    await flushPromises()

    expect(unauthorizedWrapper.find('[data-test="dictionaries-create"]').exists()).toBe(false)
    expect(unauthorizedWrapper.find('[data-test="dictionaries-edit"]').exists()).toBe(false)
    expect(unauthorizedWrapper.find('[data-test="dictionaries-delete"]').exists()).toBe(false)

    const { wrapper: authorizedWrapper } = await mountDictionariesPage([
      'system:dictionary:create',
      'system:dictionary:update',
      'system:dictionary:list',
      'system:dictionary:delete',
    ])
    await flushPromises()

    expect(authorizedWrapper.find('[data-test="dictionaries-create"]').exists()).toBe(true)
    expect(authorizedWrapper.findAll('[data-test="dictionaries-edit"]')).toHaveLength(2)
    expect(authorizedWrapper.findAll('[data-test="dictionaries-delete"]')).toHaveLength(2)
  })

  it('opens create and edit drawers', async () => {
    listDictionariesMock.mockResolvedValue(dictionariesResponse)
    const { wrapper } = await mountDictionariesPage([
      'system:dictionary:create',
      'system:dictionary:update',
      'system:dictionary:list',
    ])
    await flushPromises()

    await wrapper.get('[data-test="dictionaries-create"]').trigger('click')
    await flushPromises()

    let drawer = wrapper.get('[data-test="dictionary-form-drawer"]')
    expect(drawer.attributes('data-show')).toBe('true')
    expect(drawer.attributes('data-dictionary-id')).toBe('')

    await wrapper.get('[data-test="dictionaries-edit"]').trigger('click')
    await flushPromises()

    drawer = wrapper.get('[data-test="dictionary-form-drawer"]')
    expect(drawer.attributes('data-show')).toBe('true')
    expect(drawer.attributes('data-dictionary-id')).toBe(baseDictionary.id)
  })

  it('shows success and refreshes list after drawer saved', async () => {
    listDictionariesMock.mockResolvedValue(dictionariesResponse)
    const { wrapper } = await mountDictionariesPage([
      'system:dictionary:create',
      'system:dictionary:list',
    ])
    await flushPromises()

    await wrapper.get('[data-test="dictionaries-create"]').trigger('click')
    await flushPromises()
    wrapper.getComponent({ name: 'DictionaryFormDrawerStub' }).vm.$emit('saved')
    await flushPromises()

    expect(document.body.textContent).toContain('保存数据字典成功')
    expect(listDictionariesMock).toHaveBeenCalledTimes(2)
    expect(listDictionariesMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 })
  })

  it('delete confirmation includes cascading text and item count', async () => {
    listDictionariesMock.mockResolvedValue(dictionariesResponse)
    const { wrapper } = await mountDictionariesPage(['system:dictionary:delete'])
    await flushPromises()

    await wrapper.get('[data-test="dictionaries-delete"]').trigger('click')
    await flushPromises()

    expect(document.body.textContent).toContain(
      `确定删除数据字典“${baseDictionary.name}”吗？将同时删除该字典下的 ${baseDictionary.itemCount} 个字典项。`,
    )
    expect(document.body.querySelector('[data-test="dictionaries-delete-confirm"]')).not.toBeNull()
  })

  it('deletes dictionary successfully and refreshes list', async () => {
    listDictionariesMock.mockResolvedValue(dictionariesResponse)
    deleteDictionaryMock.mockResolvedValue(undefined)
    const { wrapper } = await mountDictionariesPage(['system:dictionary:delete'])
    await flushPromises()

    await wrapper.get('[data-test="dictionaries-delete"]').trigger('click')
    await flushPromises()

    const confirmButton = document.body.querySelector(
      '[data-test="dictionaries-delete-confirm"]',
    ) as HTMLButtonElement | null
    expect(confirmButton).not.toBeNull()

    confirmButton?.click()
    await flushPromises()

    expect(deleteDictionaryMock).toHaveBeenCalledWith(baseDictionary.id)
    expect(listDictionariesMock).toHaveBeenCalledTimes(2)
    expect(listDictionariesMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 })
    expect(document.body.textContent).toContain('删除数据字典成功')
  })

  it('keeps delete dialog open and shows system error message when delete fails', async () => {
    listDictionariesMock.mockResolvedValue(dictionariesResponse)
    deleteDictionaryMock.mockRejectedValue(new SystemRequestError(409, '字典已被引用，不能删除'))
    const { wrapper } = await mountDictionariesPage(['system:dictionary:delete'])
    await flushPromises()

    await wrapper.get('[data-test="dictionaries-delete"]').trigger('click')
    await flushPromises()

    const confirmButton = document.body.querySelector(
      '[data-test="dictionaries-delete-confirm"]',
    ) as HTMLButtonElement | null
    expect(confirmButton).not.toBeNull()

    confirmButton?.click()
    await flushPromises()

    expect(deleteDictionaryMock).toHaveBeenCalledTimes(1)
    expect(listDictionariesMock).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('字典已被引用，不能删除')
    expect(document.body.querySelector('[data-test="dictionaries-delete-confirm"]')).not.toBeNull()
  })
})
