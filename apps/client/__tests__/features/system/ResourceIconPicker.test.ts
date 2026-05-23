import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NInput, NPopover } from 'naive-ui'
import ResourceIconPicker from '../../../src/features/system/ResourceIconPicker.vue'
import { searchIcons } from '../../../src/features/system'

vi.mock('@iconify/vue', () => ({
  Icon: defineComponent({
    name: 'Icon',
    props: {
      icon: {
        type: String,
        required: true,
      },
    },
    setup(props: { icon: string }) {
      return () => h('span', { 'data-test': 'iconify-icon' }, props.icon)
    },
  }),
}))

vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  searchIcons: vi.fn(),
}))

const searchIconsMock = vi.mocked(searchIcons)
type IconSearchList = Array<{
  icon: string
  prefix: string
  name: string
  collection: string
  palette: boolean
}>

function mountPicker(value: string | null = null) {
  const pinia = createPinia()
  setActivePinia(pinia)

  return mount(ResourceIconPicker, {
    props: { value },
    attachTo: document.body,
    global: {
      plugins: [pinia, PiniaColada],
      stubs: {
        teleport: true,
      },
    },
  })
}

describe('ResourceIconPicker', () => {
  afterEach(() => {
    searchIconsMock.mockReset()
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

  it('closes on clickoutside and emits blur', async () => {
    searchIconsMock.mockResolvedValue({ list: [] })

    const wrapper = mountPicker(null)
    await wrapper.get('[data-test="resource-form-icon"] input').trigger('focus')
    await flushPromises()
    expect(wrapper.find('[data-test="resource-icon-search"]').exists()).toBe(true)

    wrapper.getComponent(NPopover).vm.$emit('clickoutside', new MouseEvent('click'))
    await flushPromises()

    expect(wrapper.emitted('blur')).toHaveLength(1)
    expect(wrapper.getComponent(NPopover).props('show')).toBe(false)
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
    expect(wrapper.getComponent(NPopover).props('show')).toBe(false)
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
    let resolveFirstRequest!: (value: { list: IconSearchList }) => void
    const firstRequestPromise = new Promise<{ list: IconSearchList }>((resolve) => {
      resolveFirstRequest = resolve
    })

    searchIconsMock.mockImplementation(({ keyword }) => {
      if (keyword === '') {
        return Promise.resolve({ list: [] })
      }
      if (keyword === '用户') {
        return firstRequestPromise
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

    resolveFirstRequest({
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
    let resolveInitialRecommendation!: (value: { list: IconSearchList }) => void
    const initialRecommendationPromise = new Promise<{ list: IconSearchList }>((resolve) => {
      resolveInitialRecommendation = resolve
    })

    searchIconsMock.mockImplementation(({ keyword }) => {
      if (keyword === '') {
        return initialRecommendationPromise
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

    resolveInitialRecommendation({
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
