import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CustomIconSet } from '@rev30/contracts'
import {
  createCustomIconSet,
  getCustomIconSet,
  updateCustomIconSet,
} from '../../../src/features/content/requests'
import IconSetFormDrawer from '../../../src/features/content/IconSetFormDrawer.vue'
import { ApiRequestError } from '../../../src/utils/request'
import { createTestPinia } from '../../helpers/pinia'
import { createDeferred } from '../../helpers/promise'

vi.mock('../../../src/features/content/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/content/requests')>()),
  createCustomIconSet: vi.fn(),
  getCustomIconSet: vi.fn(),
  updateCustomIconSet: vi.fn(),
}))

const createCustomIconSetMock = vi.mocked(createCustomIconSet)
const getCustomIconSetMock = vi.mocked(getCustomIconSet)
const updateCustomIconSetMock = vi.mocked(updateCustomIconSet)

const acmeIconSet: CustomIconSet = {
  prefix: 'acme',
  name: 'Acme Icons',
  description: 'Acme 图标集',
  iconCount: 3,
  createdAt: '2026-06-15T00:00:00.000Z',
  updatedAt: '2026-06-15T00:00:00.000Z',
}

const novaIconSet: CustomIconSet = {
  prefix: 'nova',
  name: 'Nova Icons',
  description: null,
  iconCount: 2,
  createdAt: '2026-06-16T00:00:00.000Z',
  updatedAt: '2026-06-16T00:00:00.000Z',
}

function mountDrawer(props = { show: true, prefix: null as string | null }) {
  const pinia = createTestPinia()

  return mount(IconSetFormDrawer, {
    props,
    attachTo: document.body,
    global: {
      plugins: [pinia, PiniaColada],
      stubs: {
        teleport: true,
      },
    },
  })
}

async function submitForm(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-test="icon-set-form-submit"]').trigger('click')
  await flushPromises()
}

