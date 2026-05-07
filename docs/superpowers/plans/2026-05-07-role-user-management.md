# Role And User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin-side permission management loop: role CRUD with resource authorization, user edit/delete with department and role assignment, and field-level error display.

**Architecture:** Keep list pages responsible for tables, filters, pagination, drawer visibility, delete confirmation, and list refresh. Put `NDrawer` and form logic inside focused `RoleFormDrawer.vue` and `UserFormDrawer.vue` components. Reuse existing Hono client request helpers, shared zod schemas, TanStack Form, Naive UI, and the existing `v-can` permission model.

**Tech Stack:** Vue 3 Composition API, Naive UI, TanStack Vue Form, Pinia Colada test setup, Hono typed client, Zod shared schemas, Vitest, Vue Test Utils, pnpm.

---

## File Structure

- `packages/shared/src/schemas/errors.ts`
  - Extend the generic error shape to optionally carry a field name.
- `apps/server/src/modules/system/roles/routes.ts`
  - Return `field: 'code'` for duplicate role code conflicts.
- `apps/server/__tests__/modules/system/roles/routes.test.ts`
  - Assert duplicate role code responses include the field.
- `apps/server/__tests__/modules/system/users/routes.test.ts`
  - Strengthen existing conflict assertions to check user conflict fields.
- `apps/client/src/utils/form.ts`
  - New generic form UI helpers shared by auth and system forms.
- `apps/client/src/features/auth/form.ts`
  - Re-export generic form helpers to keep existing auth imports stable.
- `apps/client/src/features/auth/index.ts`
  - Export `setServerFieldError` with the existing auth form helper surface.
- `apps/client/src/features/system/requests.ts`
  - Add get/create/update/delete helpers and preserve error fields.
- `apps/client/src/features/system/index.ts`
  - Export the new system request helpers.
- `apps/client/src/utils/ui.ts`
  - Let table action buttons receive click handlers.
- `apps/client/src/App.vue`
  - Add Naive UI dialog and message providers for delete confirmation and feedback.
- `apps/client/__tests__/helpers/auth.ts`
  - Wrap route tests with Naive UI providers when pages use `useDialog()` and `useMessage()`.
- `apps/client/src/features/system/RoleFormDrawer.vue`
  - New role create/edit drawer.
- `apps/client/__tests__/features/system/RoleFormDrawer.test.ts`
  - Unit tests for role drawer behavior.
- `apps/client/src/pages/index/system/roles.vue`
  - Wire role create/edit drawer and delete confirmation.
- `apps/client/__tests__/pages/system/roles.test.ts`
  - Page-level tests for opening drawer, delete confirmation, and permissions.
- `apps/client/src/features/system/UserFormDrawer.vue`
  - New user edit drawer.
- `apps/client/__tests__/features/system/UserFormDrawer.test.ts`
  - Unit tests for user drawer behavior.
- `apps/client/src/pages/index/system/users.vue`
  - Wire user edit drawer and delete confirmation while keeping the existing create button visible but inert.
- `apps/client/__tests__/pages/system/users.test.ts`
  - Page-level tests for opening drawer, delete confirmation, create button scope, and permissions.
- `apps/client/__tests__/features/system/requests.test.ts`
  - Request helper and system error parsing tests.

---

### Task 1: Client Request Helpers And Generic Form Utilities

**Files:**
- Create: `apps/client/src/utils/form.ts`
- Modify: `apps/client/src/features/auth/form.ts`
- Modify: `apps/client/src/features/auth/index.ts`
- Modify: `apps/client/src/features/system/requests.ts`
- Modify: `apps/client/src/features/system/index.ts`
- Modify: `apps/client/__tests__/features/system/requests.test.ts`
- Modify: `packages/shared/src/schemas/errors.ts`

- [ ] **Step 1: Write failing request helper tests**

Add tests to `apps/client/__tests__/features/system/requests.test.ts` for new helpers and error fields. Keep the existing tests and append cases like this:

```ts
it('parses system errors with field names', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ field: 'code', message: '角色编码已存在' }), {
      status: 409,
    }),
  )
  vi.stubGlobal('fetch', fetchMock)

  await expect(
    createRole({
      name: '重复角色',
      code: 'admin',
      status: ROLE_STATUS_ENABLED,
      sortOrder: 0,
      resourceIds: [],
    }),
  ).rejects.toMatchObject({
    status: 409,
    field: 'code',
    message: '角色编码已存在',
  })
})

it('sends role create, update, detail, and delete requests', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: '11111111-1111-4111-8111-111111111111',
          name: '运营',
          code: 'operator',
          status: ROLE_STATUS_ENABLED,
          sortOrder: 1,
          resources: [],
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: '11111111-1111-4111-8111-111111111111',
          name: '运营主管',
          code: 'operator',
          status: ROLE_STATUS_ENABLED,
          sortOrder: 2,
          resources: [],
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-02T00:00:00.000Z',
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: '11111111-1111-4111-8111-111111111111',
          name: '运营主管',
          code: 'operator',
          status: ROLE_STATUS_ENABLED,
          sortOrder: 2,
          resources: [],
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-02T00:00:00.000Z',
        }),
      ),
    )
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
  useAuthStore().accessToken = 'access-token'

  await createRole({
    name: '运营',
    code: 'operator',
    status: ROLE_STATUS_ENABLED,
    sortOrder: 1,
    resourceIds: [],
  })
  await updateRole('11111111-1111-4111-8111-111111111111', {
    name: '运营主管',
    code: 'operator',
    status: ROLE_STATUS_ENABLED,
    sortOrder: 2,
    resourceIds: [],
  })
  const role = await getRole('11111111-1111-4111-8111-111111111111')
  await deleteRole('11111111-1111-4111-8111-111111111111')

  expect(role.name).toBe('运营主管')
  expect(fetchMock).toHaveBeenCalledTimes(4)
  expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/system/roles')
  expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
    '/api/system/roles/11111111-1111-4111-8111-111111111111',
  )
})

it('sends user detail, update, and delete requests', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: '22222222-2222-4222-8222-222222222222',
          username: 'ada',
          nickname: 'Ada',
          email: null,
          phone: null,
          status: USER_STATUS_ENABLED,
          departments: [],
          roles: [],
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: '22222222-2222-4222-8222-222222222222',
          username: 'ada',
          nickname: 'Ada Lovelace',
          email: 'ada@example.com',
          phone: null,
          status: USER_STATUS_ENABLED,
          departments: [],
          roles: [],
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-02T00:00:00.000Z',
        }),
      ),
    )
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
  useAuthStore().accessToken = 'access-token'

  const user = await getUser('22222222-2222-4222-8222-222222222222')
  const updated = await updateUser('22222222-2222-4222-8222-222222222222', {
    username: 'ada',
    nickname: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: null,
    status: USER_STATUS_ENABLED,
    departmentIds: [],
    roleIds: [],
  })
  await deleteUser('22222222-2222-4222-8222-222222222222')

  expect(user.username).toBe('ada')
  expect(updated.nickname).toBe('Ada Lovelace')
  expect(fetchMock).toHaveBeenCalledTimes(3)
})
```

