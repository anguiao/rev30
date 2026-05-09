# Department Management Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete department management by wiring create, edit, create-child, delete, TreeSelect selection, and field-level department code errors.

**Architecture:** Keep the existing user/role management pattern. Server routes remain the source of truth for validation, while the client adds request helpers, a focused department form drawer, shared department TreeSelect option mapping, and page-level drawer/delete orchestration.

**Tech Stack:** Vue 3 Composition API, Naive UI, Pinia Colada, TanStack Vue Form, Hono typed client, zod schemas from `@rev30/shared`, Vitest, Hono route tests.

---

## File Structure

- Modify `apps/server/src/modules/system/departments/errors.ts`: make `DepartmentConflictError` expose `field: 'code'`.
- Modify `apps/server/src/modules/system/departments/routes.ts`: return field-level conflict JSON for department code conflicts.
- Modify `apps/server/__tests__/modules/system/departments/routes.test.ts`: assert conflict responses include `field: 'code'`.
- Modify `apps/client/src/features/system/requests.ts`: add `getDepartment`, `createDepartment`, `updateDepartment`, and `deleteDepartment`.
- Modify `apps/client/src/features/system/index.ts`: export the new department request helpers.
- Create `apps/client/src/features/system/departmentOptions.ts`: convert department trees to `NTreeSelect` options and disable the current department subtree.
- Modify `apps/client/src/features/system/UserFormDrawer.vue`: replace the department `NTree` with a multi-select `NTreeSelect`.
- Modify `apps/client/__tests__/features/system/UserFormDrawer.test.ts`: update assertions and interactions for `NTreeSelect`.
- Create `apps/client/src/features/system/DepartmentFormDrawer.vue`: drawer for create/edit department.
- Create `apps/client/__tests__/features/system/DepartmentFormDrawer.test.ts`: cover create, create-child, edit, disabled subtree, field errors, stale responses.
- Modify `apps/client/src/utils/ui.ts`: support disabled table action buttons.
- Modify `apps/client/src/pages/index/system/departments.vue`: wire drawer, save refresh, delete confirmation, disabled delete for rows with children.
- Modify `apps/client/__tests__/pages/system/departments.test.ts`: cover drawer opening, save refresh, delete success/failure, disabled delete.

## Task 1: Server Field-Level Department Code Errors

**Files:**

- Modify: `apps/server/src/modules/system/departments/errors.ts`
- Modify: `apps/server/src/modules/system/departments/routes.ts`
- Test: `apps/server/__tests__/modules/system/departments/routes.test.ts`

- [ ] **Step 1: Write the failing route test**

In `apps/server/__tests__/modules/system/departments/routes.test.ts`, update the duplicate code test to assert the `field` property for both create and update conflicts:

```ts
  it('rejects duplicate department codes on create and update', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    await createDepartment(app, { name: 'Engineering', code: 'engineering' })
    const { body: sales } = await createDepartment(app, { name: 'Sales', code: 'sales' })

    const createConflict = await createDepartment(app, { name: 'Duplicate', code: 'engineering' })
    expect(createConflict.response.status).toBe(409)
    expect(createConflict.body).toEqual({
      field: 'code',
      message: '部门编码已存在',
    })

    const updateConflict = await app.request(`/api/system/departments/${sales.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ code: 'engineering' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateConflict.status).toBe(409)
    expect(await updateConflict.json()).toEqual({
      field: 'code',
      message: '部门编码已存在',
    })
  })
```

- [ ] **Step 2: Run the server department test and verify it fails**

Run:

```bash
pnpm --filter @rev30/server test -- departments
```

Expected: the duplicate department code test fails because conflict responses only contain `{ message: '部门编码已存在' }`.

- [ ] **Step 3: Implement field-level department conflict errors**

In `apps/server/src/modules/system/departments/errors.ts`, import `FormFieldError` and make `DepartmentConflictError` extend it:

```ts
import { DrizzleQueryError } from 'drizzle-orm/errors'
import { FormFieldError } from '../../../common/errors'
import { POSTGRES_UNIQUE_VIOLATION_CODE } from '../../../db/errors'
```

Replace the class with:

```ts
export class DepartmentConflictError extends FormFieldError<'code'> {
  constructor() {
    super('部门编码已存在', 'code')
  }
}
```

In `apps/server/src/modules/system/departments/routes.ts`, split `DepartmentConflictError` handling from the other conflict types:

```ts
  if (error instanceof DepartmentConflictError) {
    return c.json({ field: error.field, message: error.message }, 409)
  }

  if (error instanceof DepartmentMoveConflictError || error instanceof DepartmentDeleteConflictError) {
    return c.json({ message: error.message }, 409)
  }
```

- [ ] **Step 4: Run the server department test and verify it passes**

Run:

```bash
pnpm --filter @rev30/server test -- departments
```

Expected: all department route tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/system/departments/errors.ts apps/server/src/modules/system/departments/routes.ts apps/server/__tests__/modules/system/departments/routes.test.ts
git commit -m "fix: return department code field errors"
```

## Task 2: Department Request Helpers

**Files:**

- Modify: `apps/client/src/features/system/requests.ts`
- Modify: `apps/client/src/features/system/index.ts`
- Test: `apps/client/__tests__/features/system/requests.test.ts`

- [ ] **Step 1: Write failing request helper tests**

