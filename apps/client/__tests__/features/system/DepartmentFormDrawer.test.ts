import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '../../../src/utils/request'
import { NInputNumber, NSelect } from 'naive-ui'
import {
  DEPARTMENT_STATUS_DISABLED,
  DEPARTMENT_STATUS_ENABLED,
  type Department,
  type DepartmentTreeNode,
} from '@rev30/contracts'
import {
  createDepartment,
  getDepartment,
  getDepartmentTreeOptions,
  updateDepartment,
} from '../../../src/features/system'
import DepartmentFormDrawer from '../../../src/features/system/DepartmentFormDrawer.vue'
import { createPinia, setActivePinia } from 'pinia'
vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  createDepartment: vi.fn(),
  getDepartment: vi.fn(),
  getDepartmentTreeOptions: vi.fn(),
  updateDepartment: vi.fn(),
}))

const createDepartmentMock = vi.mocked(createDepartment)
const getDepartmentMock = vi.mocked(getDepartment)
const getDepartmentTreeOptionsMock = vi.mocked(getDepartmentTreeOptions)
const updateDepartmentMock = vi.mocked(updateDepartment)

const rootDepartmentId = '11111111-1111-4111-8111-111111111111'
const childDepartmentId = '22222222-2222-4222-8222-222222222222'
const grandchildDepartmentId = '33333333-3333-4333-8333-333333333333'
const siblingDepartmentId = '44444444-4444-4444-8444-444444444444'
const secondRootDepartmentId = '55555555-5555-4555-8555-555555555555'
const enabledChildOfDisabledDepartmentId = '66666666-6666-4666-8666-666666666666'

const departmentTreeResponse: DepartmentTreeNode[] = [
  {
    id: rootDepartmentId,
    parentId: null,
    name: '总部',
    code: 'hq',
    status: DEPARTMENT_STATUS_ENABLED,
    sortOrder: 1,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    children: [
      {
        id: childDepartmentId,
        parentId: rootDepartmentId,
        name: '运营部',
        code: 'ops',
        status: DEPARTMENT_STATUS_ENABLED,
        sortOrder: 2,
        createdAt: '2026-05-02T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
        children: [
          {
            id: grandchildDepartmentId,
            parentId: childDepartmentId,
            name: '运营支持组',
            code: 'ops-support',
            status: DEPARTMENT_STATUS_ENABLED,
            sortOrder: 1,
            createdAt: '2026-05-03T00:00:00.000Z',
            updatedAt: '2026-05-03T00:00:00.000Z',
            children: [],
          },
        ],
      },
      {
        id: siblingDepartmentId,
        parentId: rootDepartmentId,
        name: '市场部',
        code: 'marketing',
        status: DEPARTMENT_STATUS_DISABLED,
        sortOrder: 3,
        createdAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-04T00:00:00.000Z',
        children: [
          {
            id: enabledChildOfDisabledDepartmentId,
            parentId: siblingDepartmentId,
            name: '市场活动组',
            code: 'campaign',
            status: DEPARTMENT_STATUS_ENABLED,
            sortOrder: 1,
            createdAt: '2026-05-04T00:00:00.000Z',
            updatedAt: '2026-05-04T00:00:00.000Z',
            children: [],
          },
        ],
      },
    ],
  },
  {
    id: secondRootDepartmentId,
    parentId: null,
    name: '财务中心',
    code: 'finance',
    status: DEPARTMENT_STATUS_ENABLED,
    sortOrder: 4,
    createdAt: '2026-05-05T00:00:00.000Z',
    updatedAt: '2026-05-05T00:00:00.000Z',
    children: [],
  },
]

const childDepartmentResponse: Department = {
  id: childDepartmentId,
  parentId: rootDepartmentId,
  name: '运营部',
  code: 'ops',
  status: DEPARTMENT_STATUS_ENABLED,
  sortOrder: 2,
  createdAt: '2026-05-02T00:00:00.000Z',
  updatedAt: '2026-05-02T00:00:00.000Z',
}
const updatedChildDepartmentResponse: Department = {
  ...childDepartmentResponse,
  name: '运营管理部',
  status: DEPARTMENT_STATUS_DISABLED,
  updatedAt: '2026-05-20T00:00:00.000Z',
}

const siblingDepartmentResponse: Department = {
  id: siblingDepartmentId,
  parentId: rootDepartmentId,
  name: '市场部',
  code: 'marketing',
  status: DEPARTMENT_STATUS_ENABLED,
  sortOrder: 3,
  createdAt: '2026-05-04T00:00:00.000Z',
  updatedAt: '2026-05-04T00:00:00.000Z',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return {
    promise,
    resolve,
    reject,
  }
}