Update imports in the same test file:

```ts
import {
  createRole,
  deleteRole,
  deleteUser,
  getRole,
  getUser,
  updateRole,
  updateUser,
} from '../../../src/features/system'
```

- [ ] **Step 2: Run request tests to verify they fail**

Run:

```bash
pnpm --filter @rev30/client test -- requests
```

Expected: FAIL because `createRole`, `getRole`, `updateRole`, `deleteRole`, `getUser`, `updateUser`, `deleteUser`, and `SystemRequestError.field` do not exist yet.

- [ ] **Step 3: Implement shared error and request helpers**

Update `packages/shared/src/schemas/errors.ts`:

```ts
import { z } from 'zod'

export const errorMessageSchema = z.object({
  field: z.string().optional(),
  message: z.string(),
})

export type ErrorMessage = z.infer<typeof errorMessageSchema>
```

Create `apps/client/src/utils/form.ts` by moving the current generic helper implementation out of `apps/client/src/features/auth/form.ts`:

```ts
import type { AnyFormApi } from '@tanstack/vue-form'

function flattenValidationErrors(errors: unknown[]): unknown[] {
  return errors.flatMap((error) =>
    Array.isArray(error) ? flattenValidationErrors(error) : [error],
  )
}

function validationErrorMessage(error: unknown) {
  if (typeof error === 'string') {
    return error
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message)
  }

  return error === undefined ? undefined : String(error)
}

export function formItemValidationProps(errors: unknown[], serverError?: unknown) {
  const firstError = flattenValidationErrors(errors).find((error) => error !== undefined)
  const validationFeedback =
    typeof serverError === 'string' ? serverError : validationErrorMessage(firstError)

  return validationFeedback === undefined
    ? {}
    : { feedback: validationFeedback, validationStatus: 'error' as const }
}

export function setServerFieldError<TForm extends AnyFormApi>(
  form: TForm,
  field: Parameters<TForm['setFieldMeta']>[0],
  message: string,
) {
  form.setFieldMeta(field, (meta) => ({
    ...meta,
    errorMap: {
      ...meta.errorMap,
      onServer: message,
    },
    errorSourceMap: {
      ...meta.errorSourceMap,
      onServer: 'form',
    },
  }))
}
```

Replace `apps/client/src/features/auth/form.ts` with:

```ts
export { formItemValidationProps, setServerFieldError } from '../../utils/form'
```

Update `apps/client/src/features/auth/index.ts`:

```ts
export { formItemValidationProps, setServerFieldError } from './form'
```

Update `apps/client/src/features/system/requests.ts` to add imports and helpers:

```ts
import {
  departmentTreeNodeSchema,
  errorMessageSchema,
  resourceTreeNodeSchema,
  roleListResponseSchema,
  roleSchema,
  userListResponseSchema,
  userSchema,
  type DepartmentTreeNode,
  type ErrorMessage,
  type ResourceTreeNode,
  type Role,
  type RoleCreateInput,
  type RoleListQuery,
  type RoleListResponse,
  type RoleUpdateInput,
  type User,
  type UserListQuery,
  type UserListResponse,
  type UserUpdateInput,
} from '@rev30/shared'
```

Extend `SystemRequestError`:

```ts
export class SystemRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly field?: ErrorMessage['field'],
  ) {
    super(message)
    this.name = 'SystemRequestError'
  }
}
```

Preserve fields in `parseSystemError`:

```ts
return new SystemRequestError(
  response.status,
  result.success ? result.data.message : '请求失败',
  result.success ? result.data.field : undefined,
)
```

Add helper functions:

```ts
export async function getRole(id: string): Promise<Role> {
  return parseSystemResponse(await api.system.roles[':id'].$get({ param: { id } }), roleSchema)
}

export async function createRole(input: RoleCreateInput): Promise<Role> {
  return parseSystemResponse(await api.system.roles.$post({ json: input }), roleSchema)
}

export async function updateRole(id: string, input: RoleUpdateInput): Promise<Role> {
  return parseSystemResponse(
    await api.system.roles[':id'].$patch({ param: { id }, json: input }),
    roleSchema,
  )
}

export async function deleteRole(id: string): Promise<void> {
  const response = await api.system.roles[':id'].$delete({ param: { id } })

  if (!response.ok) {
    throw await parseSystemError(response)
  }
}

export async function getUser(id: string): Promise<User> {
  return parseSystemResponse(await api.system.users[':id'].$get({ param: { id } }), userSchema)
}

export async function updateUser(id: string, input: UserUpdateInput): Promise<User> {
  return parseSystemResponse(
    await api.system.users[':id'].$patch({ param: { id }, json: input }),
    userSchema,
  )
}

export async function deleteUser(id: string): Promise<void> {
  const response = await api.system.users[':id'].$delete({ param: { id } })

  if (!response.ok) {
    throw await parseSystemError(response)
  }
}
```

Update `apps/client/src/features/system/index.ts`:

```ts
export {
  SystemRequestError,
  createRole,
  deleteRole,
  deleteUser,
  getDepartmentTree,
  getResourceTree,
  getRole,
  getSystemErrorMessage,
  getUser,
  listRoles,
  listUsers,
  updateRole,
  updateUser,
} from './requests'
```

- [ ] **Step 4: Run request tests to verify they pass**

Run:

```bash
pnpm --filter @rev30/client test -- requests
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/errors.ts apps/client/src/utils/form.ts apps/client/src/features/auth/form.ts apps/client/src/features/auth/index.ts apps/client/src/features/system/requests.ts apps/client/src/features/system/index.ts apps/client/__tests__/features/system/requests.test.ts
git commit -m "feat: add system mutation request helpers"
```

---

### Task 2: Backend Field-Level Role Conflict Errors

**Files:**
- Modify: `apps/server/src/modules/system/roles/routes.ts`
- Modify: `apps/server/__tests__/modules/system/roles/routes.test.ts`
- Modify: `apps/server/__tests__/modules/system/users/routes.test.ts`