In `apps/client/__tests__/features/system/requests.test.ts`, add `createDepartment`, `deleteDepartment`, `getDepartment`, and `updateDepartment` to the import from `../../../src/features/system`.

Add this test before the resource tree test:

```ts
  it('sends department detail, create, update, and delete requests', async () => {
    const departmentResponse = {
      id: '22222222-2222-4222-8222-222222222222',
      parentId: null,
      name: '总部',
      code: 'hq',
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 1,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    }
    const updatedDepartmentResponse = {
      ...departmentResponse,
      name: '研发中心',
      code: 'eng',
      sortOrder: 2,
      updatedAt: '2026-05-02T00:00:00.000Z',
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(departmentResponse)))
      .mockResolvedValueOnce(new Response(JSON.stringify(departmentResponse), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(updatedDepartmentResponse)))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    const department = await getDepartment('22222222-2222-4222-8222-222222222222')
    const created = await createDepartment({
      name: '总部',
      code: 'hq',
      parentId: null,
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 1,
    })
    const updated = await updateDepartment('22222222-2222-4222-8222-222222222222', {
      name: '研发中心',
      code: 'eng',
      parentId: null,
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 2,
    })
    await deleteDepartment('22222222-2222-4222-8222-222222222222')

    expect(department.code).toBe('hq')
    expect(created.name).toBe('总部')
    expect(updated.code).toBe('eng')
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/api/system/departments/22222222-2222-4222-8222-222222222222',
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/system/departments',
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/system/departments/22222222-2222-4222-8222-222222222222',
      expect.objectContaining({
        method: 'PATCH',
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/system/departments/22222222-2222-4222-8222-222222222222',
      expect.objectContaining({
        method: 'DELETE',
      }),
    )
  })
```

Add this test after the existing field-name error test:

```ts
  it('parses department code conflict field errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ field: 'code', message: '部门编码已存在' }), {
        status: 409,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      createDepartment({
        name: '重复部门',
        code: 'hq',
        parentId: null,
        status: DEPARTMENT_STATUS_ENABLED,
        sortOrder: 0,
      }),
    ).rejects.toMatchObject({
      status: 409,
      field: 'code',
      message: '部门编码已存在',
    })
  })
```

- [ ] **Step 2: Run the request helper test and verify it fails**

Run:

```bash
pnpm --filter @rev30/client test -- requests
```

Expected: TypeScript or Vitest fails because the department helper functions are not exported.

- [ ] **Step 3: Implement request helpers**

In `apps/client/src/features/system/requests.ts`, import department types and schema:

```ts
  departmentSchema,
  type Department,
  type DepartmentCreateInput,
  type DepartmentUpdateInput,
```

Add helper functions below `getDepartmentTree`:

```ts
export async function getDepartment(id: string): Promise<Department> {
  return parseSystemResponse(
    await api.system.departments[':id'].$get({ param: { id } }),
    departmentSchema,
  )
}

export async function createDepartment(input: DepartmentCreateInput): Promise<Department> {
  return parseSystemResponse(
    await api.system.departments.$post({ json: input }),
    departmentSchema,
  )
}

export async function updateDepartment(
  id: string,
  input: DepartmentUpdateInput,
): Promise<Department> {
  return parseSystemResponse(
    await api.system.departments[':id'].$patch({
      param: { id },
      json: input,
    }),
    departmentSchema,
  )
}

export async function deleteDepartment(id: string): Promise<void> {
  const response = await api.system.departments[':id'].$delete({ param: { id } })

  if (!response.ok) {
    throw await parseSystemError(response)
  }
}
```

In `apps/client/src/features/system/index.ts`, export the new helpers:

```ts
  createDepartment,
  deleteDepartment,
  getDepartment,
  updateDepartment,
```

- [ ] **Step 4: Run the request helper test and verify it passes**

Run:

```bash
pnpm --filter @rev30/client test -- requests
```

Expected: request helper tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/system/requests.ts apps/client/src/features/system/index.ts apps/client/__tests__/features/system/requests.test.ts
git commit -m "feat: add department request helpers"
```

## Task 3: Shared Department TreeSelect Options and User Drawer Migration

**Files:**

- Create: `apps/client/src/features/system/departmentOptions.ts`
- Modify: `apps/client/src/features/system/UserFormDrawer.vue`
- Test: `apps/client/__tests__/features/system/UserFormDrawer.test.ts`

- [ ] **Step 1: Write failing UserFormDrawer TreeSelect test changes**

In `apps/client/__tests__/features/system/UserFormDrawer.test.ts`, replace `NTree` import with `NTreeSelect`:

```ts
import { NSelect, NTreeSelect } from 'naive-ui'
```

In the create-mode test, replace the tree assertion with:

```ts
    const departmentTreeSelect = wrapper.getComponent(NTreeSelect)
    expect(departmentTreeSelect.props('multiple')).toBe(true)
    expect(departmentTreeSelect.props('checkable')).toBe(true)
    expect(departmentTreeSelect.props('cascade')).toBe(true)
    expect(departmentTreeSelect.props('clearable')).toBe(true)
    expect(departmentTreeSelect.props('filterable')).toBe(true)
    expect(departmentTreeSelect.props('options')).toEqual([
      {
        key: departmentId,
        label: '研发部 (rd)',
        children: [
          {
            key: secondDepartmentId,
            label: '前端组 (frontend)',
          },
        ],
      },
    ])
