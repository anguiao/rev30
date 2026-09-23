import { createDeferred } from '../../../helpers/promise'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NInput, NPopover } from 'naive-ui'
import IconPicker from '../../../../src/features/icons/search/IconPicker.vue'
import { searchIcons } from '../../../../src/features/icons/requests'
import { createTestQueryHarness } from '../../../helpers/colada'
import { ApiRequestError } from '../../../../src/utils/request'

vi.mock('../../../../src/features/icons/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../src/features/icons/requests')>()),
  searchIcons: vi.fn(),
}))

const searchIconsMock = vi.mocked(searchIcons)

function mountPicker(value: string | null = null) {
  const { plugins } = createTestQueryHarness()

  return mount(IconPicker, {
    props: { value },
    attachTo: document.body,
    global: {
      plugins,
      stubs: {
        teleport: true,
      },
    },
  })
}

describe('IconPicker', () => {
  afterEach(() => {
    searchIconsMock.mockReset()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('renders empty and selected values', async () => {
    searchIconsMock.mockResolvedValue({ list: [] })

    const emptyWrapper = mountPicker(null)
    expect(emptyWrapper.get('[data-test="resource-icon-empty"]').text()).toContain('无')
    expect(
      (emptyWrapper.get('[data-test="resource-form-icon"] input').element as HTMLInputElement)
        .value,
    ).toBe('')

    const selectedWrapper = mountPicker('lucide:users')
    expect(selectedWrapper.find('[data-test="resource-icon-empty"]').text()).toContain(
      'lucide:users',
    )
    expect(
      (selectedWrapper.get('[data-test="resource-form-icon"] input').element as HTMLInputElement)
        .value,
    ).toBe('lucide:users')
  })

  it('opens by focus and requests recommendations', async () => {
    searchIconsMock.mockResolvedValue({
      list: [
        {
          icon: 'lucide:users',
          prefix: 'lucide',
          name: 'users',
          collection: 'Lucide',
          palette: false,
        },
      ],
    })

    const wrapper = mountPicker(null)
    await wrapper.get('[data-test="resource-form-icon"] input').trigger('focus')
    await flushPromises()

    expect(searchIconsMock).toHaveBeenCalledWith({ keyword: '', limit: 60 })
    expect(searchIconsMock).toHaveBeenCalledTimes(1)

    await wrapper.get('[data-test="resource-form-icon"] input').trigger('click')
    await wrapper.get('[data-test="resource-form-icon"] input').trigger('focus')
    await flushPromises()
    expect(searchIconsMock).toHaveBeenCalledTimes(1)

    expect(wrapper.find('[data-test="resource-icon-search"]').exists()).toBe(true)

    const option = wrapper.get('[data-test="resource-icon-option"]')
    expect(option.attributes('aria-label')).toBe('lucide:users')
    expect(option.text()).toBe('lucide:users')
  })

  it('emits blur on clickoutside', async () => {
    searchIconsMock.mockResolvedValue({ list: [] })

    const wrapper = mountPicker(null)
    await wrapper.get('[data-test="resource-form-icon"] input').trigger('focus')
    await flushPromises()
    expect(wrapper.find('[data-test="resource-icon-search"]').exists()).toBe(true)

    wrapper.getComponent(NPopover).vm.$emit('clickoutside', new MouseEvent('click'))
    await flushPromises()

    expect(wrapper.emitted('blur')).toHaveLength(1)
  })

  it('runs debounced search for chinese keyword', async () => {
    vi.useFakeTimers()
    searchIconsMock.mockResolvedValue({ list: [] })

    const wrapper = mountPicker(null)
    await wrapper.get('[data-test="resource-form-icon"] input').trigger('focus')
    await flushPromises()
    searchIconsMock.mockClear()

    await wrapper.get('[data-test="resource-icon-search"] input').setValue('用户')
    await vi.advanceTimersByTimeAsync(199)
    expect(searchIconsMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()
    expect(searchIconsMock).toHaveBeenCalledWith({ keyword: '用户', limit: 60 })
  })

  it('shows the bilingual search hint and retries preparing searches until ready', async () => {
    vi.useFakeTimers()
    const preparingError = new ApiRequestError(
      503,
      '图标搜索正在准备',
      undefined,
      'ICON_SEARCH_PREPARING',
    )
    searchIconsMock
      .mockResolvedValueOnce({ list: [] })
      .mockRejectedValueOnce(preparingError)
      .mockRejectedValueOnce(preparingError)
      .mockResolvedValueOnce({
        list: [
          {
            icon: 'lucide:users',
            prefix: 'lucide',
            name: 'users',
            collection: 'Lucide',
            palette: false,
          },
        ],
      })

    const wrapper = mountPicker(null)
    await wrapper.get('[data-test="resource-form-icon"] input').trigger('focus')
    await flushPromises()

    expect(wrapper.text()).toContain('部分内置图标支持中文，可尝试英文名称或图标 ID')

    await wrapper.get('[data-test="resource-icon-search"] input').setValue('用户')
    await vi.advanceTimersByTimeAsync(200)
    await flushPromises()
    expect(wrapper.text()).toContain('图标搜索正在准备')
    expect(wrapper.text()).not.toContain('未找到匹配图标')

    await vi.advanceTimersByTimeAsync(1_000)
    await flushPromises()
    expect(wrapper.text()).toContain('图标搜索正在准备')

    await vi.advanceTimersByTimeAsync(2_000)
    await flushPromises()
    expect(wrapper.get('[data-test="resource-icon-option"]').text()).toBe('lucide:users')
    expect(searchIconsMock).toHaveBeenCalledTimes(4)
  })

  it('reuses normalized search results while preserving input and request text', async () => {
    vi.useFakeTimers()
    searchIconsMock.mockResolvedValue({ list: [] })
    const wrapper = mountPicker()
    await wrapper.get('[data-test="resource-form-icon"] input').trigger('focus')
    await flushPromises()
    const input = wrapper.get('[data-test="resource-icon-search"] input')

    await input.setValue('  ＵＳＥＲ   ADD  ')
    await vi.advanceTimersByTimeAsync(200)
    await flushPromises()
    expect(searchIconsMock).toHaveBeenLastCalledWith({ keyword: 'ＵＳＥＲ   ADD', limit: 60 })

    await input.setValue('user add')
    await vi.advanceTimersByTimeAsync(200)
    await flushPromises()
    expect(searchIconsMock).toHaveBeenCalledTimes(2)
    expect((input.element as HTMLInputElement).value).toBe('user add')
  })

  it('does not share valid search results with normalized input exceeding the query limit', async () => {
    vi.useFakeTimers()
    searchIconsMock.mockResolvedValue({ list: [] })
    const wrapper = mountPicker()
    await wrapper.get('[data-test="resource-form-icon"] input').trigger('focus')
    await flushPromises()
    const input = wrapper.get('[data-test="resource-icon-search"] input')
    const validKeyword = 'ﬃ'.repeat(50)

    await input.setValue(validKeyword)
    await vi.advanceTimersByTimeAsync(200)
    await flushPromises()
    expect(searchIconsMock).toHaveBeenLastCalledWith({ keyword: validKeyword, limit: 60 })

    searchIconsMock.mockRejectedValueOnce(new ApiRequestError(400, '搜索关键词过长'))
    await input.setValue(validKeyword.normalize('NFKC'))
    await vi.advanceTimersByTimeAsync(200)
    await flushPromises()
    expect(searchIconsMock).toHaveBeenCalledTimes(3)
    expect(wrapper.text()).toContain('图标搜索失败')
  })

  it('backs off preparing retries up to the cap and pauses while the page is hidden', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    let visibility: DocumentVisibilityState = 'visible'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
    searchIconsMock
      .mockResolvedValueOnce({ list: [] })
      .mockRejectedValue(new ApiRequestError(503, '正在准备', undefined, 'ICON_SEARCH_PREPARING'))
    const wrapper = mountPicker()
    await wrapper.get('[data-test="resource-form-icon"] input').trigger('focus')
    await flushPromises()
    await wrapper.get('[data-test="resource-icon-search"] input').setValue('用户')
    await vi.advanceTimersByTimeAsync(200)
    await flushPromises()

    for (const delay of [800, 1_600, 3_200, 6_400, 6_400]) {
      const previousCalls = searchIconsMock.mock.calls.length
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(searchIconsMock).toHaveBeenCalledTimes(previousCalls)
      await vi.advanceTimersByTimeAsync(1)
      await flushPromises()
      expect(searchIconsMock).toHaveBeenCalledTimes(previousCalls + 1)
    }

    visibility = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    const callsBeforeHidden = searchIconsMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(20_000)
    expect(searchIconsMock).toHaveBeenCalledTimes(callsBeforeHidden)

    visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    await vi.advanceTimersByTimeAsync(6_400)
    await flushPromises()
    expect(searchIconsMock).toHaveBeenCalledTimes(callsBeforeHidden + 1)
  })

  it('only retries unavailable searches when the retry button is clicked', async () => {
    vi.useFakeTimers()
    searchIconsMock
      .mockResolvedValueOnce({ list: [] })
      .mockRejectedValueOnce(
        new ApiRequestError(503, '暂不可用', undefined, 'ICON_SEARCH_UNAVAILABLE'),
      )
    const wrapper = mountPicker()
    await wrapper.get('[data-test="resource-form-icon"] input').trigger('focus')
    await flushPromises()
    await wrapper.get('[data-test="resource-icon-search"] input').setValue('用户')
    await vi.advanceTimersByTimeAsync(200)
    await flushPromises()

    await vi.advanceTimersByTimeAsync(10_000)
    expect(searchIconsMock).toHaveBeenCalledTimes(2)
    searchIconsMock.mockResolvedValueOnce({ list: [] })
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '重试')!
      .trigger('click')
    await flushPromises()
    expect(searchIconsMock).toHaveBeenLastCalledWith({ keyword: '用户', limit: 60 })
    expect(searchIconsMock).toHaveBeenCalledTimes(3)
    expect(wrapper.text()).not.toContain('图标搜索暂不可用')
    expect(wrapper.text()).toContain('未找到匹配图标')
  })

  it('clears preparing state immediately and distinguishes unavailable, errors, and zero results', async () => {
    vi.useFakeTimers()
    searchIconsMock
      .mockResolvedValueOnce({ list: [] })
      .mockRejectedValueOnce(
        new ApiRequestError(503, '暂不可用', undefined, 'ICON_SEARCH_UNAVAILABLE'),
      )

    const wrapper = mountPicker(null)
    await wrapper.get('[data-test="resource-form-icon"] input').trigger('focus')
    await flushPromises()

    await wrapper.get('[data-test="resource-icon-search"] input').setValue('用户')
    await vi.advanceTimersByTimeAsync(200)
    await flushPromises()
    expect(wrapper.text()).toContain('图标搜索暂不可用')
    expect(wrapper.text()).not.toContain('未找到匹配图标')

    searchIconsMock.mockResolvedValueOnce({ list: [] })
    wrapper
      .findAllComponents(NInput)
      .find((input) => input.attributes('data-test') === 'resource-icon-search')!
      .vm.$emit('update:value', '')
    await flushPromises()
    expect(wrapper.text()).toContain('暂无图标')
    expect(wrapper.text()).not.toContain('图标搜索暂不可用')

    searchIconsMock.mockResolvedValueOnce({ list: [] })
    await wrapper.get('[data-test="resource-icon-search"] input').setValue('missing')
    await vi.advanceTimersByTimeAsync(200)
    await flushPromises()
    expect(wrapper.text()).toContain('未找到匹配图标，可尝试英文名称、图标 ID 或其他关键词')
  })

  it('stops preparing retries after the picker closes', async () => {
    vi.useFakeTimers()
    searchIconsMock
      .mockResolvedValueOnce({ list: [] })
      .mockRejectedValue(new ApiRequestError(503, '正在准备', undefined, 'ICON_SEARCH_PREPARING'))
    const wrapper = mountPicker(null)
    await wrapper.get('[data-test="resource-form-icon"] input').trigger('focus')
    await flushPromises()

    await wrapper.get('[data-test="resource-icon-search"] input').setValue('用户')
    await vi.advanceTimersByTimeAsync(200)
    await flushPromises()
    expect(searchIconsMock).toHaveBeenCalledTimes(2)

    wrapper.getComponent(NPopover).vm.$emit('clickoutside', new MouseEvent('click'))
    await flushPromises()
    await vi.advanceTimersByTimeAsync(2_000)
    await flushPromises()

    expect(searchIconsMock).toHaveBeenCalledTimes(2)
  })

  it('reopens with recommendation search after chinese keyword search', async () => {
    vi.useFakeTimers()
    searchIconsMock.mockResolvedValue({
      list: [
        {
          icon: 'lucide:users',
          prefix: 'lucide',
          name: 'users',
          collection: 'Lucide',
          palette: false,
        },
      ],
    })

    const wrapper = mountPicker(null)
    await wrapper.get('[data-test="resource-form-icon"] input').trigger('focus')
    await flushPromises()
    searchIconsMock.mockClear()

    await wrapper.get('[data-test="resource-icon-search"] input').setValue('用户')
    await vi.advanceTimersByTimeAsync(200)
    await flushPromises()
    expect(searchIconsMock).toHaveBeenLastCalledWith({ keyword: '用户', limit: 60 })

    await wrapper.get('[data-test="resource-icon-option"]').trigger('click')
    await flushPromises()

    searchIconsMock.mockClear()
    await wrapper.setProps({ value: 'lucide:users' })
    await wrapper.get('[data-test="resource-form-icon"] input').trigger('focus')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(200)
    await flushPromises()

    const searchInput = wrapper.get('[data-test="resource-icon-search"] input')
      .element as HTMLInputElement
    expect(searchInput.value).toBe('')
    expect(wrapper.get('[data-test="resource-icon-option"]').text()).toBe('lucide:users')
  })

  it('does not run debounced search after closing before timer fires', async () => {
    vi.useFakeTimers()
    searchIconsMock.mockResolvedValue({ list: [] })

    const wrapper = mountPicker(null)
    await wrapper.get('[data-test="resource-form-icon"] input').trigger('focus')
    await flushPromises()
    searchIconsMock.mockClear()

    await wrapper.get('[data-test="resource-icon-search"] input').setValue('用户')
    wrapper.getComponent(NPopover).vm.$emit('clickoutside', new MouseEvent('click'))
    await flushPromises()

    await vi.advanceTimersByTimeAsync(200)
    await flushPromises()

    expect(searchIconsMock).not.toHaveBeenCalled()
  })

  it('emits selected icon and clears value to null', async () => {
    searchIconsMock.mockResolvedValue({
      list: [
        {
          icon: 'lucide:users',
          prefix: 'lucide',
          name: 'users',
          collection: 'Lucide',
          palette: false,
        },
      ],
    })

    const wrapper = mountPicker(null)
    await wrapper.get('[data-test="resource-form-icon"] input').trigger('focus')
    await flushPromises()

    await wrapper.get('[data-test="resource-icon-option"]').trigger('click')
    expect(wrapper.emitted('update:value')?.[0]).toEqual(['lucide:users'])

    wrapper.getComponent(NPopover).vm.$emit('update:show', false)
    await flushPromises()
    await wrapper.setProps({ value: 'lucide:users' })
    wrapper.getComponent(NInput).vm.$emit('update:value', '')
    await flushPromises()

    const emittedValues = wrapper.emitted('update:value') ?? []
    expect(emittedValues.some((args) => args[0] === null)).toBe(true)
  })

  it('shows search error and keeps selected value', async () => {
    searchIconsMock.mockRejectedValue(new Error('boom'))

    const wrapper = mountPicker('lucide:users')
    await wrapper.get('[data-test="resource-form-icon"] input').trigger('focus')
    await flushPromises()

    expect(wrapper.text()).toContain('图标搜索失败')
    expect(
      (wrapper.get('[data-test="resource-form-icon"] input').element as HTMLInputElement).value,
    ).toBe('lucide:users')
    expect(wrapper.find('[data-test="resource-icon-empty"]').text()).toContain('lucide:users')
  })

  it('keeps newest search result when previous request resolves later', async () => {
    vi.useFakeTimers()
    const firstRequest = createDeferred<Awaited<ReturnType<typeof searchIcons>>>()

    searchIconsMock.mockImplementation(({ keyword }) => {
      if (keyword === '') {
        return Promise.resolve({ list: [] })
      }
      if (keyword === '用户') {
        return firstRequest.promise
      }
      return Promise.resolve({
        list: [
          {
            icon: 'lucide:user-check',
            prefix: 'lucide',
            name: 'user-check',
            collection: 'Lucide',
            palette: false,
          },
        ],
      })
    })

    const wrapper = mountPicker(null)
    await wrapper.get('[data-test="resource-form-icon"] input').trigger('focus')
    await flushPromises()

    await wrapper.get('[data-test="resource-icon-search"] input').setValue('用户')
    await vi.advanceTimersByTimeAsync(200)
    await flushPromises()

    await wrapper.get('[data-test="resource-icon-search"] input').setValue('用户组')
    await vi.advanceTimersByTimeAsync(200)
    await flushPromises()

    expect(wrapper.get('[data-test="resource-icon-option"]').text()).toBe('lucide:user-check')

    firstRequest.resolve({
      list: [
        {
          icon: 'lucide:users',
          prefix: 'lucide',
          name: 'users',
          collection: 'Lucide',
          palette: false,
        },
      ],
    })
    await flushPromises()

    expect(wrapper.get('[data-test="resource-icon-option"]').text()).toBe('lucide:user-check')
    expect(wrapper.text()).not.toContain('图标搜索失败')
  })

  it('runs user keyword search while initial recommendation request is still pending', async () => {
    vi.useFakeTimers()
    const initialRecommendation = createDeferred<Awaited<ReturnType<typeof searchIcons>>>()

    searchIconsMock.mockImplementation(({ keyword }) => {
      if (keyword === '') {
        return initialRecommendation.promise
      }
      if (keyword === '用户') {
        return Promise.resolve({
          list: [
            {
              icon: 'lucide:users',
              prefix: 'lucide',
              name: 'users',
              collection: 'Lucide',
              palette: false,
            },
          ],
        })
      }
      return Promise.resolve({ list: [] })
    })

    const wrapper = mountPicker(null)
    await wrapper.get('[data-test="resource-form-icon"] input').trigger('focus')
    await flushPromises()
    expect(searchIconsMock).toHaveBeenCalledWith({ keyword: '', limit: 60 })

    await wrapper.get('[data-test="resource-icon-search"] input').setValue('用户')
    await vi.advanceTimersByTimeAsync(200)
    await flushPromises()

    expect(searchIconsMock).toHaveBeenCalledWith({ keyword: '用户', limit: 60 })
    expect(wrapper.get('[data-test="resource-icon-option"]').text()).toBe('lucide:users')

    initialRecommendation.resolve({
      list: [
        {
          icon: 'lucide:folder',
          prefix: 'lucide',
          name: 'folder',
          collection: 'Lucide',
          palette: false,
        },
      ],
    })
    await flushPromises()

    expect(wrapper.get('[data-test="resource-icon-option"]').text()).toBe('lucide:users')
  })
})