- [ ] **Step 1: Write failing backend assertions**

Update the duplicate role code test in `apps/server/__tests__/modules/system/roles/routes.test.ts`:

```ts
expect(body).toEqual({ field: 'code', message: '角色编码已存在' })
```

Strengthen user conflict tests in `apps/server/__tests__/modules/system/users/routes.test.ts` by replacing the loop in `rejects duplicate username, email, and phone when updating users` with explicit field assertions:

```ts
for (const [body, field, message] of [
  [{ username: 'katherine' }, 'username', '用户名已存在'],
  [{ email: 'katherine@example.com' }, 'email', '邮箱已存在'],
  [{ phone: '10000000005' }, 'phone', '手机号已存在'],
] as const) {
  const response = await app.request(`/api/system/users/${target.id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
  })

  expect(response.status).toBe(409)
  expect(await response.json()).toEqual({ field, message })
}
```

- [ ] **Step 2: Run backend tests to verify role test fails**

Run:

```bash
pnpm --filter @rev30/server test -- roles users
```

Expected: FAIL for the role duplicate code assertion because the role route does not return `field` yet. User conflict assertions should already pass or expose a regression in existing behavior.

- [ ] **Step 3: Implement role conflict field response**

Update `roleErrorResponse` in `apps/server/src/modules/system/roles/routes.ts`:

```ts
if (error instanceof RoleConflictError) {
  return c.json({ field: 'code', message: error.message }, 409)
}

if (error instanceof RoleDeleteConflictError) {
  return c.json({ message: error.message }, 409)
}
```

Keep `RoleInvalidResourceError` and `RoleNotFoundError` unchanged.

- [ ] **Step 4: Run backend tests to verify they pass**

Run:

```bash
pnpm --filter @rev30/server test -- roles users
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/system/roles/routes.ts apps/server/__tests__/modules/system/roles/routes.test.ts apps/server/__tests__/modules/system/users/routes.test.ts
git commit -m "feat: return role conflict field errors"
```

---

### Task 3: Role Form Drawer Component

**Files:**
- Create: `apps/client/src/features/system/RoleFormDrawer.vue`
- Create: `apps/client/__tests__/features/system/RoleFormDrawer.test.ts`

- [ ] **Step 1: Write failing role drawer tests**

Create `apps/client/__tests__/features/system/RoleFormDrawer.test.ts`:

```ts
// @vitest-environment happy-dom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NTree } from 'naive-ui'
import {
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  ROLE_STATUS_ENABLED,
  type ResourceTreeNode,
  type Role,
} from '@rev30/shared'
import RoleFormDrawer from '../../../src/features/system/RoleFormDrawer.vue'
import {
  SystemRequestError,
  createRole,
  getResourceTree,
  getRole,
  updateRole,
} from '../../../src/features/system'

enableAutoUnmount(afterEach)

vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  createRole: vi.fn(),
  getResourceTree: vi.fn(),
  getRole: vi.fn(),
  updateRole: vi.fn(),
}))

const createRoleMock = vi.mocked(createRole)
const getResourceTreeMock = vi.mocked(getResourceTree)
const getRoleMock = vi.mocked(getRole)
const updateRoleMock = vi.mocked(updateRole)

const resourceTree: ResourceTreeNode[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    parentId: null,
    type: RESOURCE_TYPE_DIRECTORY,
    name: '系统管理',
    code: 'system',
    path: null,
    externalUrl: null,
    openTarget: RESOURCE_OPEN_TARGET_SELF,
    icon: null,
    hidden: false,
    status: RESOURCE_STATUS_ENABLED,
    sortOrder: 1,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    children: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        parentId: '11111111-1111-4111-8111-111111111111',
        type: RESOURCE_TYPE_ACTION,
        name: '编辑角色',
        code: 'system:role:update',
        path: null,
        externalUrl: null,
        openTarget: RESOURCE_OPEN_TARGET_SELF,
        icon: null,
        hidden: false,
        status: RESOURCE_STATUS_ENABLED,
        sortOrder: 2,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
        children: [],
      },
    ],
  },
]

const role: Role = {
  id: '33333333-3333-4333-8333-333333333333',
  name: '运营',
  code: 'operator',
  status: ROLE_STATUS_ENABLED,
  sortOrder: 2,
  resources: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: '编辑角色',
      code: 'system:role:update',
      type: RESOURCE_TYPE_ACTION,
    },
  ],
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
}

function mountDrawer(props = { show: true, roleId: null as string | null }) {
  const pinia = createPinia()
  setActivePinia(pinia)

  return mount(RoleFormDrawer, {
    props,
    global: {
      plugins: [pinia, PiniaColada],
    },
  })
}

describe('RoleFormDrawer', () => {
  beforeEach(() => {
    createRoleMock.mockReset()
    getResourceTreeMock.mockReset()
    getRoleMock.mockReset()
    updateRoleMock.mockReset()
    getResourceTreeMock.mockResolvedValue(resourceTree)
    createRoleMock.mockResolvedValue({ ...role, resources: [] })
    updateRoleMock.mockResolvedValue(role)
  })

  it('creates a role with checked resource ids', async () => {
    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.find('[data-test="role-form-name"] input').setValue('运营')
    await wrapper.find('[data-test="role-form-code"] input').setValue('operator')
    await wrapper.find('[data-test="role-form-sort-order"] input').setValue('2')
    wrapper.getComponent(NTree).vm.$emit('update:checked-keys', [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ])
    await wrapper.get('[data-test="role-form-submit"]').trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createRoleMock).toHaveBeenCalledWith({
      name: '运营',
      code: 'operator',
      status: ROLE_STATUS_ENABLED,
      sortOrder: 2,
      resourceIds: [
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ],
    })
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })

  it('loads role details and updates existing role', async () => {
    getRoleMock.mockResolvedValue(role)
    const wrapper = mountDrawer({
      show: true,
      roleId: '33333333-3333-4333-8333-333333333333',
    })
    await flushPromises()

    expect(getRoleMock).toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333')
    expect((wrapper.getComponent(NTree).props('checkedKeys') as string[])).toEqual([
      '22222222-2222-4222-8222-222222222222',
    ])

    await wrapper.find('[data-test="role-form-name"] input').setValue('运营主管')
    await wrapper.get('[data-test="role-form-submit"]').trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateRoleMock).toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333', {
      name: '运营主管',
      code: 'operator',
      status: ROLE_STATUS_ENABLED,
      sortOrder: 2,
      resourceIds: ['22222222-2222-4222-8222-222222222222'],
    })
  })

  it('shows role code server errors on the code field', async () => {
    createRoleMock.mockRejectedValue(new SystemRequestError(409, '角色编码已存在', 'code'))
    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.find('[data-test="role-form-name"] input').setValue('重复角色')
    await wrapper.find('[data-test="role-form-code"] input').setValue('admin')
    await wrapper.get('[data-test="role-form-submit"]').trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('角色编码已存在')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run drawer test to verify it fails**

Run:

```bash
pnpm --filter @rev30/client test -- RoleFormDrawer
```

Expected: FAIL because `RoleFormDrawer.vue` does not exist yet.

- [ ] **Step 3: Implement `RoleFormDrawer.vue`**

Create `apps/client/src/features/system/RoleFormDrawer.vue`:

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useForm } from '@tanstack/vue-form'
import type { TreeOption } from 'naive-ui'
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
  NTree,
} from 'naive-ui'
import {
  ROLE_STATUS_ENABLED,
  roleCreateSchema,
  roleUpdateSchema,
  type ResourceTreeNode,
  type RoleCreateInput,
} from '@rev30/shared'
import { formItemValidationProps, setServerFieldError } from '../../utils/form'
import {
  SystemRequestError,
  createRole,
  getResourceTree,
  getRole,
  getSystemErrorMessage,
  statusOptions,
  updateRole,
} from '.'