```

In the edit-mode test, replace `NTree` assertions and interactions with:

```ts
    const departmentTreeSelect = wrapper.getComponent(NTreeSelect)
    expect(departmentTreeSelect.props('options')).toEqual([
      {
        key: departmentId,
        label: '研发部 (rd)',
        children: [
          {
            key: secondDepartmentId,
            label: '前端组 (frontend)',
          },
        ],
      },
    ])
    expect(departmentTreeSelect.props('value')).toEqual([departmentId])

    await wrapper.get('[data-test="user-form-nickname"] input').setValue('Ada Lovelace')
    departmentTreeSelect.vm.$emit('update:value', [secondDepartmentId])
    wrapper
      .get('[data-test="user-form-roles"]')
      .getComponent(NSelect)
      .vm.$emit('update:value', [secondRoleId])
```

- [ ] **Step 2: Run the UserFormDrawer test and verify it fails**

Run:

```bash
pnpm --filter @rev30/client test -- UserFormDrawer
```

Expected: tests fail because `UserFormDrawer.vue` still renders `NTree`.

- [ ] **Step 3: Implement the department option helper**

Create `apps/client/src/features/system/departmentOptions.ts`:

```ts
import type { DepartmentTreeNode } from '@rev30/shared'
import type { TreeSelectOption } from 'naive-ui'

type DepartmentTreeSelectOptions = {
  disabledDepartmentId?: string
}

function toDepartmentTreeSelectOptionsInternal(
  nodes: DepartmentTreeNode[],
  options: DepartmentTreeSelectOptions = {},
  inheritedDisabled = false,
): TreeSelectOption[] {
  const disabledDepartmentId = options.disabledDepartmentId

  return nodes.map((node) => {
    const disabled = inheritedDisabled || node.id === disabledDepartmentId
    const option: TreeSelectOption = {
      key: node.id,
      label: `${node.name} (${node.code})`,
      ...(disabled ? { disabled: true } : {}),
    }

    if (node.children.length > 0) {
      option.children = toDepartmentTreeSelectOptionsInternal(node.children, options, disabled)
    }

    return option
  })
}

export function toDepartmentTreeSelectOptions(
  nodes: DepartmentTreeNode[],
  options: DepartmentTreeSelectOptions = {},
): TreeSelectOption[] {
  return toDepartmentTreeSelectOptionsInternal(nodes, options)
}
```

- [ ] **Step 4: Replace the user department tree with NTreeSelect**

In `apps/client/src/features/system/UserFormDrawer.vue`, replace `NTree` with `NTreeSelect` in the import list:

```ts
  NTreeSelect,
  type TreeSelectOption,
```

Import the helper:

```ts
import { toDepartmentTreeSelectOptions } from './departmentOptions'
```

Replace the computed department options:

```ts
const departmentTreeOptions = computed<TreeSelectOption[]>(() =>
  toDepartmentTreeSelectOptions(formData.value?.departments ?? []),
)
```

Delete the local `toDepartmentTreeOptions` function.

Replace the template field:

```vue
          <form.Field name="departmentIds" v-slot="{ field, state }">
            <NFormItem
              label="所属部门"
              v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
            >
              <NTreeSelect
                data-test="user-form-departments"
                multiple
                checkable
                cascade
                clearable
                filterable
                default-expand-all
                max-tag-count="responsive"
                :options="departmentTreeOptions"
                :value="state.value"
                placeholder="请选择所属部门"
                @update:value="
                  (value) => {
                    field.handleChange(Array.isArray(value) ? value.map(String) : [])
                  }
                "
              />
            </NFormItem>
          </form.Field>
```

- [ ] **Step 5: Run the UserFormDrawer test and verify it passes**

Run:

```bash
pnpm --filter @rev30/client test -- UserFormDrawer
```

Expected: UserFormDrawer tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/features/system/departmentOptions.ts apps/client/src/features/system/UserFormDrawer.vue apps/client/__tests__/features/system/UserFormDrawer.test.ts
git commit -m "refactor: use tree select for user departments"
```

## Task 4: Department Form Drawer

**Files:**

- Create: `apps/client/src/features/system/DepartmentFormDrawer.vue`
- Test: `apps/client/__tests__/features/system/DepartmentFormDrawer.test.ts`

- [ ] **Step 1: Write failing DepartmentFormDrawer tests**

Create `apps/client/__tests__/features/system/DepartmentFormDrawer.test.ts`:

```ts
// @vitest-environment happy-dom

import { PiniaColada } from '@pinia/colada'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NInputNumber, NSelect, NTreeSelect } from 'naive-ui'
import {
  DEPARTMENT_STATUS_DISABLED,
  DEPARTMENT_STATUS_ENABLED,
  type Department,
  type DepartmentTreeNode,
} from '@rev30/shared'
import { createPinia, setActivePinia } from 'pinia'
import {
  createDepartment,
  getDepartment,
  getDepartmentTree,
  SystemRequestError,
  updateDepartment,
} from '../../../src/features/system'
import DepartmentFormDrawer from '../../../src/features/system/DepartmentFormDrawer.vue'

enableAutoUnmount(afterEach)

vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  createDepartment: vi.fn(),
  getDepartment: vi.fn(),
  getDepartmentTree: vi.fn(),
  updateDepartment: vi.fn(),
}))

const createDepartmentMock = vi.mocked(createDepartment)
const getDepartmentMock = vi.mocked(getDepartment)
const getDepartmentTreeMock = vi.mocked(getDepartmentTree)
const updateDepartmentMock = vi.mocked(updateDepartment)

const rootDepartmentId = '11111111-1111-4111-8111-111111111111'
const childDepartmentId = '22222222-2222-4222-8222-222222222222'
const secondDepartmentId = '33333333-3333-4333-8333-333333333333'

const departmentTreeResponse: DepartmentTreeNode[] = [
  {
    id: rootDepartmentId,
    parentId: null,
    name: '研发中心',
    code: 'eng',
    status: DEPARTMENT_STATUS_ENABLED,
    sortOrder: 1,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    children: [
      {
        id: childDepartmentId,
        parentId: rootDepartmentId,
        name: '平台架构组',
        code: 'arch',
        status: DEPARTMENT_STATUS_ENABLED,
        sortOrder: 2,
        createdAt: '2026-05-02T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
        children: [],
      },
    ],
  },
]

const departmentResponse: Department = {
  id: childDepartmentId,
  parentId: rootDepartmentId,
  name: '平台架构组',
  code: 'arch',
  status: DEPARTMENT_STATUS_DISABLED,
  sortOrder: 2,
  createdAt: '2026-05-02T00:00:00.000Z',
  updatedAt: '2026-05-02T00:00:00.000Z',
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

function mountDrawer(props = { show: true, departmentId: null as string | null, parentId: null as string | null }) {
  const pinia = createPinia()
  setActivePinia(pinia)

  return mount(DepartmentFormDrawer, {
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
  await wrapper.get('[data-test="department-form-submit"]').trigger('click')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('DepartmentFormDrawer', () => {
  beforeEach(() => {
    createDepartmentMock.mockReset()
    getDepartmentMock.mockReset()
    getDepartmentTreeMock.mockReset()
    updateDepartmentMock.mockReset()
    getDepartmentTreeMock.mockResolvedValue(departmentTreeResponse)
  })

  it('submits a new top-level department in create mode', async () => {
    createDepartmentMock.mockResolvedValue({
      ...departmentResponse,
      id: secondDepartmentId,
      parentId: null,
      name: '运营中心',
      code: 'ops',
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 3,
    })

    const wrapper = mountDrawer()
    await flushPromises()

    expect(wrapper.text()).toContain('新增部门')
    expect(getDepartmentTreeMock).toHaveBeenCalledTimes(1)
    expect(getDepartmentMock).not.toHaveBeenCalled()

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

  it('preselects the upper department when creating a child department', async () => {
    createDepartmentMock.mockResolvedValue({
      ...departmentResponse,
      name: '前端组',
      code: 'web',
      parentId: rootDepartmentId,
    })

    const wrapper = mountDrawer({ show: true, departmentId: null, parentId: rootDepartmentId })
    await flushPromises()

    expect(wrapper.getComponent(NTreeSelect).props('value')).toBe(rootDepartmentId)

    await wrapper.get('[data-test="department-form-name"] input').setValue('前端组')
    await wrapper.get('[data-test="department-form-code"] input').setValue('web')
    await submitForm(wrapper)

    expect(createDepartmentMock).toHaveBeenCalledWith({
      name: '前端组',
      code: 'web',
      parentId: rootDepartmentId,
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 0,
    })
  })

  it('loads department detail and submits updates in edit mode', async () => {
    getDepartmentMock.mockResolvedValue(departmentResponse)
    updateDepartmentMock.mockResolvedValue({ ...departmentResponse, name: '平台工程组' })

    const wrapper = mountDrawer({ show: true, departmentId: childDepartmentId, parentId: null })
    await flushPromises()

    expect(wrapper.text()).toContain('编辑部门')
    expect(getDepartmentTreeMock).toHaveBeenCalledTimes(1)
    expect(getDepartmentMock).toHaveBeenCalledWith(childDepartmentId)
    expect(wrapper.getComponent(NTreeSelect).props('value')).toBe(rootDepartmentId)
    expect(wrapper.getComponent(NTreeSelect).props('options')).toEqual([
      {
        key: rootDepartmentId,
        label: '研发中心 (eng)',
        children: [
          {
            key: childDepartmentId,
            label: '平台架构组 (arch)',
            disabled: true,
          },
        ],
      },
    ])

    await wrapper.get('[data-test="department-form-name"] input').setValue('平台工程组')
    wrapper.getComponent(NSelect).vm.$emit('update:value', DEPARTMENT_STATUS_ENABLED)
    await flushPromises()

    await submitForm(wrapper)

    expect(updateDepartmentMock).toHaveBeenCalledWith(childDepartmentId, {
      name: '平台工程组',
      code: 'arch',
      parentId: rootDepartmentId,
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 2,
    })
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })

  it('shows a field-level server error when the department code is duplicated', async () => {
    createDepartmentMock.mockRejectedValue(new SystemRequestError(409, '部门编码已存在', 'code'))

    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="department-form-name"] input').setValue('总部')
    await wrapper.get('[data-test="department-form-code"] input').setValue('hq')
    await submitForm(wrapper)

    expect(createDepartmentMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('部门编码已存在')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('does not submit while switching to a department that is still loading', async () => {
    const pendingDepartmentLoad = deferred<Department>()
    getDepartmentMock.mockImplementation((id: string) => {
      if (id === childDepartmentId) {
        return Promise.resolve(departmentResponse)
      }

      if (id === secondDepartmentId) {
        return pendingDepartmentLoad.promise
      }

      throw new Error(`Unexpected department id: ${id}`)
    })

    const wrapper = mountDrawer({ show: true, departmentId: childDepartmentId, parentId: null })
    await flushPromises()

    await wrapper.setProps({ show: true, departmentId: secondDepartmentId, parentId: null })
    await flushPromises()

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(updateDepartmentMock).not.toHaveBeenCalled()

    pendingDepartmentLoad.resolve({
      ...departmentResponse,
      id: secondDepartmentId,
      name: '数据平台组',
      code: 'data',
      parentId: rootDepartmentId,
    })
    await flushPromises()
  })

  it('does not emit saved or close the current drawer when a stale create save resolves', async () => {
    const pendingSave = deferred<Department>()
    createDepartmentMock.mockReturnValue(pendingSave.promise)

    const wrapper = mountDrawer({ show: true, departmentId: null, parentId: rootDepartmentId })
    await flushPromises()

    await wrapper.get('[data-test="department-form-name"] input').setValue('前端组')
    await wrapper.get('[data-test="department-form-code"] input').setValue('web')
    await submitForm(wrapper)

    expect(createDepartmentMock).toHaveBeenCalledWith({
      name: '前端组',
      code: 'web',
      parentId: rootDepartmentId,
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 0,
    })

    await wrapper.setProps({ show: true, departmentId: null, parentId: secondDepartmentId })
    await flushPromises()

    expect(wrapper.getComponent(NTreeSelect).props('value')).toBe(secondDepartmentId)

    pendingSave.resolve({
      ...departmentResponse,
      name: '前端组',
      code: 'web',
      parentId: rootDepartmentId,
    })
    await flushPromises()

    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('update:show')).toBeUndefined()
    expect(wrapper.props('show')).toBe(true)
    expect(wrapper.getComponent(NTreeSelect).props('value')).toBe(secondDepartmentId)
  })
})
```

