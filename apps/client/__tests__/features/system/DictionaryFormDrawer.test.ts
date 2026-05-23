// @vitest-environment happy-dom

import { PiniaColada } from '@pinia/colada'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NInputNumber, NSelect } from 'naive-ui'
import {
  DICTIONARY_STATUS_DISABLED,
  DICTIONARY_STATUS_ENABLED,
  type DictionaryDetail,
} from '@rev30/shared'
import {
  createDictionary,
  getDictionary,
  SystemRequestError,
  updateDictionary,
} from '../../../src/features/system'
import DictionaryFormDrawer from '../../../src/features/system/DictionaryFormDrawer.vue'

enableAutoUnmount(afterEach)

vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  createDictionary: vi.fn(),
  getDictionary: vi.fn(),
  updateDictionary: vi.fn(),
}))

const createDictionaryMock = vi.mocked(createDictionary)
const getDictionaryMock = vi.mocked(getDictionary)
const updateDictionaryMock = vi.mocked(updateDictionary)

const dictionaryId = '11111111-1111-4111-8111-111111111111'
const firstItemId = '22222222-2222-4222-8222-222222222222'
const secondItemId = '33333333-3333-4333-8333-333333333333'
const thirdItemId = '44444444-4444-4444-8444-444444444444'
type ElementWrapper = {
  element: Element
  findAll: (selector: string) => Array<{ element: Element }>
}
const dictionaryDetail: DictionaryDetail = {
  id: dictionaryId,
  code: 'user_status',
  name: '用户状态',
  description: '用户状态字典',
  status: DICTIONARY_STATUS_ENABLED,
  sortOrder: 2,
  createdAt: '2026-05-19T00:00:00.000Z',
  updatedAt: '2026-05-19T00:00:00.000Z',
  items: [
    {
      id: firstItemId,
      typeId: dictionaryId,
      value: 'enabled',
      label: '启用',
      description: '可用状态',
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 10,
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:00.000Z',
    },
    {
      id: secondItemId,
      typeId: dictionaryId,
      value: 'disabled',
      label: '禁用',
      description: '不可用状态',
      status: DICTIONARY_STATUS_DISABLED,
      sortOrder: 20,
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:00.000Z',
    },
  ],
}
const updatedDictionaryDetail: DictionaryDetail = {
  ...dictionaryDetail,
  name: '用户状态维护',
  description: '用户状态字典（更新）',
  updatedAt: '2026-05-20T00:00:00.000Z',
  items: [
    {
      ...dictionaryDetail.items[0]!,
      value: 'active',
      label: '启用中',
      description: '启用状态',
      sortOrder: 5,
      updatedAt: '2026-05-20T00:00:00.000Z',
    },
    {
      id: thirdItemId,
      typeId: dictionaryId,
      value: 'archived',
      label: '已归档',
      description: null,
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 99,
      createdAt: '2026-05-20T00:00:00.000Z',
      updatedAt: '2026-05-20T00:00:00.000Z',
    },
  ],
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, resolve, reject }
}