type RoleFormData = {
  name: string
  code: string
  status: RoleCreateInput['status']
  sortOrder: number
  resourceIds: string[]
}

const props = defineProps<{
  show: boolean
  roleId: string | null
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
  saved: []
}>()

const defaultValues: RoleFormData = {
  name: '',
  code: '',
  status: ROLE_STATUS_ENABLED,
  sortOrder: 0,
  resourceIds: [],
}

const isEdit = computed(() => props.roleId !== null)
const title = computed(() => (isEdit.value ? '编辑角色' : '新增角色'))
const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
const formError = ref('')
const resourceTree = ref<ResourceTreeNode[]>([])

const form = useForm({
  defaultValues,
  validators: {
    onSubmit: roleCreateSchema,
  },
  async onSubmit({ value }) {
    formError.value = ''
    saving.value = true

    try {
      if (props.roleId === null) {
        await createRole(roleCreateSchema.parse(value))
      } else {
        await updateRole(props.roleId, roleUpdateSchema.parse(value))
      }

      emit('saved')
      emit('update:show', false)
    } catch (error) {
      if (error instanceof SystemRequestError && error.field !== undefined) {
        setServerFieldError(form, error.field as keyof RoleFormData, error.message)
        return
      }

      formError.value = getSystemErrorMessage(error, '保存角色失败')
    } finally {
      saving.value = false
    }
  },
})

const treeData = computed(() => resourceTree.value.map(toTreeOption))

function toTreeOption(resource: ResourceTreeNode): TreeOption {
  return {
    key: resource.id,
    label: `${resource.name} (${resource.code})`,
    children: resource.children.map(toTreeOption),
  }
}

function resetForm() {
  form.reset(defaultValues)
  loadError.value = ''
  formError.value = ''
  resourceTree.value = []
}

async function loadDrawerData() {
  loading.value = true
  loadError.value = ''

  try {
    const [resources, role] = await Promise.all([
      getResourceTree(),
      props.roleId === null ? Promise.resolve(null) : getRole(props.roleId),
    ])

    resourceTree.value = resources

    if (role === null) {
      form.reset(defaultValues)
      return
    }

    form.reset({
      name: role.name,
      code: role.code,
      status: role.status,
      sortOrder: role.sortOrder,
      resourceIds: role.resources.map((resource) => resource.id),
    })
  } catch (error) {
    loadError.value = getSystemErrorMessage(error, '加载角色表单失败')
  } finally {
    loading.value = false
  }
}

function handleUpdateShow(show: boolean) {
  emit('update:show', show)
}

watch(
  () => props.show,
  (show) => {
    if (!show) {
      resetForm()
      return
    }

    void loadDrawerData()
  },
)
</script>

<template>
  <NDrawer
    :show="show"
    :width="640"
    placement="right"
    @update:show="handleUpdateShow"
  >
    <NDrawerContent :title="title" closable>
      <NAlert v-if="loadError" class="mb-4" type="error" :show-icon="false">
        {{ loadError }}
      </NAlert>
      <NAlert v-if="formError" class="mb-4" type="error" :show-icon="false">
        {{ formError }}
      </NAlert>

      <NForm class="flex flex-col gap-2" @submit.prevent="form.handleSubmit()">
        <form.Field name="name" v-slot="{ field, state }">
          <NFormItem label="角色名称" v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)">
            <NInput
              data-test="role-form-name"
              :value="state.value"
              :disabled="loading"
              placeholder="请输入角色名称"
              @blur="field.handleBlur"
              @update:value="field.handleChange"
            />
          </NFormItem>
        </form.Field>

        <form.Field name="code" v-slot="{ field, state }">
          <NFormItem label="角色编码" v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)">
            <NInput
              data-test="role-form-code"
              :value="state.value"
              :disabled="loading"
              placeholder="请输入角色编码"
              @blur="field.handleBlur"
              @update:value="field.handleChange"
            />
          </NFormItem>
        </form.Field>

        <form.Field name="status" v-slot="{ field, state }">
          <NFormItem label="状态" v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)">
            <NSelect
              data-test="role-form-status"
              :value="state.value"
              :options="statusOptions"
              :disabled="loading"
              @update:value="field.handleChange"
            />
          </NFormItem>
        </form.Field>

        <form.Field name="sortOrder" v-slot="{ field, state }">
          <NFormItem label="排序" v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)">
            <NInputNumber
              data-test="role-form-sort-order"
              :value="state.value"
              :disabled="loading"
              class="w-full"
              @blur="field.handleBlur"
              @update:value="(value) => field.handleChange(value ?? 0)"
            />
          </NFormItem>
        </form.Field>

        <form.Field name="resourceIds" v-slot="{ field, state }">
          <NFormItem label="资源授权" v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)">
            <NTree
              block-line
              checkable
              cascade
              :data="treeData"
              :disabled="loading"
              :checked-keys="state.value"
              @update:checked-keys="(keys) => field.handleChange(keys.map(String))"
            />
          </NFormItem>
        </form.Field>

        <div class="mt-4 flex justify-end gap-3">
          <NButton @click="emit('update:show', false)">取消</NButton>
          <NButton
            data-test="role-form-submit"
            type="primary"
            attr-type="submit"
            :disabled="loading || Boolean(loadError)"
            :loading="saving"
          >
            保存
          </NButton>
        </div>
      </NForm>
    </NDrawerContent>
  </NDrawer>