- [ ] **Step 2: Run the new drawer test and verify it fails**

Run:

```bash
pnpm --filter @rev30/client test -- DepartmentFormDrawer
```

Expected: Vitest fails because `DepartmentFormDrawer.vue` does not exist.

- [ ] **Step 3: Implement DepartmentFormDrawer**

Create `apps/client/src/features/system/DepartmentFormDrawer.vue`:

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMutation, useQuery } from '@pinia/colada'
import { useForm } from '@tanstack/vue-form'
import { pick } from 'lodash-es'
import {
  NAlert,
  NButton,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSelect,
  NTreeSelect,
  type TreeSelectOption,
} from 'naive-ui'
import {
  DEPARTMENT_STATUS_ENABLED,
  departmentCreateSchema,
  departmentFormSchema,
  departmentUpdateSchema,
  type Department,
  type DepartmentFormInput,
} from '@rev30/shared'
import {
  SystemRequestError,
  createDepartment,
  getDepartment,
  getDepartmentTree,
  getSystemErrorMessage,
  updateDepartment,
} from '.'
import { statusSelectOptions } from './labels'
import { toDepartmentTreeSelectOptions } from './departmentOptions'
import { formItemValidationProps, setServerFieldError } from '../../utils/form'

const props = defineProps<{
  departmentId: string | null
  parentId: string | null
}>()

const show = defineModel<boolean>('show', { required: true })

const emit = defineEmits<{
  saved: []
}>()

const drawerTitle = computed(() => (props.departmentId === null ? '新增部门' : '编辑部门'))

function createDefaultFormValues(parentId: string | null): DepartmentFormInput {
  return {
    name: '',
    code: '',
    parentId,
    status: DEPARTMENT_STATUS_ENABLED,
    sortOrder: 0,
  }
}

const {
  data: formData,
  error: formLoadError,
  isLoading,
} = useQuery({
  key: () => ['system', 'department-form', props.departmentId ?? 'create', props.parentId ?? 'root'],
  enabled: () => show.value,
  async query() {
    const departmentId = props.departmentId
    const [departments, department] = await Promise.all([
      getDepartmentTree(),
      departmentId === null ? null : getDepartment(departmentId),
    ])

    return {
      departments,
      formValues:
        department === null
          ? createDefaultFormValues(props.parentId)
          : toDepartmentFormValues(department),
    }
  },
})

const departmentTreeOptions = computed<TreeSelectOption[]>(() =>
  toDepartmentTreeSelectOptions(formData.value?.departments ?? [], {
    disabledDepartmentId: props.departmentId ?? undefined,
  }),
)
const loadError = computed(() =>
  isLoading.value || formLoadError.value === null
    ? null
    : getSystemErrorMessage(formLoadError.value, '加载部门表单失败'),
)

const formError = ref<string | null>(null)

const form = useForm({
  defaultValues: createDefaultFormValues(null),
  validators: {
    onSubmit: departmentFormSchema,
  },
  onSubmit({ value }) {
    const departmentId = props.departmentId
    const parentId = props.parentId

    formError.value = null
    saveDepartmentMutation.mutate({ departmentId, parentId, value })
  },
})