describe('IconSetFormDrawer', () => {
  beforeEach(() => {
    createCustomIconSetMock.mockReset()
    getCustomIconSetMock.mockReset()
    updateCustomIconSetMock.mockReset()
  })

  it('creates an icon set with normalized form values', async () => {
    createCustomIconSetMock.mockResolvedValue(acmeIconSet)

    const wrapper = mountDrawer()
    await flushPromises()

    expect(wrapper.text()).toContain('创建图标集')
    expect(wrapper.get('[data-test="icon-set-form-prefix"] input').attributes('disabled')).toBe(
      undefined,
    )

    await wrapper.get('[data-test="icon-set-form-prefix"] input').setValue('acme')
    await wrapper.get('[data-test="icon-set-form-name"] input').setValue('  Acme Icons  ')
    await wrapper.get('[data-test="icon-set-form-description"] textarea').setValue('   ')
    await submitForm(wrapper)

    expect(createCustomIconSetMock).toHaveBeenCalledWith({
      prefix: 'acme',
      name: 'Acme Icons',
      description: null,
    })
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })

  it('loads an icon set and submits a normalized edit payload', async () => {
    getCustomIconSetMock.mockResolvedValue(acmeIconSet)
    updateCustomIconSetMock.mockResolvedValue({
      ...acmeIconSet,
      name: 'Acme Updated',
      description: null,
    })

    const wrapper = mountDrawer({ show: true, prefix: acmeIconSet.prefix })
    await flushPromises()

    expect(wrapper.text()).toContain('编辑图标集')
    expect(getCustomIconSetMock).toHaveBeenCalledWith(acmeIconSet.prefix)
    expect(wrapper.get('[data-test="icon-set-form-prefix"] input').element).toHaveProperty(
      'value',
      acmeIconSet.prefix,
    )
    expect(wrapper.get('[data-test="icon-set-form-prefix"] input').attributes('disabled')).toBe('')
    expect(wrapper.get('[data-test="icon-set-form-name"] input').element).toHaveProperty(
      'value',
      acmeIconSet.name,
    )
    expect(wrapper.get('[data-test="icon-set-form-description"] textarea').element).toHaveProperty(
      'value',
      acmeIconSet.description,
    )

    await wrapper.get('[data-test="icon-set-form-name"] input').setValue('  Acme Updated  ')
    await wrapper.get('[data-test="icon-set-form-description"] textarea').setValue('   ')
    await submitForm(wrapper)

    expect(updateCustomIconSetMock).toHaveBeenCalledWith(acmeIconSet.prefix, {
      name: 'Acme Updated',
      description: null,
    })
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })

  it('shows field-level API errors next to the matching input', async () => {
    createCustomIconSetMock.mockRejectedValue(
      new ApiRequestError(409, '图标集前缀已存在', 'prefix'),
    )

    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="icon-set-form-prefix"] input').setValue('acme')
    await wrapper.get('[data-test="icon-set-form-name"] input').setValue('Acme Icons')
    await submitForm(wrapper)

    const prefixFormItem = wrapper
      .get('[data-test="icon-set-form-prefix"]')
      .element.closest('.n-form-item')

    expect(prefixFormItem?.textContent).toContain('图标集前缀已存在')
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('update:show')).toBeUndefined()
  })

  it('blocks an empty create form and shows validation feedback', async () => {
    const wrapper = mountDrawer()
    await flushPromises()

    await submitForm(wrapper)

    expect(createCustomIconSetMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('图标集前缀无效')
    expect(wrapper.text()).toContain('请输入图标集名称')
  })

  it('shows icon set load failures and prevents saving', async () => {
    getCustomIconSetMock.mockRejectedValue(new Error('图标集加载失败'))

    const wrapper = mountDrawer({ show: true, prefix: acmeIconSet.prefix })
    await flushPromises()

    expect(wrapper.text()).toContain('图标集加载失败')
    expect(wrapper.get('[data-test="icon-set-form-submit"]').attributes('disabled')).toBe('')

    await submitForm(wrapper)

    expect(updateCustomIconSetMock).not.toHaveBeenCalled()
  })

  it('shows non-field save errors and keeps the drawer open', async () => {
    createCustomIconSetMock.mockRejectedValue(new Error('图标集保存失败'))

    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="icon-set-form-prefix"] input').setValue('acme')
    await wrapper.get('[data-test="icon-set-form-name"] input').setValue('Acme Icons')
    await submitForm(wrapper)

    expect(wrapper.text()).toContain('图标集保存失败')
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('update:show')).toBeUndefined()
  })

  it('ignores stale load responses after switching icon sets', async () => {
    const acmeLoad = createDeferred<CustomIconSet>()
    const novaLoad = createDeferred<CustomIconSet>()
    getCustomIconSetMock.mockImplementation((prefix) => {
      if (prefix === acmeIconSet.prefix) {
        return acmeLoad.promise
      }

      if (prefix === novaIconSet.prefix) {
        return novaLoad.promise
      }

      throw new Error(`Unexpected icon set prefix: ${prefix}`)
    })
    updateCustomIconSetMock.mockResolvedValue(novaIconSet)

    const wrapper = mountDrawer({ show: true, prefix: acmeIconSet.prefix })
    await flushPromises()

    await wrapper.setProps({ show: true, prefix: novaIconSet.prefix })
    await flushPromises()

    novaLoad.resolve(novaIconSet)
    await flushPromises()

    expect(wrapper.get('[data-test="icon-set-form-name"] input').element).toHaveProperty(
      'value',
      novaIconSet.name,
    )

    acmeLoad.resolve(acmeIconSet)
    await flushPromises()

    expect(wrapper.get('[data-test="icon-set-form-name"] input').element).toHaveProperty(
      'value',
      novaIconSet.name,
    )

    await submitForm(wrapper)

    expect(updateCustomIconSetMock).toHaveBeenCalledWith(novaIconSet.prefix, {
      name: novaIconSet.name,
      description: null,
    })
  })

  it('ignores stale mutation errors after closing and reopening the drawer', async () => {
    const pendingCreate = createDeferred<CustomIconSet>()
    createCustomIconSetMock.mockImplementationOnce(() => pendingCreate.promise)

    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="icon-set-form-prefix"] input').setValue('stale')
    await wrapper.get('[data-test="icon-set-form-name"] input').setValue('旧会话')
    await submitForm(wrapper)

    expect(createCustomIconSetMock).toHaveBeenCalledOnce()

    await wrapper.setProps({ show: false, prefix: null })
    await flushPromises()
    await wrapper.setProps({ show: true, prefix: null })
    await flushPromises()

    await wrapper.get('[data-test="icon-set-form-prefix"] input').setValue('fresh')
    await wrapper.get('[data-test="icon-set-form-name"] input').setValue('新会话')

    pendingCreate.reject(new ApiRequestError(400, '旧会话错误', 'prefix'))
    await flushPromises()

    expect(wrapper.text()).not.toContain('旧会话错误')
    expect(wrapper.get('[data-test="icon-set-form-prefix"] input').element).toHaveProperty(
      'value',
      'fresh',
    )
    expect(wrapper.get('[data-test="icon-set-form-name"] input').element).toHaveProperty(
      'value',
      '新会话',
    )
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('update:show')).toBeUndefined()
  })

  it('does not close the current drawer when a stale mutation succeeds', async () => {
    const pendingUpdate = createDeferred<CustomIconSet>()
    getCustomIconSetMock.mockImplementation((prefix) => {
      if (prefix === acmeIconSet.prefix) {
        return Promise.resolve(acmeIconSet)
      }

      if (prefix === novaIconSet.prefix) {
        return Promise.resolve(novaIconSet)
      }

      throw new Error(`Unexpected icon set prefix: ${prefix}`)
    })
    updateCustomIconSetMock.mockImplementationOnce(() => pendingUpdate.promise)

    const wrapper = mountDrawer({ show: true, prefix: acmeIconSet.prefix })
    await flushPromises()

    await wrapper.get('[data-test="icon-set-form-name"] input').setValue('Acme Updated')
    await submitForm(wrapper)

    expect(updateCustomIconSetMock).toHaveBeenCalledOnce()

    await wrapper.setProps({ show: true, prefix: novaIconSet.prefix })
    await flushPromises()

    expect(wrapper.get('[data-test="icon-set-form-name"] input').element).toHaveProperty(
      'value',
      novaIconSet.name,
    )

    pendingUpdate.resolve({ ...acmeIconSet, name: 'Acme Updated' })
    await flushPromises()

    expect(wrapper.props('show')).toBe(true)
    expect(wrapper.props('prefix')).toBe(novaIconSet.prefix)
    expect(wrapper.get('[data-test="icon-set-form-name"] input').element).toHaveProperty(
      'value',
      novaIconSet.name,
    )
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('update:show')).toBeUndefined()
  })
})