</template>
```

- [ ] **Step 4: Run role drawer tests**

Run:

```bash
pnpm --filter @rev30/client test -- RoleFormDrawer
```

Expected: PASS. If TypeScript reports that `form.reset()` does not accept values in this installed TanStack Form version, replace each `form.reset(values)` call with `form.reset()` followed by `form.setFieldValue()` for the five fields.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/system/RoleFormDrawer.vue apps/client/__tests__/features/system/RoleFormDrawer.test.ts
git commit -m "feat: add role form drawer"
```

---

### Task 4: Wire Role Page Actions And Delete Confirmation

**Files:**
- Modify: `apps/client/src/App.vue`
- Modify: `apps/client/__tests__/helpers/auth.ts`
- Modify: `apps/client/src/utils/ui.ts`
- Modify: `apps/client/src/pages/index/system/roles.vue`
- Modify: `apps/client/__tests__/pages/system/roles.test.ts`

- [ ] **Step 1: Write failing role page tests**

Update `apps/client/__tests__/pages/system/roles.test.ts`:

```ts
import { deleteRole } from '../../../src/features/system'

vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  deleteRole: vi.fn(),
  listRoles: vi.fn(),
  getSystemErrorMessage: vi.fn((error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  ),
}))

const deleteRoleMock = vi.mocked(deleteRole)
```

Add setup reset:

```ts
deleteRoleMock.mockReset()
deleteRoleMock.mockResolvedValue()
```

Add tests:

```ts
it('opens role drawer for create and edit actions', async () => {
  listRolesMock.mockResolvedValue(roleListResponse)
  const { wrapper } = await mountRolesPage([
    'system:role:create',
    'system:role:update',
    'system:role:delete',
  ])
  await flushPromises()

  await wrapper.get('[data-test="roles-create"]').trigger('click')
  await flushPromises()
  expect(wrapper.findComponent({ name: 'RoleFormDrawer' }).props('show')).toBe(true)
  expect(wrapper.findComponent({ name: 'RoleFormDrawer' }).props('roleId')).toBe(null)

  wrapper.findComponent({ name: 'RoleFormDrawer' }).vm.$emit('update:show', false)
  await flushPromises()
  await wrapper.findAll('[data-test="roles-edit"]')[0]!.trigger('click')
  await flushPromises()

  expect(wrapper.findComponent({ name: 'RoleFormDrawer' }).props('show')).toBe(true)
  expect(wrapper.findComponent({ name: 'RoleFormDrawer' }).props('roleId')).toBe(
    '11111111-1111-4111-8111-111111111111',
  )
})

it('deletes a role after confirmation and refreshes the list', async () => {
  listRolesMock.mockResolvedValue(roleListResponse)
  const { wrapper } = await mountRolesPage(['system:role:delete'])
  await flushPromises()

  await wrapper.findAll('[data-test="roles-delete"]')[0]!.trigger('click')
  await flushPromises()
  await wrapper.get('[data-test="roles-delete-confirm"]').trigger('click')
  await flushPromises()

  expect(deleteRoleMock).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
  expect(listRolesMock).toHaveBeenCalledTimes(2)
})
```

Stub `RoleFormDrawer` in this page test if the full drawer lifecycle makes the page test noisy:

```ts
global: {
  stubs: {
    RoleFormDrawer: {
      name: 'RoleFormDrawer',
      props: ['show', 'roleId'],
      emits: ['update:show', 'saved'],
      template: '<div data-test="role-form-drawer" />',
    },
  },
}
```

- [ ] **Step 2: Run role page tests to verify they fail**

Run:

```bash
pnpm --filter @rev30/client test -- roles
```

Expected: FAIL because the page does not wire drawer state or delete confirmation.

- [ ] **Step 3: Add providers and table action click handlers**

Update `apps/client/src/App.vue`:

```vue
<template>
  <NConfigProvider :date-locale="dateZhCN" :locale="zhCN" :theme="naiveTheme">
    <NGlobalStyle />
    <NDialogProvider>
      <NMessageProvider>
        <ThemeTokenProvider>
          <RouterView />
        </ThemeTokenProvider>
      </NMessageProvider>
    </NDialogProvider>
  </NConfigProvider>
</template>
```

Add imports:

```ts
import {
  darkTheme,
  dateZhCN,
  NConfigProvider,
  NDialogProvider,
  NGlobalStyle,
  NMessageProvider,
  zhCN,
} from 'naive-ui'
```

Update `apps/client/__tests__/helpers/auth.ts` to provide the same providers around `RouterView`:

```ts
import { NDialogProvider, NMessageProvider } from 'naive-ui'
```

Use this template:

```ts
template: `
  <NDialogProvider>
    <NMessageProvider>
      <RouterView />
    </NMessageProvider>
  </NDialogProvider>
`,
```

Update `apps/client/src/utils/ui.ts`:

```ts
type TableActionOptions = {
  label: string
  accessCode: string
  type?: ButtonProps['type']
  testId?: string
  onClick?: () => void
}
```

Pass the handler to `NButton`:

```ts
onClick,
```

- [ ] **Step 4: Wire `roles.vue`**

Update imports in `apps/client/src/pages/index/system/roles.vue`:

```ts
import { useDialog, useMessage } from 'naive-ui'
import RoleFormDrawer from '../../../features/system/RoleFormDrawer.vue'
import { deleteRole } from '../../../features/system'
```

Add state and handlers:

```ts
const dialog = useDialog()
const message = useMessage()
const roleDrawerVisible = ref(false)
const editingRoleId = ref<string | null>(null)

function openCreateRoleDrawer() {
  editingRoleId.value = null
  roleDrawerVisible.value = true
}

function openEditRoleDrawer(role: RoleListItem) {
  editingRoleId.value = role.id
  roleDrawerVisible.value = true
}

async function refreshRoles() {
  query.value = { ...query.value }
}

function confirmDeleteRole(role: RoleListItem) {
  dialog.warning({
    title: '删除角色',
    content: `确认删除角色「${role.name}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteRole(role.id)
        message.success('角色已删除')
        await refreshRoles()
      } catch (error) {
        message.error(getSystemErrorMessage(error, '删除角色失败'))
        return false
      }
    },
  })
}
```

Wire buttons:

```ts
render: (role) =>
  renderTableActions([
    renderTableActionButton({
      label: '编辑',
      accessCode: 'system:role:update',
      testId: 'roles-edit',
      onClick: () => openEditRoleDrawer(role),
    }),
    renderTableActionButton({
      label: '删除',
      accessCode: 'system:role:delete',
      type: 'error',
      testId: 'roles-delete',
      onClick: () => confirmDeleteRole(role),
    }),
  ]),