const { isLoading: isSaving, ...saveDepartmentMutation } = useMutation({
  mutation: ({
    departmentId,
    value,
  }: {
    departmentId: string | null
    parentId: string | null
    value: DepartmentFormInput
  }) =>
    departmentId === null
      ? createDepartment(departmentCreateSchema.parse(value))
      : updateDepartment(departmentId, departmentUpdateSchema.parse(value)),
  onSuccess(_, { departmentId, parentId }) {
    if (!show.value || props.departmentId !== departmentId || props.parentId !== parentId) {
      return
    }

    emit('saved')
    show.value = false
  },
  onError(error, { departmentId, parentId }) {
    if (!show.value || props.departmentId !== departmentId || props.parentId !== parentId) {
      return
    }

    if (
      error instanceof SystemRequestError &&
      setServerFieldError(form, error.field, error.message)
    ) {
      return
    }

    formError.value = getSystemErrorMessage(error, '保存部门失败')
  },
})

function handleSubmit() {
  if (isLoading.value || isSaving.value || loadError.value) {
    return
  }

  void form.handleSubmit()
}

watch(
  () => [show.value, props.departmentId, props.parentId] as const,
  ([isVisible, departmentId, parentId]) => {
    if (!isVisible) {
      return
    }

    saveDepartmentMutation.reset()
    formError.value = null
    form.reset(departmentId === null ? createDefaultFormValues(parentId) : createDefaultFormValues(null))
  },
  {
    immediate: true,
  },
)

watch(
  () => [show.value, formData.value?.formValues] as const,
  ([isVisible, formValues]) => {
    if (!isVisible || formValues === undefined) {
      return
    }

    form.reset(formValues)
  },
  {
    immediate: true,
  },
)

function toDepartmentFormValues(department: Department): DepartmentFormInput {
  return {
    ...pick(department, ['name', 'code', 'parentId', 'status', 'sortOrder']),
  }
}
</script>

<template>
  <NDrawer v-model:show="show" placement="right" :width="520">
    <NDrawerContent :title="drawerTitle" closable>
      <div class="flex flex-col gap-4">
        <NAlert v-if="loadError" type="error" :show-icon="false">
          {{ loadError }}
        </NAlert>

        <NAlert v-if="formError" type="error" :show-icon="false">
          {{ formError }}
        </NAlert>

        <NForm @submit.prevent="handleSubmit">
          <form.Field name="name" v-slot="{ field, state }">
            <NFormItem
              label="部门名称"
              v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
            >
              <NInput
                data-test="department-form-name"
                :value="state.value"
                placeholder="请输入部门名称"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="code" v-slot="{ field, state }">
            <NFormItem
              label="部门编码"
              v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
            >
              <NInput
                data-test="department-form-code"
                :value="state.value"
                placeholder="请输入部门编码"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="parentId" v-slot="{ field, state }">
            <NFormItem
              label="上级部门"
              v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
            >
              <NTreeSelect
                data-test="department-form-parent"
                clearable
                filterable
                default-expand-all
                :options="departmentTreeOptions"
                :value="state.value"
                placeholder="请选择上级部门"
                @update:value="
                  (value) => {
                    field.handleChange(typeof value === 'string' ? value : null)
                  }
                "
              />
            </NFormItem>
          </form.Field>

          <form.Field name="status" v-slot="{ field, state }">
            <NFormItem
              label="状态"
              v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
            >
              <NSelect
                data-test="department-form-status"
                :value="state.value"
                :options="statusSelectOptions"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="sortOrder" v-slot="{ field, state }">
            <NFormItem
              label="排序"
              v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
            >
              <NInputNumber
                data-test="department-form-sort-order"
                class="w-full"
                :value="state.value"
                :precision="0"
                :show-button="false"
                placeholder="请输入排序"
                @blur="field.handleBlur"
                @update:value="field.handleChange($event ?? 0)"
              />
            </NFormItem>
          </form.Field>

          <div class="flex justify-end">
            <NButton
              data-test="department-form-submit"
              type="primary"
              attr-type="submit"
              :loading="isSaving"
              :disabled="isLoading || !!loadError"
            >
              保存
            </NButton>
          </div>
        </NForm>
      </div>
    </NDrawerContent>
  </NDrawer>
</template>
```

- [ ] **Step 4: Run the drawer test and verify it passes**

Run:

```bash
pnpm --filter @rev30/client test -- DepartmentFormDrawer
```

Expected: DepartmentFormDrawer tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/system/DepartmentFormDrawer.vue apps/client/__tests__/features/system/DepartmentFormDrawer.test.ts
git commit -m "feat: add department form drawer"
```

## Task 5: Departments Page CRUD Wiring

**Files:**

- Modify: `apps/client/src/utils/ui.ts`
- Modify: `apps/client/src/pages/index/system/departments.vue`
- Test: `apps/client/__tests__/pages/system/departments.test.ts`

- [ ] **Step 1: Write failing page tests**

In `apps/client/__tests__/pages/system/departments.test.ts`, add these imports:

```ts
import { defineComponent, h } from 'vue'
import { NButton, NDataTable, NPagination, NSelect } from 'naive-ui'
import { deleteDepartment, formatDateTime, getDepartmentTree } from '../../../src/features/system'
```

Mock the drawer before the feature-system mock:

```ts
vi.mock('../../../src/features/system/DepartmentFormDrawer.vue', () => ({
  default: defineComponent({
    name: 'DepartmentFormDrawerStub',
    props: {
      show: {
        type: Boolean,
        required: true,
      },
      departmentId: {
        type: String,
        default: null,
      },
      parentId: {
        type: String,
        default: null,
      },
    },
    emits: ['update:show', 'saved'],
    setup(props) {
      return () =>
        h('div', {
          'data-department-id': props.departmentId ?? '',
          'data-parent-id': props.parentId ?? '',
          'data-show': String(props.show),
          'data-test': 'department-form-drawer',
        })
    },
  }),
}))
```

Add `deleteDepartment` to the feature mock and reset it in `beforeEach`:

```ts
  deleteDepartment: vi.fn(),
```

```ts
const deleteDepartmentMock = vi.mocked(deleteDepartment)
```

```ts
    deleteDepartmentMock.mockReset()
```

Add these tests near the existing action permission test:

```ts
  it('opens create, child create, and edit drawers', async () => {
    getDepartmentTreeMock.mockResolvedValue(departmentTreeResponse)
    const { wrapper } = await mountDepartmentsPage([
      'system:department:create',
      'system:department:update',
      'system:department:list',
    ])
    await flushPromises()

    await wrapper.get('[data-test="departments-create"]').trigger('click')
    await flushPromises()

    let drawer = wrapper.get('[data-test="department-form-drawer"]')
    expect(drawer.attributes('data-show')).toBe('true')
    expect(drawer.attributes('data-department-id')).toBe('')
    expect(drawer.attributes('data-parent-id')).toBe('')

    await wrapper.get('[data-test="departments-create-child"]').trigger('click')
    await flushPromises()

    drawer = wrapper.get('[data-test="department-form-drawer"]')
    expect(drawer.attributes('data-show')).toBe('true')
    expect(drawer.attributes('data-department-id')).toBe('')
    expect(drawer.attributes('data-parent-id')).toBe(departmentTreeResponse[0]!.id)

    await wrapper.get('[data-test="departments-edit"]').trigger('click')
    await flushPromises()

    drawer = wrapper.get('[data-test="department-form-drawer"]')
    expect(drawer.attributes('data-show')).toBe('true')
    expect(drawer.attributes('data-department-id')).toBe(departmentTreeResponse[0]!.id)
    expect(drawer.attributes('data-parent-id')).toBe('')
  })

  it('shows a success message and refreshes after the department drawer saves', async () => {
    getDepartmentTreeMock.mockResolvedValue(departmentTreeResponse)
    const { wrapper } = await mountDepartmentsPage(['system:department:create'])
    await flushPromises()

    await wrapper.get('[data-test="departments-create"]').trigger('click')
    await flushPromises()
    wrapper.getComponent({ name: 'DepartmentFormDrawerStub' }).vm.$emit('saved')
    await flushPromises()

    expect(getDepartmentTreeMock).toHaveBeenCalledTimes(2)
    expect(document.body.textContent).toContain('保存部门成功')
  })

  it('disables row delete when a department has children', async () => {
    getDepartmentTreeMock.mockResolvedValue(departmentTreeResponse)
    const { wrapper } = await mountDepartmentsPage(['system:department:delete'])
    await flushPromises()

    const deleteButtons = wrapper.findAll('[data-test="departments-delete"]')
    expect(deleteButtons).toHaveLength(3)
    expect(deleteButtons[0]!.attributes('disabled')).toBeDefined()

    await deleteButtons[0]!.trigger('click')
    await flushPromises()

    expect(document.body.querySelector('[data-test="departments-delete-confirm"]')).toBeNull()
    expect(deleteDepartmentMock).not.toHaveBeenCalled()
  })

  it('deletes a leaf department after confirmation and refreshes the tree', async () => {
    const leafDepartment = departmentTreeResponse[0]!.children[0]!
    getDepartmentTreeMock.mockResolvedValue(departmentTreeResponse)
    deleteDepartmentMock.mockResolvedValue(undefined)

    const { wrapper } = await mountDepartmentsPage(['system:department:delete'])
    await flushPromises()

    const deleteButtons = wrapper.findAll('[data-test="departments-delete"]')
    await deleteButtons[1]!.trigger('click')
    await flushPromises()

    const confirmButton = document.body.querySelector(
      '[data-test="departments-delete-confirm"]',
    ) as HTMLButtonElement | null

    expect(confirmButton).not.toBeNull()

    confirmButton?.click()
    await flushPromises()

    expect(deleteDepartmentMock).toHaveBeenCalledWith(leafDepartment.id)
    expect(getDepartmentTreeMock).toHaveBeenCalledTimes(2)
    expect(document.body.textContent).toContain('删除部门成功')
  })

  it('keeps delete dialog open when deleting department fails', async () => {
    deleteDepartmentMock.mockRejectedValue(new Error('部门存在关联用户，不能删除'))
    getDepartmentTreeMock.mockResolvedValue(departmentTreeResponse)

    const { wrapper } = await mountDepartmentsPage(['system:department:delete'])
    await flushPromises()

    const deleteButtons = wrapper.findAll('[data-test="departments-delete"]')
    await deleteButtons[1]!.trigger('click')
    await flushPromises()

    const confirmButton = document.body.querySelector(
      '[data-test="departments-delete-confirm"]',
    ) as HTMLButtonElement | null

    expect(confirmButton).not.toBeNull()

    confirmButton?.click()
    await flushPromises()

    expect(deleteDepartmentMock).toHaveBeenCalledWith(departmentTreeResponse[0]!.children[0]!.id)
    expect(getDepartmentTreeMock).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('部门存在关联用户，不能删除')
    expect(document.body.querySelector('[data-test="departments-delete-confirm"]')).not.toBeNull()
  })
```