function mountDrawer(props = { show: true, dictionaryId: null as string | null }) {
  const pinia = createPinia()
  setActivePinia(pinia)

  return mount(DictionaryFormDrawer, {
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

function getItemRows(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('[data-test="dictionary-item-row"]')
}

function getItemRow(wrapper: ReturnType<typeof mount>, index: number) {
  const row = getItemRows(wrapper)[index]

  expect(row).toBeDefined()

  return row!
}

function hasErrorStatus(wrapper: ElementWrapper) {
  return [wrapper.element, ...wrapper.findAll('*').map((child) => child.element)].some((element) =>
    Array.from(element.classList).some((className) => className.endsWith('--error-status')),
  )
}

async function confirmRemoveItem(wrapper: ReturnType<typeof mount>, index: number) {
  await getItemRow(wrapper, index).get('[data-test="dictionary-item-remove"]').trigger('click')
  await flushPromises()

  const deleteButton = wrapper.findAll('button').find((button) => button.text() === '删除')

  expect(deleteButton).toBeDefined()
  await deleteButton!.trigger('click')
  await flushPromises()
}

async function submitForm(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-test="dictionary-form-submit"]').trigger('click')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('DictionaryFormDrawer', () => {
  beforeEach(() => {
    createDictionaryMock.mockReset()
    getDictionaryMock.mockReset()
    updateDictionaryMock.mockReset()
  })

  it('submits dictionary create payload with two items', async () => {
    createDictionaryMock.mockResolvedValue(dictionaryDetail)

    const wrapper = mountDrawer()
    await flushPromises()

    expect(wrapper.text()).toContain('新增数据字典')
    expect(getDictionaryMock).not.toHaveBeenCalled()
    await wrapper.get('[data-test="dictionary-form-code"] input').setValue('order_status')
    await wrapper.get('[data-test="dictionary-form-name"] input').setValue('订单状态')
    await wrapper.get('[data-test="dictionary-form-description"] textarea').setValue('订单状态字典')
    wrapper
      .get('[data-test="dictionary-form-status"]')
      .getComponent(NSelect)
      .vm.$emit('update:value', DICTIONARY_STATUS_DISABLED)
    wrapper
      .get('[data-test="dictionary-form-sort-order"]')
      .getComponent(NInputNumber)
      .vm.$emit('update:value', 3)
    await flushPromises()

    await wrapper.get('[data-test="dictionary-item-add"]').trigger('click')
    await wrapper.get('[data-test="dictionary-item-add"]').trigger('click')
    await flushPromises()

    expect(getItemRows(wrapper)).toHaveLength(2)

    const firstRow = getItemRow(wrapper, 0)
    await firstRow.get('[data-test="dictionary-item-value"] input').setValue('created')
    await firstRow.get('[data-test="dictionary-item-label"] input').setValue('已创建')
    await firstRow.get('[data-test="dictionary-item-description"] textarea').setValue('新建订单')
    firstRow
      .get('[data-test="dictionary-item-status"]')
      .getComponent(NSelect)
      .vm.$emit('update:value', DICTIONARY_STATUS_ENABLED)
    firstRow
      .get('[data-test="dictionary-item-sort-order"]')
      .getComponent(NInputNumber)
      .vm.$emit('update:value', 1)

    const secondRow = getItemRow(wrapper, 1)
    await secondRow.get('[data-test="dictionary-item-value"] input').setValue('completed')
    await secondRow.get('[data-test="dictionary-item-label"] input').setValue('已完成')
    await secondRow.get('[data-test="dictionary-item-description"] textarea').setValue('已完成订单')
    secondRow
      .get('[data-test="dictionary-item-status"]')
      .getComponent(NSelect)
      .vm.$emit('update:value', DICTIONARY_STATUS_DISABLED)
    secondRow
      .get('[data-test="dictionary-item-sort-order"]')
      .getComponent(NInputNumber)
      .vm.$emit('update:value', 2)
    await flushPromises()

    await submitForm(wrapper)

    expect(createDictionaryMock).toHaveBeenCalledWith({
      code: 'order_status',
      name: '订单状态',
      description: '订单状态字典',
      status: DICTIONARY_STATUS_DISABLED,
      sortOrder: 3,
      items: [
        {
          value: 'created',
          label: '已创建',
          description: '新建订单',
          status: DICTIONARY_STATUS_ENABLED,
          sortOrder: 1,
        },
        {
          value: 'completed',
          label: '已完成',
          description: '已完成订单',
          status: DICTIONARY_STATUS_DISABLED,
          sortOrder: 2,
        },
      ],
    })
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })

  it('loads detail in edit mode and submits full put payload after item changes', async () => {
    getDictionaryMock.mockResolvedValue(dictionaryDetail)
    updateDictionaryMock.mockResolvedValue(dictionaryDetail)

    const wrapper = mountDrawer({ show: true, dictionaryId })
    await flushPromises()

    expect(wrapper.text()).toContain('编辑数据字典')
    expect(getDictionaryMock).toHaveBeenCalledWith(dictionaryId)
    expect(
      (wrapper.get('[data-test="dictionary-form-code"] input').element as HTMLInputElement).value,
    ).toBe('user_status')

    await confirmRemoveItem(wrapper, 0)
    await wrapper.get('[data-test="dictionary-item-add"]').trigger('click')
    await flushPromises()

    expect(getItemRows(wrapper)).toHaveLength(2)

    await wrapper.get('[data-test="dictionary-form-name"] input').setValue('用户状态维护')
    const appendedRow = getItemRow(wrapper, 1)
    await appendedRow.get('[data-test="dictionary-item-value"] input').setValue('archived')
    await appendedRow.get('[data-test="dictionary-item-label"] input').setValue('已归档')
    await appendedRow.get('[data-test="dictionary-item-description"] textarea').setValue('归档状态')
    appendedRow
      .get('[data-test="dictionary-item-status"]')
      .getComponent(NSelect)
      .vm.$emit('update:value', DICTIONARY_STATUS_ENABLED)
    appendedRow
      .get('[data-test="dictionary-item-sort-order"]')
      .getComponent(NInputNumber)
      .vm.$emit('update:value', 99)
    await flushPromises()

    await submitForm(wrapper)

    expect(updateDictionaryMock).toHaveBeenCalledWith(dictionaryId, {
      code: 'user_status',
      name: '用户状态维护',
      description: '用户状态字典',
      status: DICTIONARY_STATUS_ENABLED,
      sortOrder: 2,
      items: [
        {
          id: secondItemId,
          value: 'disabled',
          label: '禁用',
          description: '不可用状态',
          status: DICTIONARY_STATUS_DISABLED,
          sortOrder: 20,
        },
        {
          value: 'archived',
          label: '已归档',
          description: '归档状态',
          status: DICTIONARY_STATUS_ENABLED,
          sortOrder: 99,
        },
      ],
    })
  })

  it('reloads detail when reopening same dictionary after save', async () => {
    getDictionaryMock
      .mockResolvedValueOnce(dictionaryDetail)
      .mockResolvedValueOnce(updatedDictionaryDetail)
    updateDictionaryMock.mockResolvedValue(updatedDictionaryDetail)

    const wrapper = mountDrawer({ show: true, dictionaryId })
    await flushPromises()

    await wrapper.get('[data-test="dictionary-form-name"] input').setValue('用户状态维护')
    await confirmRemoveItem(wrapper, 1)

    const firstRow = getItemRow(wrapper, 0)
    await firstRow.get('[data-test="dictionary-item-value"] input').setValue('active')
    await firstRow.get('[data-test="dictionary-item-label"] input').setValue('启用中')
    await firstRow.get('[data-test="dictionary-item-description"] textarea').setValue('启用状态')
    firstRow
      .get('[data-test="dictionary-item-sort-order"]')
      .getComponent(NInputNumber)
      .vm.$emit('update:value', 5)

    await wrapper.get('[data-test="dictionary-item-add"]').trigger('click')
    await flushPromises()

    const appendedRow = getItemRow(wrapper, 1)
    await appendedRow.get('[data-test="dictionary-item-value"] input').setValue('archived')
    await appendedRow.get('[data-test="dictionary-item-label"] input').setValue('已归档')
    await appendedRow.get('[data-test="dictionary-item-description"] textarea').setValue('')
    appendedRow
      .get('[data-test="dictionary-item-status"]')
      .getComponent(NSelect)
      .vm.$emit('update:value', DICTIONARY_STATUS_ENABLED)
    appendedRow
      .get('[data-test="dictionary-item-sort-order"]')
      .getComponent(NInputNumber)
      .vm.$emit('update:value', 99)
    await flushPromises()

    await submitForm(wrapper)

    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')).toEqual([[false]])

    await wrapper.setProps({ show: false, dictionaryId })
    await flushPromises()
    await wrapper.setProps({ show: true, dictionaryId })
    await flushPromises()

    expect(getDictionaryMock).toHaveBeenCalledTimes(2)
    expect(
      (wrapper.get('[data-test="dictionary-form-name"] input').element as HTMLInputElement).value,
    ).toBe(updatedDictionaryDetail.name)
    expect(
      (
        wrapper.get('[data-test="dictionary-form-description"] textarea')
          .element as HTMLTextAreaElement
      ).value,
    ).toBe(updatedDictionaryDetail.description ?? '')
    expect(getItemRows(wrapper)).toHaveLength(2)
    expect(
      (
        getItemRow(wrapper, 0).get('[data-test="dictionary-item-value"] input')
          .element as HTMLInputElement
      ).value,
    ).toBe('active')
    expect(
      (
        getItemRow(wrapper, 1).get('[data-test="dictionary-item-value"] input')
          .element as HTMLInputElement
      ).value,
    ).toBe('archived')
  })

  it('does not save when canceling after removing a local item', async () => {
    getDictionaryMock.mockResolvedValue(dictionaryDetail)

    const wrapper = mountDrawer({ show: true, dictionaryId })
    await flushPromises()

    await confirmRemoveItem(wrapper, 0)

    const cancelButton = wrapper.findAll('button').find((button) => button.text() === '取消')

    expect(cancelButton).toBeDefined()
    await cancelButton!.trigger('click')
    await flushPromises()

    expect(createDictionaryMock).not.toHaveBeenCalled()
    expect(updateDictionaryMock).not.toHaveBeenCalled()
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })

  it('shows server field error on code field', async () => {
    createDictionaryMock.mockRejectedValue(new SystemRequestError(400, '字典编码已存在', 'code'))

    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="dictionary-form-code"] input').setValue('dup_code')
    await wrapper.get('[data-test="dictionary-form-name"] input').setValue('重复字典')
    await submitForm(wrapper)

    const codeFieldContainer = wrapper
      .get('[data-test="dictionary-form-code"]')
      .element.closest('.n-form-item')

    expect(codeFieldContainer).not.toBeNull()
    expect(codeFieldContainer?.textContent).toContain('字典编码已存在')

    const alertTexts = wrapper.findAll('.n-alert').map((alert) => alert.text())
    expect(alertTexts.some((text) => text.includes('字典编码已存在'))).toBe(false)
  })

  it('shows server field error near items editor when field is items', async () => {
    createDictionaryMock.mockRejectedValue(new SystemRequestError(400, '字典项值不能重复', 'items'))

    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="dictionary-form-code"] input').setValue('region')
    await wrapper.get('[data-test="dictionary-form-name"] input').setValue('地区')
    await wrapper.get('[data-test="dictionary-item-add"]').trigger('click')
    await flushPromises()

    await getItemRow(wrapper, 0).get('[data-test="dictionary-item-value"] input').setValue('cn')
    await getItemRow(wrapper, 0).get('[data-test="dictionary-item-label"] input').setValue('中国')
    await submitForm(wrapper)

    expect(wrapper.get('[data-test="dictionary-items"]').text()).toContain('字典项值不能重复')
  })

  it('ignores stale mutation errors from a previous create session', async () => {
    const pendingCreate = deferred<DictionaryDetail>()
    createDictionaryMock.mockImplementationOnce(() => pendingCreate.promise)

    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="dictionary-form-code"] input').setValue('stale_code')
    await wrapper.get('[data-test="dictionary-form-name"] input').setValue('旧会话')
    await submitForm(wrapper)

    expect(createDictionaryMock).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ show: false, dictionaryId: null })
    await flushPromises()
    await wrapper.setProps({ show: true, dictionaryId: null })
    await flushPromises()

    await wrapper.get('[data-test="dictionary-form-code"] input').setValue('fresh_code')
    await wrapper.get('[data-test="dictionary-form-name"] input').setValue('新会话')

    pendingCreate.reject(new SystemRequestError(400, '旧会话错误', 'code'))
    await flushPromises()

    const codeFieldContainer = wrapper
      .get('[data-test="dictionary-form-code"]')
      .element.closest('.n-form-item')

    expect(codeFieldContainer?.textContent).not.toContain('旧会话错误')
    expect(wrapper.text()).not.toContain('旧会话错误')
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('update:show')).toBeUndefined()
  })

  it('shows items schema errors and skips mutation when local validation fails', async () => {
    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="dictionary-form-code"] input').setValue('order_status')
    await wrapper.get('[data-test="dictionary-form-name"] input').setValue('订单状态')
    await wrapper.get('[data-test="dictionary-item-add"]').trigger('click')
    await wrapper.get('[data-test="dictionary-item-add"]').trigger('click')
    await flushPromises()

    const firstRow = getItemRow(wrapper, 0)
    await firstRow.get('[data-test="dictionary-item-value"] input').setValue('same')
    await firstRow.get('[data-test="dictionary-item-label"] input').setValue('相同一')

    const secondRow = getItemRow(wrapper, 1)
    await secondRow.get('[data-test="dictionary-item-value"] input').setValue('same')
    await secondRow.get('[data-test="dictionary-item-label"] input').setValue('相同二')

    await submitForm(wrapper)

    expect(wrapper.get('[data-test="dictionary-items"]').text()).toContain('字典项值不能重复')
    expect(createDictionaryMock).not.toHaveBeenCalled()
    expect(updateDictionaryMock).not.toHaveBeenCalled()
  })

  it('does not show duplicate value feedback immediately after adding blank items', async () => {
    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="dictionary-item-add"]').trigger('click')
    await wrapper.get('[data-test="dictionary-item-add"]').trigger('click')
    await flushPromises()

    expect(getItemRows(wrapper)).toHaveLength(2)
    expect(wrapper.get('[data-test="dictionary-items"]').text()).not.toContain('字典项值不能重复')
  })

  it('shows aggregate item feedback when blank items are submitted', async () => {
    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="dictionary-form-code"] input').setValue('order_status')
    await wrapper.get('[data-test="dictionary-form-name"] input').setValue('订单状态')
    await wrapper.get('[data-test="dictionary-item-add"]').trigger('click')
    await wrapper.get('[data-test="dictionary-item-add"]').trigger('click')
    await flushPromises()

    await submitForm(wrapper)

    const firstRow = getItemRow(wrapper, 0)
    const secondRow = getItemRow(wrapper, 1)

    expect(wrapper.get('[data-test="dictionary-items"]').text()).toContain('字典项值不能为空')
    expect(wrapper.get('[data-test="dictionary-items"]').text()).not.toContain('字典项值不能重复')
    expect(hasErrorStatus(firstRow.get('[data-test="dictionary-item-value"]'))).toBe(true)
    expect(hasErrorStatus(firstRow.get('[data-test="dictionary-item-label"]'))).toBe(true)
    expect(hasErrorStatus(secondRow.get('[data-test="dictionary-item-value"]'))).toBe(true)
    expect(hasErrorStatus(secondRow.get('[data-test="dictionary-item-label"]'))).toBe(true)
    expect(createDictionaryMock).not.toHaveBeenCalled()
    expect(updateDictionaryMock).not.toHaveBeenCalled()
  })

  it('marks only dictionary item rows with duplicate nonblank values', async () => {
    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="dictionary-form-code"] input').setValue('order_status')
    await wrapper.get('[data-test="dictionary-form-name"] input').setValue('订单状态')
    await wrapper.get('[data-test="dictionary-item-add"]').trigger('click')
    await wrapper.get('[data-test="dictionary-item-add"]').trigger('click')
    await wrapper.get('[data-test="dictionary-item-add"]').trigger('click')
    await flushPromises()

    const firstRow = getItemRow(wrapper, 0)
    await firstRow.get('[data-test="dictionary-item-value"] input').setValue('same')
    await firstRow.get('[data-test="dictionary-item-label"] input').setValue('重复一')

    const secondRow = getItemRow(wrapper, 1)
    await secondRow.get('[data-test="dictionary-item-value"] input').setValue('unique')
    await secondRow.get('[data-test="dictionary-item-label"] input').setValue('唯一')

    const thirdRow = getItemRow(wrapper, 2)
    await thirdRow.get('[data-test="dictionary-item-value"] input').setValue('same')
    await thirdRow.get('[data-test="dictionary-item-label"] input').setValue('重复二')

    await submitForm(wrapper)

    expect(wrapper.get('[data-test="dictionary-items"]').text()).toContain('字典项值不能重复')
    expect(hasErrorStatus(firstRow.get('[data-test="dictionary-item-value"]'))).toBe(true)
    expect(hasErrorStatus(secondRow.get('[data-test="dictionary-item-value"]'))).toBe(false)
    expect(hasErrorStatus(thirdRow.get('[data-test="dictionary-item-value"]'))).toBe(true)
    expect(createDictionaryMock).not.toHaveBeenCalled()
    expect(updateDictionaryMock).not.toHaveBeenCalled()
  })

  it('shows top-level schema errors on form fields and skips mutation', async () => {
    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="dictionary-form-name"] input').setValue('缺少编码')
    await submitForm(wrapper)

    const codeFieldContainer = wrapper
      .get('[data-test="dictionary-form-code"]')
      .element.closest('.n-form-item')

    expect(codeFieldContainer?.textContent).toMatch(
      /字典编码格式无效|字典编码不能为空|请输入字典编码/u,
    )
    expect(createDictionaryMock).not.toHaveBeenCalled()
    expect(updateDictionaryMock).not.toHaveBeenCalled()
  })
})