```

Update create button:

```vue
<NButton
  v-can="'system:role:create'"
  data-test="roles-create"
  type="primary"
  @click="openCreateRoleDrawer"
>
  新增角色
</NButton>
```

Mount drawer at the end of the template:

```vue
<RoleFormDrawer
  v-model:show="roleDrawerVisible"
  :role-id="editingRoleId"
  @saved="refreshRoles"
/>
```

- [ ] **Step 5: Run role page tests**

Run:

```bash
pnpm --filter @rev30/client test -- roles
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/App.vue apps/client/__tests__/helpers/auth.ts apps/client/src/utils/ui.ts apps/client/src/pages/index/system/roles.vue apps/client/__tests__/pages/system/roles.test.ts
git commit -m "feat: wire role management actions"
```

---

### Task 5: User Form Drawer Component

**Files:**
- Create: `apps/client/src/features/system/UserFormDrawer.vue`
- Create: `apps/client/__tests__/features/system/UserFormDrawer.test.ts`

- [ ] **Step 1: Write failing user drawer tests**

Create `apps/client/__tests__/features/system/UserFormDrawer.test.ts` with this scaffold:

```ts
// @vitest-environment happy-dom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEPARTMENT_STATUS_ENABLED,
  ROLE_STATUS_ENABLED,
  USER_STATUS_ENABLED,
  type DepartmentTreeNode,
  type RoleListResponse,
  type User,
} from '@rev30/shared'
import UserFormDrawer from '../../../src/features/system/UserFormDrawer.vue'
import {
  SystemRequestError,
  getDepartmentTree,
  getUser,
  listRoles,
  updateUser,
} from '../../../src/features/system'

enableAutoUnmount(afterEach)

vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  getDepartmentTree: vi.fn(),
  getUser: vi.fn(),
  listRoles: vi.fn(),
  updateUser: vi.fn(),
}))

const getDepartmentTreeMock = vi.mocked(getDepartmentTree)
const getUserMock = vi.mocked(getUser)
const listRolesMock = vi.mocked(listRoles)
const updateUserMock = vi.mocked(updateUser)

const departmentTree: DepartmentTreeNode[] = [
  {
    id: '22222222-2222-4222-8222-222222222222',
    parentId: null,
    name: '研发中心',
    code: 'engineering',
    status: DEPARTMENT_STATUS_ENABLED,
    sortOrder: 1,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    children: [],
  },
]

const roleListResponse: RoleListResponse = {
  list: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      name: '运营',
      code: 'operator',
      status: ROLE_STATUS_ENABLED,
      userCount: 0,
      sortOrder: 1,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 100,
}

const user: User = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'ada',
  nickname: 'Ada',
  email: null,
  phone: null,
  status: USER_STATUS_ENABLED,
  departments: [],
  roles: [],
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
}

function mountDrawer(props = { show: true, userId: user.id as string | null }) {
  const pinia = createPinia()
  setActivePinia(pinia)

  return mount(UserFormDrawer, {
    props,
    global: {
      plugins: [pinia, PiniaColada],
    },
  })
}

describe('UserFormDrawer', () => {
  beforeEach(() => {
    getDepartmentTreeMock.mockReset()
    getUserMock.mockReset()
    listRolesMock.mockReset()
    updateUserMock.mockReset()
  })
})
```

Add these two tests inside the `describe` block:

```ts
it('loads user details and submits profile, departments, and roles', async () => {
  getUserMock.mockResolvedValue(user)
  getDepartmentTreeMock.mockResolvedValue(departmentTree)
  listRolesMock.mockResolvedValue(roleListResponse)
  updateUserMock.mockResolvedValue({ ...user, nickname: 'Ada Lovelace' })
  const wrapper = mountDrawer({
    show: true,
    userId: '11111111-1111-4111-8111-111111111111',
  })
  await flushPromises()

  await wrapper.find('[data-test="user-form-nickname"] input').setValue('Ada Lovelace')
  wrapper.getComponent({ name: 'NTreeSelect' }).vm.$emit('update:value', [
    '22222222-2222-4222-8222-222222222222',
  ])
  wrapper
    .findAllComponents({ name: 'NSelect' })
    .find((component) => component.attributes('data-test') === 'user-form-roles')!
    .vm.$emit('update:value', ['33333333-3333-4333-8333-333333333333'])
  await wrapper.get('[data-test="user-form-submit"]').trigger('click')
  await wrapper.find('form').trigger('submit')
  await flushPromises()

  expect(updateUserMock).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', {
    username: 'ada',
    nickname: 'Ada Lovelace',
    email: null,
    phone: null,
    status: USER_STATUS_ENABLED,
    departmentIds: ['22222222-2222-4222-8222-222222222222'],
    roleIds: ['33333333-3333-4333-8333-333333333333'],
  })
  expect(wrapper.emitted('saved')).toHaveLength(1)
})