- [ ] **Step 2: Run the departments page test and verify it fails**

Run:

```bash
pnpm --filter @rev30/client test -- departments
```

Expected: tests fail because page actions are not wired and `renderTableActionButton` does not support disabled.

- [ ] **Step 3: Add disabled support to table action buttons**

In `apps/client/src/utils/ui.ts`, add `disabled` to `TableActionOptions`:

```ts
  disabled?: boolean
```

Destructure it:

```ts
  disabled = false,
```

Pass it to `NButton`:

```ts
      disabled,
```

- [ ] **Step 4: Wire department page actions**

In `apps/client/src/pages/index/system/departments.vue`, import drawer, dialog, message, and delete helper:

```ts
import type { ButtonProps } from 'naive-ui'
import {
  NAlert,
  NButton,
  NDataTable,
  NFlex,
  NInput,
  NSelect,
  NTag,
  useDialog,
  useMessage,
} from 'naive-ui'
import DepartmentFormDrawer from '../../../features/system/DepartmentFormDrawer.vue'
```

Add `deleteDepartment` to the feature imports.

Create message/dialog instances:

```ts
const message = useMessage()
const dialog = useDialog()
```

Destructure `refetch` from `useQuery`:

```ts
  refetch: refetchDepartments,
```

Add drawer state and handlers before `columns`:

```ts
const isDepartmentDrawerVisible = ref(false)
const editingDepartmentId = ref<string | null>(null)
const selectedParentDepartmentId = ref<string | null>(null)

function openDepartmentFormDrawer(departmentId: string | null = null, parentId: string | null = null) {
  editingDepartmentId.value = departmentId
  selectedParentDepartmentId.value = parentId
  isDepartmentDrawerVisible.value = true
}

async function handleDepartmentSaved() {
  message.success('保存部门成功')
  await refetchDepartments()
}

function confirmDeleteDepartment(department: DepartmentTreeNode) {
  if (department.children.length > 0) {
    return
  }

  const positiveButtonProps: ButtonProps & Record<string, unknown> = {
    type: 'error',
    'data-test': 'departments-delete-confirm',
  }

  dialog.warning({
    title: '确认删除',
    content: `确定删除部门“${department.name}”吗？`,
    positiveText: '删除',
    negativeText: '取消',
    positiveButtonProps,
    async onPositiveClick() {
      try {
        await deleteDepartment(department.id)

        message.success('删除部门成功')
        await refetchDepartments()
      } catch (error) {
        message.error(getSystemErrorMessage(error, '删除部门失败'))
        return false
      }
    },
  })
}
```

Update the action column render function:

```ts
    render: (department) =>
      renderTableActions([
        renderTableActionButton({
          label: '新增下级',
          accessCode: 'system:department:create',
          onClick: () => openDepartmentFormDrawer(null, department.id),
          testId: 'departments-create-child',
        }),
        renderTableActionButton({
          label: '编辑',
          accessCode: ['system:department:update', 'system:department:list'],
          onClick: () => openDepartmentFormDrawer(department.id),
          testId: 'departments-edit',
        }),
        renderTableActionButton({
          label: '删除',
          accessCode: 'system:department:delete',
          disabled: department.children.length > 0,
          onClick: () => confirmDeleteDepartment(department),
          type: 'error',
          testId: 'departments-delete',
        }),
      ]),
```

Update the create button:

```vue
      <NButton
        v-can="'system:department:create'"
        data-test="departments-create"
        type="primary"
        @click="openDepartmentFormDrawer()"
      >
        新增部门
      </NButton>
```

Render the drawer at the end of the template:

```vue
    <DepartmentFormDrawer
      v-model:show="isDepartmentDrawerVisible"
      :department-id="editingDepartmentId"
      :parent-id="selectedParentDepartmentId"
      @saved="handleDepartmentSaved"
    />
```

- [ ] **Step 5: Run the departments page test and verify it passes**

Run:

```bash
pnpm --filter @rev30/client test -- departments
```

Expected: departments page tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/utils/ui.ts apps/client/src/pages/index/system/departments.vue apps/client/__tests__/pages/system/departments.test.ts
git commit -m "feat: complete department management page"
```

## Task 6: Focused and Full Verification

**Files:**

- No source changes expected.

- [ ] **Step 1: Run focused client tests**

Run:

```bash
pnpm --filter @rev30/client test -- requests UserFormDrawer DepartmentFormDrawer departments
```

Expected: all selected client tests pass.

- [ ] **Step 2: Run focused server tests**

Run:

```bash
pnpm --filter @rev30/server test -- departments
```

Expected: all selected server tests pass.

- [ ] **Step 3: Run full project verification**

Run:

```bash
pnpm check
```

Expected: format check, lint check, deprecated API check, typecheck, all tests, and build pass.

- [ ] **Step 4: Inspect git status**

Run:

```bash
git status --short --branch
```

Expected: current branch contains only intentional commits for this implementation and no unstaged files.

- [ ] **Step 5: Stop if verification leaves changes**

If verification produces source changes, inspect them with:

```bash
git diff --stat
git diff --check
```

Expected: either there are no changes, or the remaining changes are intentional fixes that should be reviewed before a final commit.