function mountDrawer(
  props: {
    show?: boolean
    departmentId?: string | null
    parentId?: string | null
  } = {},
) {
  const pinia = createPinia()
  setActivePinia(pinia)

  return mount(DepartmentFormDrawer, {
    props: {
      show: props.show ?? true,
      departmentId: props.departmentId === undefined ? null : props.departmentId,
      parentId: props.parentId === undefined ? null : props.parentId,
    },
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
  await wrapper.get('[data-test="department-form-submit"]').trigger('click')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('DepartmentFormDrawer', () => {
  beforeEach(() => {
    createDepartmentMock.mockReset()
    getDepartmentMock.mockReset()
    getDepartmentTreeOptionsMock.mockReset()
    updateDepartmentMock.mockReset()

    getDepartmentTreeOptionsMock.mockResolvedValue(departmentTreeResponse)
  })

  it('creates a top-level department', async () => {
    createDepartmentMock.mockResolvedValue({
      ...childDepartmentResponse,
      id: '66666666-6666-4666-8666-666666666666',
      parentId: null,
      name: '运营中心',
      code: 'ops',
      sortOrder: 3,
    })

    const wrapper = mountDrawer({
      show: true,
      departmentId: null,
      parentId: null,
    })
    await flushPromises()

    expect(getDepartmentTreeOptionsMock).toHaveBeenCalledWith()
    expect(getDepartmentMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('新增组织部门')

    await wrapper.get('[data-test="department-form-name"] input').setValue('运营中心')
    await wrapper.get('[data-test="department-form-code"] input').setValue('ops')
    wrapper.getComponent(NInputNumber).vm.$emit('update:value', 3)
    await flushPromises()

    await submitForm(wrapper)

    expect(createDepartmentMock).toHaveBeenCalledWith({
      name: '运营中心',
      code: 'ops',
      parentId: null,
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 3,
    })
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })

  it('shows a load error and disables submit when department options fail to load', async () => {
    getDepartmentTreeOptionsMock.mockRejectedValue(new Error('network'))

    const wrapper = mountDrawer({
      show: true,
      departmentId: null,
      parentId: null,
    })
    await flushPromises()

    expect(wrapper.text()).toContain('network')
    expect(wrapper.get('[data-test="department-form-submit"]').attributes('disabled')).toBeDefined()

    await wrapper.get('[data-test="department-form-name"] input').setValue('异常部门')
    await wrapper.get('[data-test="department-form-code"] input').setValue('blocked-dept')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(createDepartmentMock).not.toHaveBeenCalled()
    expect(updateDepartmentMock).not.toHaveBeenCalled()
  })

  it('creates a child department with the provided parent id', async () => {
    createDepartmentMock.mockResolvedValue({
      ...childDepartmentResponse,
      id: '77777777-7777-4777-8777-777777777777',
      parentId: rootDepartmentId,
      name: '新运营组',
      code: 'new-ops',
      sortOrder: 0,
    })

    const wrapper = mountDrawer({
      show: true,
      departmentId: null,
      parentId: rootDepartmentId,
    })
    await flushPromises()

    expect(getDepartmentTreeOptionsMock).toHaveBeenCalledWith([rootDepartmentId])

    await wrapper.get('[data-test="department-form-name"] input').setValue('新运营组')
    await wrapper.get('[data-test="department-form-code"] input').setValue('new-ops')
    await submitForm(wrapper)

    expect(createDepartmentMock).toHaveBeenCalledWith({
      name: '新运营组',
      code: 'new-ops',
      parentId: rootDepartmentId,
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 0,
    })
  })

  it('submits the latest parent id after closing and reopening create mode', async () => {
    createDepartmentMock.mockResolvedValue({
      ...childDepartmentResponse,
      id: '99999999-9999-4999-8999-999999999999',
      parentId: secondRootDepartmentId,
      name: '财务分析组',
      code: 'finance-analysis',
      sortOrder: 0,
    })

    const wrapper = mountDrawer({
      show: true,
      departmentId: null,
      parentId: rootDepartmentId,
    })
    await flushPromises()

    await wrapper.setProps({
      show: false,
      departmentId: null,
      parentId: rootDepartmentId,
    })
    await flushPromises()

    await wrapper.setProps({
      show: true,
      departmentId: null,
      parentId: secondRootDepartmentId,
    })
    await flushPromises()

    await wrapper.get('[data-test="department-form-name"] input').setValue('财务分析组')
    await wrapper.get('[data-test="department-form-code"] input').setValue('finance-analysis')
    await submitForm(wrapper)

    expect(createDepartmentMock).toHaveBeenCalledWith({
      name: '财务分析组',
      code: 'finance-analysis',
      parentId: secondRootDepartmentId,
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 0,
    })
  })

  it('keeps the original parent cached for a stale create load after switching parents', async () => {
    const firstTreeLoad = deferred<DepartmentTreeNode[]>()
    const secondTreeLoad = deferred<DepartmentTreeNode[]>()
    let treeLoadCount = 0
    createDepartmentMock.mockResolvedValue({
      ...childDepartmentResponse,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      parentId: secondRootDepartmentId,
      name: '财务分析组',
      code: 'finance-analysis',
      sortOrder: 0,
    })

    getDepartmentTreeOptionsMock.mockImplementation(() => {
      treeLoadCount += 1

      if (treeLoadCount === 1) {
        return firstTreeLoad.promise
      }

      if (treeLoadCount === 2) {
        return secondTreeLoad.promise
      }

      return Promise.resolve(departmentTreeResponse)
    })

    const wrapper = mountDrawer({
      show: true,
      departmentId: null,
      parentId: rootDepartmentId,
    })
    await flushPromises()

    await wrapper.setProps({
      show: true,
      departmentId: null,
      parentId: secondRootDepartmentId,
    })
    await flushPromises()

    secondTreeLoad.resolve(departmentTreeResponse)
    await flushPromises()

    firstTreeLoad.resolve(departmentTreeResponse)
    await flushPromises()

    await wrapper.get('[data-test="department-form-name"] input').setValue('财务分析组')
    await wrapper.get('[data-test="department-form-code"] input').setValue('finance-analysis')
    await submitForm(wrapper)

    expect(createDepartmentMock).toHaveBeenLastCalledWith({
      name: '财务分析组',
      code: 'finance-analysis',
      parentId: secondRootDepartmentId,
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 0,
    })

    await wrapper.setProps({
      show: false,
      departmentId: null,
      parentId: secondRootDepartmentId,
    })
    await flushPromises()

    await wrapper.setProps({
      show: true,
      departmentId: null,
      parentId: rootDepartmentId,
    })
    await flushPromises()

    await wrapper.get('[data-test="department-form-name"] input').setValue('运营分析组')
    await wrapper.get('[data-test="department-form-code"] input').setValue('ops-analysis')
    await submitForm(wrapper)

    expect(createDepartmentMock).toHaveBeenLastCalledWith({
      name: '运营分析组',
      code: 'ops-analysis',
      parentId: rootDepartmentId,
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 0,
    })
  })

  it('loads department detail and submits updates in edit mode', async () => {
    getDepartmentMock.mockResolvedValue(childDepartmentResponse)
    updateDepartmentMock.mockResolvedValue({
      ...childDepartmentResponse,
      name: '运营管理部',
      status: DEPARTMENT_STATUS_DISABLED,
    })

    const wrapper = mountDrawer({
      show: true,
      departmentId: childDepartmentId,
      parentId: null,
    })
    await flushPromises()

    expect(getDepartmentTreeOptionsMock).toHaveBeenCalledWith([rootDepartmentId, childDepartmentId])
    expect(getDepartmentMock).toHaveBeenCalledWith(childDepartmentId)
    expect(wrapper.text()).toContain('编辑组织部门')

    await wrapper.get('[data-test="department-form-name"] input').setValue('运营管理部')
    wrapper.getComponent(NSelect).vm.$emit('update:value', DEPARTMENT_STATUS_DISABLED)
    await flushPromises()

    await submitForm(wrapper)

    expect(updateDepartmentMock).toHaveBeenCalledWith(childDepartmentId, {
      name: '运营管理部',
      code: 'ops',
      parentId: rootDepartmentId,
      status: DEPARTMENT_STATUS_DISABLED,
      sortOrder: 2,
    })
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })

  it('reloads detail when reopening the same department after save', async () => {
    getDepartmentMock
      .mockResolvedValueOnce(childDepartmentResponse)
      .mockResolvedValueOnce(updatedChildDepartmentResponse)
    updateDepartmentMock.mockResolvedValue(updatedChildDepartmentResponse)

    const wrapper = mountDrawer({
      show: true,
      departmentId: childDepartmentId,
      parentId: null,
    })
    await flushPromises()

    await wrapper.get('[data-test="department-form-name"] input').setValue('运营管理部')
    wrapper.getComponent(NSelect).vm.$emit('update:value', DEPARTMENT_STATUS_DISABLED)
    await submitForm(wrapper)

    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')).toEqual([[false]])

    await wrapper.setProps({
      show: false,
      departmentId: childDepartmentId,
      parentId: null,
    })
    await flushPromises()
    await wrapper.setProps({
      show: true,
      departmentId: childDepartmentId,
      parentId: null,
    })
    await flushPromises()

    expect(getDepartmentMock).toHaveBeenCalledTimes(2)
    expect(
      (wrapper.get('[data-test="department-form-name"] input').element as HTMLInputElement).value,
    ).toBe(updatedChildDepartmentResponse.name)
    expect(wrapper.getComponent(NSelect).props('value')).toBe(updatedChildDepartmentResponse.status)
  })

  it('shows a field-level server error when create fails', async () => {
    createDepartmentMock.mockRejectedValue(new ApiRequestError(409, '编码已存在', 'code'))

    const wrapper = mountDrawer({
      show: true,
      departmentId: null,
      parentId: null,
    })
    await flushPromises()

    await wrapper.get('[data-test="department-form-name"] input').setValue('运营中心')
    await wrapper.get('[data-test="department-form-code"] input').setValue('ops')
    await submitForm(wrapper)

    expect(createDepartmentMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('编码已存在')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('ignores stale mutation errors from a previous create session', async () => {
    const pendingCreate = deferred<Department>()
    createDepartmentMock.mockImplementationOnce(() => pendingCreate.promise)

    const wrapper = mountDrawer({
      show: true,
      departmentId: null,
      parentId: rootDepartmentId,
    })
    await flushPromises()

    await wrapper.get('[data-test="department-form-name"] input').setValue('旧会话')
    await wrapper.get('[data-test="department-form-code"] input').setValue('stale-dept')
    await submitForm(wrapper)

    expect(createDepartmentMock).toHaveBeenCalledTimes(1)

    await wrapper.setProps({
      show: false,
      departmentId: null,
      parentId: rootDepartmentId,
    })
    await flushPromises()
    await wrapper.setProps({
      show: true,
      departmentId: null,
      parentId: rootDepartmentId,
    })
    await flushPromises()

    await wrapper.get('[data-test="department-form-name"] input').setValue('新会话')
    await wrapper.get('[data-test="department-form-code"] input').setValue('fresh-dept')

    pendingCreate.reject(new ApiRequestError(400, '旧会话错误', 'code'))
    await flushPromises()

    const codeFieldContainer = wrapper
      .get('[data-test="department-form-code"]')
      .element.closest('.n-form-item')

    expect(codeFieldContainer?.textContent).not.toContain('旧会话错误')
    expect(wrapper.text()).not.toContain('旧会话错误')
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('update:show')).toBeUndefined()
  })

  it('does not submit while switching to another department that is still loading', async () => {
    const pendingDepartmentLoad = deferred<Department>()

    getDepartmentMock.mockImplementation((id: string) => {
      if (id === childDepartmentId) {
        return Promise.resolve(childDepartmentResponse)
      }

      if (id === siblingDepartmentId) {
        return pendingDepartmentLoad.promise
      }

      throw new Error(`Unexpected department id: ${id}`)
    })

    const wrapper = mountDrawer({
      show: true,
      departmentId: childDepartmentId,
      parentId: null,
    })
    await flushPromises()

    await wrapper.setProps({
      show: true,
      departmentId: siblingDepartmentId,
      parentId: null,
    })
    await flushPromises()

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(updateDepartmentMock).not.toHaveBeenCalled()

    pendingDepartmentLoad.resolve(siblingDepartmentResponse)
    await flushPromises()
  })

  it('does not close or emit saved when a stale create save resolves after parent switch', async () => {
    const pendingSave = deferred<Department>()

    createDepartmentMock.mockImplementation(() => pendingSave.promise)

    const wrapper = mountDrawer({
      show: true,
      departmentId: null,
      parentId: rootDepartmentId,
    })
    await flushPromises()

    await wrapper.get('[data-test="department-form-name"] input').setValue('商务组')
    await wrapper.get('[data-test="department-form-code"] input').setValue('biz')
    await submitForm(wrapper)

    expect(createDepartmentMock).toHaveBeenCalledWith({
      name: '商务组',
      code: 'biz',
      parentId: rootDepartmentId,
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 0,
    })

    await wrapper.setProps({
      show: true,
      departmentId: null,
      parentId: secondRootDepartmentId,
    })
    await flushPromises()

    pendingSave.resolve({
      ...childDepartmentResponse,
      id: '88888888-8888-4888-8888-888888888888',
      parentId: rootDepartmentId,
      name: '商务组',
      code: 'biz',
      sortOrder: 0,
    })
    await flushPromises()

    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('update:show')).toBeUndefined()
    expect(wrapper.props('show')).toBe(true)

    await wrapper.get('[data-test="department-form-name"] input').setValue('财务商务组')
    await wrapper.get('[data-test="department-form-code"] input').setValue('finance-biz')
    await submitForm(wrapper)

    expect(createDepartmentMock).toHaveBeenLastCalledWith({
      name: '财务商务组',
      code: 'finance-biz',
      parentId: secondRootDepartmentId,
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 0,
    })
  })
})