it('shows username server errors on the username field', async () => {
  getUserMock.mockResolvedValue(user)
  getDepartmentTreeMock.mockResolvedValue([])
  listRolesMock.mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 100 })
  updateUserMock.mockRejectedValue(new SystemRequestError(409, '用户名已存在', 'username'))
  const wrapper = mountDrawer({
    show: true,
    userId: '11111111-1111-4111-8111-111111111111',
  })
  await flushPromises()

  await wrapper.find('[data-test="user-form-username"] input').setValue('admin')
  await wrapper.get('[data-test="user-form-submit"]').trigger('click')
  await wrapper.find('form').trigger('submit')
  await flushPromises()

  expect(wrapper.text()).toContain('用户名已存在')
  expect(wrapper.emitted('saved')).toBeUndefined()
})
```

- [ ] **Step 2: Run user drawer test to verify it fails**

Run:

```bash
pnpm --filter @rev30/client test -- UserFormDrawer
```

Expected: FAIL because `UserFormDrawer.vue` does not exist yet.

- [ ] **Step 3: Implement `UserFormDrawer.vue`**

Create `apps/client/src/features/system/UserFormDrawer.vue`:

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useForm } from '@tanstack/vue-form'
import type { SelectOption, TreeSelectOption } from 'naive-ui'
import {
  NAlert,
  NButton,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NInput,
  NSelect,
  NTreeSelect,
} from 'naive-ui'
import {
  USER_STATUS_ENABLED,
  userUpdateSchema,
  type DepartmentTreeNode,
  type UserUpdateInput,
} from '@rev30/shared'
import { formItemValidationProps, setServerFieldError } from '../../utils/form'
import {
  SystemRequestError,
  getDepartmentTree,
  getSystemErrorMessage,
  getUser,
  listRoles,
  statusOptions,
  updateUser,
} from '.'

type UserFormData = {
  username: string
  nickname: string
  email: string | null
  phone: string | null
  status: UserUpdateInput['status']
  departmentIds: string[]
  roleIds: string[]
}

const props = defineProps<{
  show: boolean
  userId: string | null
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
  saved: []
}>()

const defaultValues: UserFormData = {
  username: '',
  nickname: '',
  email: null,
  phone: null,
  status: USER_STATUS_ENABLED,
  departmentIds: [],
  roleIds: [],
}

const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
const formError = ref('')
const departmentTree = ref<DepartmentTreeNode[]>([])
const roleOptions = ref<SelectOption[]>([])

const form = useForm({
  defaultValues,
  validators: {
    onSubmit: userUpdateSchema,
  },
  async onSubmit({ value }) {
    if (props.userId === null) {
      formError.value = '用户不存在'
      return
    }

    formError.value = ''
    saving.value = true

    try {
      await updateUser(props.userId, userUpdateSchema.parse(value))
      emit('saved')
      emit('update:show', false)
    } catch (error) {
      if (error instanceof SystemRequestError && error.field !== undefined) {
        setServerFieldError(form, error.field as keyof UserFormData, error.message)
        return
      }

      formError.value = getSystemErrorMessage(error, '保存用户失败')
    } finally {
      saving.value = false
    }
  },
})

const departmentOptions = computed(() => departmentTree.value.map(toDepartmentOption))

function toDepartmentOption(department: DepartmentTreeNode): TreeSelectOption {
  return {
    key: department.id,
    label: `${department.name} (${department.code})`,
    children: department.children.map(toDepartmentOption),
  }
}

function resetForm() {
  form.reset(defaultValues)
  loadError.value = ''
  formError.value = ''
  departmentTree.value = []
  roleOptions.value = []
}

async function loadDrawerData() {
  if (props.userId === null) {
    loadError.value = '用户不存在'
    return
  }

  loading.value = true
  loadError.value = ''

  try {
    const [user, departments, roles] = await Promise.all([
      getUser(props.userId),
      getDepartmentTree(),
      listRoles({ page: 1, pageSize: 100 }),
    ])

    departmentTree.value = departments
    roleOptions.value = roles.list.map((role) => ({
      label: `${role.name} (${role.code})`,
      value: role.id,
    }))
    form.reset({
      username: user.username,
      nickname: user.nickname,
      email: user.email,
      phone: user.phone,
      status: user.status,
      departmentIds: user.departments.map((department) => department.id),
      roleIds: user.roles.map((role) => role.id),
    })
  } catch (error) {
    loadError.value = getSystemErrorMessage(error, '加载用户表单失败')
  } finally {
    loading.value = false
  }
}

function handleUpdateShow(show: boolean) {
  emit('update:show', show)
}

watch(
  () => props.show,
  (show) => {
    if (!show) {
      resetForm()
      return
    }

    void loadDrawerData()
  },
)
</script>
```

Use this template:

```vue
<template>
  <NDrawer
    :show="show"
    :width="640"
    placement="right"
    @update:show="handleUpdateShow"
  >
    <NDrawerContent title="编辑用户" closable>
      <NAlert v-if="loadError" class="mb-4" type="error" :show-icon="false">
        {{ loadError }}
      </NAlert>
      <NAlert v-if="formError" class="mb-4" type="error" :show-icon="false">
        {{ formError }}
      </NAlert>

      <NForm class="flex flex-col gap-2" @submit.prevent="form.handleSubmit()">
        <form.Field name="username" v-slot="{ field, state }">
          <NFormItem label="用户名" v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)">
            <NInput data-test="user-form-username" :value="state.value" :disabled="loading" @blur="field.handleBlur" @update:value="field.handleChange" />
          </NFormItem>
        </form.Field>

        <form.Field name="nickname" v-slot="{ field, state }">
          <NFormItem label="昵称" v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)">
            <NInput data-test="user-form-nickname" :value="state.value" :disabled="loading" @blur="field.handleBlur" @update:value="field.handleChange" />
          </NFormItem>
        </form.Field>

        <form.Field name="email" v-slot="{ field, state }">
          <NFormItem label="邮箱" v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)">
            <NInput data-test="user-form-email" :value="state.value ?? ''" :disabled="loading" placeholder="可选" @blur="field.handleBlur" @update:value="field.handleChange" />
          </NFormItem>
        </form.Field>

        <form.Field name="phone" v-slot="{ field, state }">
          <NFormItem label="手机号" v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)">
            <NInput data-test="user-form-phone" :value="state.value ?? ''" :disabled="loading" placeholder="可选" @blur="field.handleBlur" @update:value="field.handleChange" />
          </NFormItem>
        </form.Field>

        <form.Field name="status" v-slot="{ field, state }">
          <NFormItem label="状态" v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)">
            <NSelect data-test="user-form-status" :value="state.value" :options="statusOptions" :disabled="loading" @update:value="field.handleChange" />
          </NFormItem>
        </form.Field>

        <form.Field name="departmentIds" v-slot="{ field, state }">
          <NFormItem label="部门" v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)">
            <NTreeSelect
              data-test="user-form-departments"
              multiple
              clearable
              cascade
              checkable
              :options="departmentOptions"
              :value="state.value"
              :disabled="loading"
              @update:value="(value) => field.handleChange(Array.isArray(value) ? value.map(String) : [])"
            />
          </NFormItem>
        </form.Field>

        <form.Field name="roleIds" v-slot="{ field, state }">
          <NFormItem label="角色" v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)">
            <NSelect
              data-test="user-form-roles"
              multiple
              filterable
              clearable
              :value="state.value"
              :options="roleOptions"
              :disabled="loading"
              @update:value="(value) => field.handleChange(Array.isArray(value) ? value.map(String) : [])"
            />
          </NFormItem>
        </form.Field>

        <div class="mt-4 flex justify-end gap-3">
          <NButton @click="emit('update:show', false)">取消</NButton>
          <NButton
            data-test="user-form-submit"
            type="primary"
            attr-type="submit"
            :disabled="loading || Boolean(loadError)"
            :loading="saving"
          >
            保存
          </NButton>
        </div>
      </NForm>
    </NDrawerContent>
  </NDrawer>
</template>
```

- [ ] **Step 4: Run user drawer tests**

Run:

```bash
pnpm --filter @rev30/client test -- UserFormDrawer
```

Expected: PASS. If `NTreeSelect` does not accept `checkable` in the installed type definitions, remove `checkable` and keep `multiple cascade`; the form still satisfies tree selection with hierarchical options.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/system/UserFormDrawer.vue apps/client/__tests__/features/system/UserFormDrawer.test.ts
git commit -m "feat: add user form drawer"
```

---

### Task 6: Wire User Page Actions And Delete Confirmation

**Files:**
- Modify: `apps/client/src/pages/index/system/users.vue`
- Modify: `apps/client/__tests__/pages/system/users.test.ts`

- [ ] **Step 1: Write failing user page tests**

Update `apps/client/__tests__/pages/system/users.test.ts` to mock `deleteUser`, then add tests:

```ts
it('keeps create visible by permission but does not open a create drawer', async () => {
  listUsersMock.mockResolvedValue(userListResponse)
  const { wrapper } = await mountUsersPage(['system:user:create'])
  await flushPromises()

  expect(wrapper.find('[data-test="users-create"]').exists()).toBe(true)
  await wrapper.get('[data-test="users-create"]').trigger('click')
  await flushPromises()

  expect(wrapper.findComponent({ name: 'UserFormDrawer' }).props('show')).toBe(false)
})

it('opens user drawer for edit actions', async () => {
  listUsersMock.mockResolvedValue(userListResponse)
  const { wrapper } = await mountUsersPage(['system:user:update'])
  await flushPromises()

  await wrapper.findAll('[data-test="users-edit"]')[0]!.trigger('click')
  await flushPromises()

  expect(wrapper.findComponent({ name: 'UserFormDrawer' }).props('show')).toBe(true)
  expect(wrapper.findComponent({ name: 'UserFormDrawer' }).props('userId')).toBe(
    '11111111-1111-4111-8111-111111111111',
  )
})

it('deletes a user after confirmation and refreshes the list', async () => {
  listUsersMock.mockResolvedValue(userListResponse)
  deleteUserMock.mockResolvedValue()
  const { wrapper } = await mountUsersPage(['system:user:delete'])
  await flushPromises()

  await wrapper.findAll('[data-test="users-delete"]')[0]!.trigger('click')
  await flushPromises()
  await wrapper.get('[data-test="users-delete-confirm"]').trigger('click')
  await flushPromises()

  expect(deleteUserMock).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
  expect(listUsersMock).toHaveBeenCalledTimes(2)
})
```

Add this explicit stub to the page test mount options so page tests do not run the full drawer lifecycle:

```ts
global: {
  stubs: {
    UserFormDrawer: {
      name: 'UserFormDrawer',
      props: ['show', 'userId'],
      emits: ['update:show', 'saved'],
      template: '<div data-test="user-form-drawer" />',
    },
  },
}
```

- [ ] **Step 2: Run user page tests to verify they fail**

Run:

```bash
pnpm --filter @rev30/client test -- users
```

Expected: FAIL because the page does not wire user drawer state or delete confirmation.

- [ ] **Step 3: Wire `users.vue`**

Update imports in `apps/client/src/pages/index/system/users.vue`:

```ts
import { useDialog, useMessage } from 'naive-ui'
import UserFormDrawer from '../../../features/system/UserFormDrawer.vue'
import { deleteUser } from '../../../features/system'
```

Add state and handlers:

```ts
const dialog = useDialog()
const message = useMessage()
const userDrawerVisible = ref(false)
const editingUserId = ref<string | null>(null)

function openEditUserDrawer(user: UserListItem) {
  editingUserId.value = user.id
  userDrawerVisible.value = true
}

async function refreshUsers() {
  query.value = { ...query.value }
}

function confirmDeleteUser(user: UserListItem) {
  dialog.warning({
    title: '删除用户',
    content: `确认删除用户「${user.username}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteUser(user.id)
        message.success('用户已删除')
        await refreshUsers()
      } catch (error) {
        message.error(getSystemErrorMessage(error, '删除用户失败'))
        return false
      }
    },
  })
}
```

Wire row actions:

```ts
render: (user) =>
  renderTableActions([
    renderTableActionButton({
      label: '编辑',
      accessCode: 'system:user:update',
      testId: 'users-edit',
      onClick: () => openEditUserDrawer(user),
    }),
    renderTableActionButton({
      label: '删除',
      accessCode: 'system:user:delete',
      type: 'error',
      testId: 'users-delete',
      onClick: () => confirmDeleteUser(user),
    }),
  ]),
```

Keep the existing create button without a click handler:

```vue
<NButton v-can="'system:user:create'" data-test="users-create" type="primary">
  新增用户
</NButton>
```

Mount drawer:

```vue
<UserFormDrawer
  v-model:show="userDrawerVisible"
  :user-id="editingUserId"
  @saved="refreshUsers"
/>
```

- [ ] **Step 4: Run user page tests**

Run:

```bash
pnpm --filter @rev30/client test -- users
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/pages/index/system/users.vue apps/client/__tests__/pages/system/users.test.ts
git commit -m "feat: wire user management actions"
```

---

### Task 7: Full Verification And Cleanup

**Files:**
- Modify only files with test, typecheck, lint, or build failures from earlier tasks.

- [ ] **Step 1: Run targeted client tests**

Run:

```bash
pnpm --filter @rev30/client test -- requests RoleFormDrawer UserFormDrawer roles users
```

Expected: PASS.

- [ ] **Step 2: Run targeted server tests**

Run:

```bash
pnpm --filter @rev30/server test -- roles users
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS. If Hono client route accessors differ from the planned `api.system.roles[':id']` shape, inspect the generated TypeScript error and adjust only the request helper calls to the shape already used by the installed `hono/client` types.

- [ ] **Step 4: Run full project check**

Run:

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 5: Manual verification path**

Run the app:

```bash
pnpm dev
```

Verify in browser:

1. Register a normal user.
2. Log in as the bootstrap admin.
3. Create a role from `/system/roles` and check at least one menu resource plus one action resource.
4. Edit the registered user from `/system/users` and assign the new role.
5. Log out and log in as the normal user.
6. Confirm that the visible menu and buttons match the assigned resources.

Expected: The management list refreshes after saves and deletes. The current browser session does not update permissions until refresh, token refresh, or login. After this manual check, run `git status --short`; expected output is empty because each implementation task already committed its own changes.
