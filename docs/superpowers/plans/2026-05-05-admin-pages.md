# Admin Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the desktop-first admin shell and four read-only system management pages backed by the existing system APIs.

**Architecture:** Keep one shared `AdminLayout.vue` for navigation and session actions, while each page owns its title, filters, table, and pagination. Use Hono RPC request helpers under `features/system`, Pinia Colada `useQuery` for async state, and pure tree utilities for department/resource filtering.

**Tech Stack:** Vue 3 Composition API, vue-router/vite file routes, Pinia, Pinia Colada, Naive UI, Tailwind CSS v4, Vitest, Vue Test Utils, shared zod schemas from `@rev30/shared`.

---

## File Structure

- Create `apps/client/src/components/admin/AdminLayout.vue`
  - Owns the desktop admin shell, left navigation, current user summary, theme switch, and logout.
- Modify `apps/client/src/router/guards.ts`
  - Protect all non-auth routes and redirect authenticated users to `/system/users`.
- Modify `apps/client/src/pages/index.vue`
  - Replace the old welcome page with a redirect to `/system/users`.
- Create `apps/client/src/pages/system.vue`
  - File-route parent that wraps child system pages with `AdminLayout`.
- Create `apps/client/src/pages/system/index.vue`
  - Redirect `/system` to `/system/users`.
- Create `apps/client/src/pages/system/users.vue`
  - User paginated table backed by `listUsers()`.
- Create `apps/client/src/pages/system/departments.vue`
  - Department read-only tree table backed by `getDepartmentTree()`.
- Create `apps/client/src/pages/system/roles.vue`
  - Role paginated table backed by `listRoles()`.
- Create `apps/client/src/pages/system/resources.vue`
  - Resource read-only tree table backed by `getResourceTree()`.
- Create `apps/client/src/features/system/requests.ts`
  - Request parsing, system request error type, and typed API functions.
- Create `apps/client/src/features/system/tree.ts`
  - Pure tree filtering and node counting utilities.
- Create `apps/client/src/features/system/labels.ts`
  - Small label maps for status, resource types, hidden state, and dates.
- Create or modify client tests under `apps/client/__tests__`
  - Guard tests, layout tests, request helper tests, tree utility tests, and page behavior tests.

---

### Task 1: Protect Admin Routes And Redirect Default Entrypoints

**Files:**
- Modify: `apps/client/src/router/guards.ts`
- Modify: `apps/client/src/pages/index.vue`
- Create: `apps/client/src/pages/system/index.vue`
- Modify: `apps/client/__tests__/router/guards.test.ts`
- Modify: `apps/client/__tests__/pages/index.test.ts`

- [ ] **Step 1: Write failing guard tests**

Update `apps/client/__tests__/router/guards.test.ts` so the test router includes `/system/users` and asserts all non-auth pages are protected.

```ts
function createTestRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<main>Home</main>' } },
      { path: '/system/users', component: { template: '<main>Users</main>' } },
      { path: '/login', component: { template: '<main>Login</main>' } },
      { path: '/register', component: { template: '<main>Register</main>' } },
    ],
  })

  installAuthGuards(router)

  return router
}

it('redirects unauthenticated users from admin pages to login with redirect query', async () => {
  refreshSessionMock.mockRejectedValue(new Error('refresh failed'))
  const router = createTestRouter()

  await router.push('/system/users')

  const auth = useAuthStore()

  expect(refreshSessionMock).toHaveBeenCalledOnce()
  expect(auth.isAuthenticated).toBe(false)
  expect(auth.isReady).toBe(true)
  expect(router.currentRoute.value.path).toBe('/login')
  expect(router.currentRoute.value.query).toEqual({ redirect: '/system/users' })
})

it('redirects authenticated users away from auth pages to the admin default route', async () => {
  const auth = useAuthStore()
  auth.setSession(session)
  auth.markReady()
  const router = createTestRouter()

  await router.push('/login')

  expect(refreshSessionMock).not.toHaveBeenCalled()
  expect(router.currentRoute.value.fullPath).toBe('/system/users')
})
```

Replace the old home-page tests in `apps/client/__tests__/pages/index.test.ts` with redirect-focused tests:

```ts
it('redirects the authenticated root page to user management', async () => {
  const { router } = await mountHomePage()
  const auth = useAuthStore()
  auth.setSession(session)
  auth.markReady()

  await router.push('/')
  await flushPromises()

  expect(router.currentRoute.value.fullPath).toBe('/system/users')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/router/guards.test.ts __tests__/pages/index.test.ts
```

Expected: FAIL because `/system/users` is not protected and `/login` still redirects to `/`.

- [ ] **Step 3: Implement the guard and redirects**

Update `apps/client/src/router/guards.ts`:

```ts
import type { Router } from 'vue-router'
import { refreshSession } from '../features/auth'
import { useAuthStore } from '../stores/auth'

export const adminDefaultRoute = '/system/users'
export const authRoutes = new Set(['/login', '/register'])

export function installAuthGuards(router: Router) {
  router.beforeEach(async (to) => {
    const auth = useAuthStore()

    if (authRoutes.has(to.path)) {
      return auth.isAuthenticated ? { path: adminDefaultRoute } : true
    }

    if (auth.isAuthenticated) {
      return true
    }

    if (!auth.isReady) {
      try {
        auth.setSession(await refreshSession())
      } catch {
        auth.clearSession()
      } finally {
        auth.markReady()
      }
    }

    return auth.isAuthenticated ? true : { path: '/login', query: { redirect: to.fullPath } }
  })
}
```

Replace `apps/client/src/pages/index.vue`:

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { adminDefaultRoute } from '../router/guards'

const router = useRouter()

onMounted(() => {
  void router.replace(adminDefaultRoute)
})
</script>

<template>
  <main class="min-h-screen bg-slate-50 dark:bg-slate-950" />
</template>
```

Create `apps/client/src/pages/system/index.vue`:

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { adminDefaultRoute } from '../../router/guards'

const router = useRouter()

onMounted(() => {
  void router.replace(adminDefaultRoute)
})
</script>

<template>
  <div />
</template>
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/router/guards.test.ts __tests__/pages/index.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/router/guards.ts apps/client/src/pages/index.vue apps/client/src/pages/system/index.vue apps/client/__tests__/router/guards.test.ts apps/client/__tests__/pages/index.test.ts
git commit -m "feat: protect admin routes"
```

---

### Task 2: Add Tree Filtering Utilities

**Files:**
- Create: `apps/client/src/features/system/tree.ts`
- Create: `apps/client/__tests__/features/system/tree.test.ts`

- [ ] **Step 1: Write failing tree utility tests**

Create `apps/client/__tests__/features/system/tree.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { filterTree, countTreeNodes } from '../../../src/features/system/tree'

type TestNode = {
  id: string
  name: string
  code: string
  status: 0 | 1
  type?: string
  children: TestNode[]
}

const tree: TestNode[] = [
  {
    id: 'root',
    name: '总部',
    code: 'hq',
    status: 1,
    children: [
      {
        id: 'engineering',
        name: '研发中心',
        code: 'eng',
        status: 1,
        children: [
          {
            id: 'platform',
            name: '平台组',
            code: 'platform',
            status: 0,
            type: 'menu',
            children: [],
          },
        ],
      },
      {
        id: 'finance',
        name: '财务部',
        code: 'finance',
        status: 1,
        type: 'directory',
        children: [],
      },
    ],
  },
]

describe('system tree utilities', () => {
  it('keeps ancestors when a child node matches', () => {
    const result = filterTree(tree, {
      matches: (node) => node.code === 'platform',
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('root')
    expect(result[0]?.children[0]?.id).toBe('engineering')
    expect(result[0]?.children[0]?.children[0]?.id).toBe('platform')
    expect(result[0]?.children).toHaveLength(1)
  })

  it('filters by multiple predicates without mutating the original tree', () => {
    const result = filterTree(tree, {
      matches: (node) => node.status === 1 && node.type === 'directory',
    })

    expect(result[0]?.children).toHaveLength(1)
    expect(result[0]?.children[0]?.id).toBe('finance')
    expect(tree[0]?.children).toHaveLength(2)
  })

  it('counts all visible nodes in a filtered tree', () => {
    const result = filterTree(tree, {
      matches: (node) => node.code.includes('platform'),
    })

    expect(countTreeNodes(result)).toBe(3)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/features/system/tree.test.ts
```

Expected: FAIL because `features/system/tree.ts` does not exist.

- [ ] **Step 3: Implement minimal tree utilities**

Create `apps/client/src/features/system/tree.ts`:

```ts
export type TreeNodeWithChildren<TNode> = TNode & {
  children: TreeNodeWithChildren<TNode>[]
}

export type TreeFilterOptions<TNode> = {
  matches: (node: TreeNodeWithChildren<TNode>) => boolean
}

export function filterTree<TNode>(
  nodes: TreeNodeWithChildren<TNode>[],
  options: TreeFilterOptions<TNode>,
): TreeNodeWithChildren<TNode>[] {
  return nodes.flatMap((node) => {
    const filteredChildren = filterTree(node.children, options)

    if (!options.matches(node) && filteredChildren.length === 0) {
      return []
    }

    return [
      {
        ...node,
        children: filteredChildren,
      },
    ]
  })
}

export function countTreeNodes<TNode>(nodes: TreeNodeWithChildren<TNode>[]) {
  return nodes.reduce((total, node) => total + 1 + countTreeNodes(node.children), 0)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/features/system/tree.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/system/tree.ts apps/client/__tests__/features/system/tree.test.ts
git commit -m "feat: add system tree filtering"
```

---

### Task 3: Add System Request Helpers

**Files:**
- Create: `apps/client/src/features/system/requests.ts`
- Create: `apps/client/src/features/system/labels.ts`
- Create: `apps/client/__tests__/features/system/requests.test.ts`

- [ ] **Step 1: Write failing request helper tests**

Create `apps/client/__tests__/features/system/requests.test.ts`:

```ts
// @vitest-environment happy-dom

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { USER_STATUS_ENABLED } from '@rev30/shared'
import { getSystemErrorMessage, listUsers, SystemRequestError } from '../../../src/features/system/requests'
import { useAuthStore } from '../../../src/stores/auth'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('system request helpers', () => {
  it('parses list responses from the system users endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          list: [],
          total: 0,
          page: 1,
          pageSize: 20,
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore().accessToken = 'access-token'

    const result = await listUsers({ page: 1, pageSize: 20, keyword: 'ada', status: USER_STATUS_ENABLED })

    expect(result.total).toBe(0)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/system/users')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('keyword=ada')
  })

  it('throws a stable request error with the response message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: '查询失败' }), {
        status: 500,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(listUsers({ page: 1, pageSize: 20 })).rejects.toMatchObject({
      status: 500,
      message: '查询失败',
    })
  })

  it('formats unknown request errors with a fallback message', () => {
    expect(getSystemErrorMessage(new SystemRequestError(400, '请求体无效'), '加载用户失败')).toBe(
      '请求体无效',
    )
    expect(getSystemErrorMessage(new Error('boom'), '加载用户失败')).toBe('加载用户失败')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/features/system/requests.test.ts
```

Expected: FAIL because request helpers do not exist.

- [ ] **Step 3: Implement request helpers and labels**

Create `apps/client/src/features/system/requests.ts`:

```ts
import { z } from 'zod'
import {
  departmentTreeNodeSchema,
  resourceTreeNodeSchema,
  roleListResponseSchema,
  userListResponseSchema,
  type DepartmentTreeNode,
  type ResourceTreeNode,
  type RoleListQuery,
  type RoleListResponse,
  type UserListQuery,
  type UserListResponse,
} from '@rev30/shared'
import { api } from '../../api'

type QueryValue = string | number | undefined

export class SystemRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'SystemRequestError'
  }
}

function buildQuery(input: Record<string, QueryValue>) {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => [key, String(value)]),
  )
}

async function parseSystemError(response: Response) {
  try {
    const result = z.object({ message: z.string() }).safeParse(await response.json())

    return new SystemRequestError(response.status, result.success ? result.data.message : '请求失败')
  } catch {
    return new SystemRequestError(response.status, '请求失败')
  }
}

async function parseSystemResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  if (!response.ok) {
    throw await parseSystemError(response)
  }

  return schema.parse(await response.json())
}

export function getSystemErrorMessage(error: unknown, fallback: string) {
  return error instanceof SystemRequestError ? error.message : fallback
}

export async function listUsers(query: UserListQuery): Promise<UserListResponse> {
  const response = await api.system.users.$get({
    query: buildQuery(query) as {
      page?: string
      pageSize?: string
      keyword?: string
      status?: string
    },
  })

  return parseSystemResponse(response, userListResponseSchema)
}

export async function listRoles(query: RoleListQuery): Promise<RoleListResponse> {
  const response = await api.system.roles.$get({
    query: buildQuery(query) as {
      page?: string
      pageSize?: string
      keyword?: string
      status?: string
    },
  })

  return parseSystemResponse(response, roleListResponseSchema)
}

export async function getDepartmentTree(): Promise<DepartmentTreeNode[]> {
  const response = await api.system.departments.tree.$get()

  return parseSystemResponse(response, z.array(departmentTreeNodeSchema))
}

export async function getResourceTree(): Promise<ResourceTreeNode[]> {
  const response = await api.system.resources.tree.$get()

  return parseSystemResponse(response, z.array(resourceTreeNodeSchema))
}
```

Create `apps/client/src/features/system/labels.ts`:

```ts
import {
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_EXTERNAL,
  RESOURCE_TYPE_MENU,
  type ResourceType,
} from '@rev30/shared'

export const statusLabels = {
  0: '禁用',
  1: '启用',
} as const

export const statusTagTypes = {
  0: 'default',
  1: 'success',
} as const

export const resourceTypeLabels: Record<ResourceType, string> = {
  [RESOURCE_TYPE_DIRECTORY]: '目录',
  [RESOURCE_TYPE_MENU]: '菜单',
  [RESOURCE_TYPE_EXTERNAL]: '外链',
  [RESOURCE_TYPE_ACTION]: '操作',
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/features/system/requests.test.ts
```

Expected: PASS. If TypeScript rejects Hono query casting during later typecheck, keep `buildQuery()` but adjust the cast to the inferred Hono client query type instead of weakening to `any`.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/system/requests.ts apps/client/src/features/system/labels.ts apps/client/__tests__/features/system/requests.test.ts
git commit -m "feat: add system api helpers"
```

---

### Task 4: Add Admin Layout Shell

**Files:**
- Create: `apps/client/src/components/admin/AdminLayout.vue`
- Create: `apps/client/src/pages/system.vue`
- Create: `apps/client/__tests__/components/admin/AdminLayout.test.ts`

- [ ] **Step 1: Write failing layout tests**

Create `apps/client/__tests__/components/admin/AdminLayout.test.ts`:

```ts
// @vitest-environment happy-dom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminLayout from '../../../src/components/admin/AdminLayout.vue'
import { logout } from '../../../src/features/auth'
import { useAuthStore } from '../../../src/stores/auth'
import { session, stubPreferredDark } from '../../helpers/auth'

enableAutoUnmount(afterEach)

vi.mock('../../../src/features/auth', () => ({
  logout: vi.fn(),
}))

const logoutMock = vi.mocked(logout)

async function mountLayout() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/system/users', component: { template: '<main>Users</main>' } },
      { path: '/system/departments', component: { template: '<main>Departments</main>' } },
      { path: '/login', component: { template: '<main>Login</main>' } },
    ],
  })
  useAuthStore().setSession(session)
  await router.push('/system/users')
  await router.isReady()

  const wrapper = mount(AdminLayout, {
    slots: {
      default: '<section data-test="layout-content">Content</section>',
    },
    global: {
      plugins: [pinia, router],
    },
  })

  return { router, wrapper }
}

describe('AdminLayout', () => {
  beforeEach(() => {
    logoutMock.mockReset()
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
    stubPreferredDark(false)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders navigation, user summary, and page content', async () => {
    const { wrapper } = await mountLayout()

    expect(wrapper.text()).toContain('Rev30')
    expect(wrapper.text()).toContain('后台管理')
    expect(wrapper.text()).toContain('用户管理')
    expect(wrapper.text()).toContain('部门管理')
    expect(wrapper.text()).toContain('Ada Lovelace')
    expect(wrapper.find('[data-test="layout-content"]').exists()).toBe(true)
  })

  it('logs out and navigates to login', async () => {
    logoutMock.mockResolvedValue(undefined)
    const { router, wrapper } = await mountLayout()
    const auth = useAuthStore()

    await wrapper.find('[data-test="admin-logout"]').trigger('click')
    await flushPromises()

    expect(logoutMock).toHaveBeenCalledOnce()
    expect(auth.isAuthenticated).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/login')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/components/admin/AdminLayout.test.ts
```

Expected: FAIL because `AdminLayout.vue` does not exist.

- [ ] **Step 3: Implement the layout**

Create `apps/client/src/components/admin/AdminLayout.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useMutation } from '@pinia/colada'
import { NButton } from 'naive-ui'
import ThemeModeSwitch from '../common/ThemeModeSwitch.vue'
import { logout } from '../../features/auth'
import { useAuthStore } from '../../stores/auth'

const router = useRouter()
const auth = useAuthStore()

const user = computed(() => auth.user)
const navigationItems = [
  { path: '/system/users', label: '用户管理', icon: 'i-[lucide--users]' },
  { path: '/system/departments', label: '部门管理', icon: 'i-[lucide--building-2]' },
  { path: '/system/roles', label: '角色管理', icon: 'i-[lucide--shield-check]' },
  { path: '/system/resources', label: '资源管理', icon: 'i-[lucide--blocks]' },
] as const

const logoutMutation = useMutation({
  mutation: () => logout(),
  async onSettled() {
    auth.clearSession()
    await router.push('/login')
  },
})

function handleLogout() {
  logoutMutation.mutate()
}
</script>

<template>
  <div class="flex min-h-screen min-w-[1120px] bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
    <aside class="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div class="border-b border-slate-200 px-6 py-5 dark:border-slate-800">
        <p class="text-lg font-semibold tracking-normal">Rev30</p>
        <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">后台管理</p>
      </div>

      <nav class="flex-1 px-3 py-4">
        <p class="px-3 pb-2 text-xs font-medium text-slate-500 dark:text-slate-400">系统管理</p>
        <RouterLink
          v-for="item in navigationItems"
          :key="item.path"
          :to="item.path"
          class="mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          active-class="bg-primary-muted text-primary dark:text-primary"
        >
          <span class="inline-block size-4 shrink-0" :class="item.icon" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <p class="text-sm font-medium text-slate-500 dark:text-slate-400">系统管理</p>
        </div>
        <div class="flex items-center gap-3">
          <ThemeModeSwitch />
          <div v-if="user" class="text-right">
            <p class="text-sm font-medium">{{ user.nickname }}</p>
            <p class="text-xs text-slate-500 dark:text-slate-400">@{{ user.username }}</p>
          </div>
          <NButton data-test="admin-logout" :loading="logoutMutation.isLoading.value" @click="handleLogout">
            退出
          </NButton>
        </div>
      </header>

      <main class="min-w-0 flex-1 overflow-auto p-6">
        <slot />
      </main>
    </div>
  </div>
</template>
```

Create `apps/client/src/pages/system.vue`:

```vue
<script setup lang="ts">
import AdminLayout from '../components/admin/AdminLayout.vue'
</script>

<template>
  <AdminLayout>
    <RouterView />
  </AdminLayout>
</template>
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/components/admin/AdminLayout.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/components/admin/AdminLayout.vue apps/client/src/pages/system.vue apps/client/__tests__/components/admin/AdminLayout.test.ts
git commit -m "feat: add admin layout"
```

---

### Task 5: Add User Management Page

**Files:**
- Create: `apps/client/src/pages/system/users.vue`
- Create: `apps/client/__tests__/pages/system/users.test.ts`

- [ ] **Step 1: Write failing user page tests**

Create `apps/client/__tests__/pages/system/users.test.ts` with mocked request helpers:

```ts
// @vitest-environment happy-dom

import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { USER_STATUS_DISABLED, USER_STATUS_ENABLED } from '@rev30/shared'
import { listUsers } from '../../../src/features/system/requests'
import UsersPage from '../../../src/pages/system/users.vue'
import { disposeActiveTestPinia, mountAuthRoute, stubPreferredDark } from '../../helpers/auth'

enableAutoUnmount(afterEach)

vi.mock('../../../src/features/system/requests', () => ({
  listUsers: vi.fn(),
  getSystemErrorMessage: vi.fn((error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  ),
}))

const listUsersMock = vi.mocked(listUsers)

const userListResponse = {
  list: [
    {
      id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
      username: 'ada',
      nickname: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: null,
      status: USER_STATUS_ENABLED,
      departments: [{ id: '11111111-1111-4111-8111-111111111111', name: '研发中心', code: 'eng' }],
      roles: [{ id: '22222222-2222-4222-8222-222222222222', name: '管理员', code: 'admin' }],
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
}

async function mountUsersPage() {
  return mountAuthRoute('/system/users', [{ path: '/system/users', component: UsersPage }])
}

describe('user management page', () => {
  beforeEach(() => {
    listUsersMock.mockReset()
    listUsersMock.mockResolvedValue(userListResponse)
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
    stubPreferredDark(false)
  })

  afterEach(() => {
    disposeActiveTestPinia()
    vi.unstubAllGlobals()
  })

  it('loads and renders users with departments and roles', async () => {
    const { wrapper } = await mountUsersPage()
    await flushPromises()

    expect(listUsersMock).toHaveBeenCalledWith({ page: 1, pageSize: 20 })
    expect(wrapper.text()).toContain('用户管理')
    expect(wrapper.text()).toContain('Ada Lovelace')
    expect(wrapper.text()).toContain('ada@example.com')
    expect(wrapper.text()).toContain('研发中心')
    expect(wrapper.text()).toContain('管理员')
    expect(wrapper.text()).toContain('共 1 个用户')
  })

  it('submits keyword and status filters from page one', async () => {
    const { wrapper } = await mountUsersPage()
    await flushPromises()

    await wrapper.find('[data-test="users-keyword"] input').setValue('ada')
    wrapper.findComponent('[data-test="users-status"]').vm.$emit('update:value', USER_STATUS_DISABLED)
    await wrapper.find('[data-test="users-search"]').trigger('click')
    await flushPromises()

    expect(listUsersMock).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 20,
      keyword: 'ada',
      status: USER_STATUS_DISABLED,
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/pages/system/users.test.ts
```

Expected: FAIL because the page does not exist.

- [ ] **Step 3: Implement user page**

Create `apps/client/src/pages/system/users.vue` with this structure:

```vue
<script setup lang="ts">
import { computed, h, reactive, ref } from 'vue'
import { useQuery } from '@pinia/colada'
import { NAlert, NButton, NDataTable, NInput, NSelect, NTag, type DataTableColumns } from 'naive-ui'
import type { User } from '@rev30/shared'
import { USER_STATUS_DISABLED, USER_STATUS_ENABLED } from '@rev30/shared'
import { getSystemErrorMessage, listUsers } from '../../features/system/requests'
import { formatDateTime, statusLabels, statusTagTypes } from '../../features/system/labels'

const filters = reactive<{ keyword: string; status: 0 | 1 | null }>({
  keyword: '',
  status: null,
})
const query = ref<{ page: number; pageSize: number; keyword?: string; status?: 0 | 1 }>({
  page: 1,
  pageSize: 20,
})

const statusOptions = [
  { label: '全部状态', value: null },
  { label: '启用', value: USER_STATUS_ENABLED },
  { label: '禁用', value: USER_STATUS_DISABLED },
]

const usersQuery = useQuery({
  key: () => ['system', 'users', query.value],
  query: () => listUsers(query.value),
})

const rows = computed(() => usersQuery.state.value.data?.list ?? [])
const total = computed(() => usersQuery.state.value.data?.total ?? 0)
const errorMessage = computed(() =>
  usersQuery.state.value.status === 'error'
    ? getSystemErrorMessage(usersQuery.state.value.error, '加载用户失败')
    : '',
)

function summaryText(items: { name: string }[]) {
  if (items.length === 0) {
    return '-'
  }

  return items.length <= 2
    ? items.map((item) => item.name).join('、')
    : `${items.slice(0, 2).map((item) => item.name).join('、')} 等 ${items.length} 个`
}

function contactText(user: User) {
  return user.email ?? user.phone ?? '-'
}

function handleSearch() {
  query.value = {
    page: 1,
    pageSize: query.value.pageSize,
    ...(filters.keyword.trim() === '' ? {} : { keyword: filters.keyword.trim() }),
    ...(filters.status === null ? {} : { status: filters.status }),
  }
}

function handleReset() {
  filters.keyword = ''
  filters.status = null
  query.value = { page: 1, pageSize: query.value.pageSize }
}

function handlePageChange(page: number) {
  query.value = { ...query.value, page }
}

const columns: DataTableColumns<User> = [
  { title: '用户名', key: 'username', width: 140 },
  { title: '昵称', key: 'nickname', width: 160 },
  { title: '联系方式', key: 'contact', render: contactText },
  {
    title: '状态',
    key: 'status',
    width: 96,
    render: (row) =>
      h(NTag, { size: 'small', type: statusTagTypes[row.status] }, { default: () => statusLabels[row.status] }),
  },
  { title: '部门', key: 'departments', render: (row) => summaryText(row.departments) },
  { title: '角色', key: 'roles', render: (row) => summaryText(row.roles) },
  { title: '创建时间', key: 'createdAt', width: 180, render: (row) => formatDateTime(row.createdAt) },
]
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-normal">用户管理</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">共 {{ total }} 个用户</p>
      </div>
      <NButton :loading="usersQuery.isLoading.value" @click="usersQuery.refetch()">刷新</NButton>
    </div>

    <NAlert v-if="errorMessage" type="error" :show-icon="false">{{ errorMessage }}</NAlert>

    <div class="flex items-center gap-3">
      <NInput data-test="users-keyword" v-model:value="filters.keyword" clearable placeholder="搜索用户名、昵称、邮箱或手机" class="max-w-xs" @keydown.enter="handleSearch" />
      <NSelect data-test="users-status" v-model:value="filters.status" :options="statusOptions" class="w-36" />
      <NButton data-test="users-search" type="primary" @click="handleSearch">查询</NButton>
      <NButton @click="handleReset">重置</NButton>
    </div>

    <NDataTable
      :columns="columns"
      :data="rows"
      :loading="usersQuery.asyncStatus.value === 'loading'"
      :row-key="(row) => row.id"
      :pagination="{ page: query.page, pageSize: query.pageSize, itemCount: total, onUpdatePage: handlePageChange }"
    />
  </section>
</template>
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/pages/system/users.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/pages/system/users.vue apps/client/__tests__/pages/system/users.test.ts
git commit -m "feat: add user management page"
```

---

### Task 6: Add Role Management Page

**Files:**
- Create: `apps/client/src/pages/system/roles.vue`
- Create: `apps/client/__tests__/pages/system/roles.test.ts`

- [ ] **Step 1: Write failing role page tests**

Create `apps/client/__tests__/pages/system/roles.test.ts`:

```ts
// @vitest-environment happy-dom

import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROLE_STATUS_DISABLED, ROLE_STATUS_ENABLED } from '@rev30/shared'
import { listRoles } from '../../../src/features/system/requests'
import RolesPage from '../../../src/pages/system/roles.vue'
import { disposeActiveTestPinia, mountAuthRoute, stubPreferredDark } from '../../helpers/auth'

enableAutoUnmount(afterEach)

vi.mock('../../../src/features/system/requests', () => ({
  listRoles: vi.fn(),
  getSystemErrorMessage: vi.fn((error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  ),
}))

const listRolesMock = vi.mocked(listRoles)

const roleListResponse = {
  list: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: '管理员',
      code: 'admin',
      status: ROLE_STATUS_ENABLED,
      sortOrder: 0,
      userCount: 2,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
}

async function mountRolesPage() {
  return mountAuthRoute('/system/roles', [{ path: '/system/roles', component: RolesPage }])
}

describe('role management page', () => {
  beforeEach(() => {
    listRolesMock.mockReset()
    listRolesMock.mockResolvedValue(roleListResponse)
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
    stubPreferredDark(false)
  })

  afterEach(() => {
    disposeActiveTestPinia()
    vi.unstubAllGlobals()
  })

  it('loads and renders roles', async () => {
    const { wrapper } = await mountRolesPage()
    await flushPromises()

    expect(listRolesMock).toHaveBeenCalledWith({ page: 1, pageSize: 20 })
    expect(wrapper.text()).toContain('角色管理')
    expect(wrapper.text()).toContain('管理员')
    expect(wrapper.text()).toContain('admin')
    expect(wrapper.text()).toContain('2')
    expect(wrapper.text()).toContain('共 1 个角色')
  })

  it('submits keyword and status filters from page one', async () => {
    const { wrapper } = await mountRolesPage()
    await flushPromises()

    await wrapper.find('[data-test="roles-keyword"] input').setValue('admin')
    wrapper.findComponent('[data-test="roles-status"]').vm.$emit('update:value', ROLE_STATUS_DISABLED)
    await wrapper.find('[data-test="roles-search"]').trigger('click')
    await flushPromises()

    expect(listRolesMock).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 20,
      keyword: 'admin',
      status: ROLE_STATUS_DISABLED,
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/pages/system/roles.test.ts
```

Expected: FAIL because the page does not exist.

- [ ] **Step 3: Implement role page**

Create `apps/client/src/pages/system/roles.vue` using the user-page pattern with role-specific columns:

```vue
<script setup lang="ts">
import { computed, h, reactive, ref } from 'vue'
import { useQuery } from '@pinia/colada'
import { NAlert, NButton, NDataTable, NInput, NSelect, NTag, type DataTableColumns } from 'naive-ui'
import type { RoleListItem } from '@rev30/shared'
import { ROLE_STATUS_DISABLED, ROLE_STATUS_ENABLED } from '@rev30/shared'
import { getSystemErrorMessage, listRoles } from '../../features/system/requests'
import { formatDateTime, statusLabels, statusTagTypes } from '../../features/system/labels'

const filters = reactive<{ keyword: string; status: 0 | 1 | null }>({ keyword: '', status: null })
const query = ref<{ page: number; pageSize: number; keyword?: string; status?: 0 | 1 }>({ page: 1, pageSize: 20 })
const statusOptions = [
  { label: '全部状态', value: null },
  { label: '启用', value: ROLE_STATUS_ENABLED },
  { label: '禁用', value: ROLE_STATUS_DISABLED },
]

const rolesQuery = useQuery({
  key: () => ['system', 'roles', query.value],
  query: () => listRoles(query.value),
})

const rows = computed(() => rolesQuery.state.value.data?.list ?? [])
const total = computed(() => rolesQuery.state.value.data?.total ?? 0)
const errorMessage = computed(() =>
  rolesQuery.state.value.status === 'error'
    ? getSystemErrorMessage(rolesQuery.state.value.error, '加载角色失败')
    : '',
)

function handleSearch() {
  query.value = {
    page: 1,
    pageSize: query.value.pageSize,
    ...(filters.keyword.trim() === '' ? {} : { keyword: filters.keyword.trim() }),
    ...(filters.status === null ? {} : { status: filters.status }),
  }
}

function handleReset() {
  filters.keyword = ''
  filters.status = null
  query.value = { page: 1, pageSize: query.value.pageSize }
}

function handlePageChange(page: number) {
  query.value = { ...query.value, page }
}

const columns: DataTableColumns<RoleListItem> = [
  { title: '角色名称', key: 'name', width: 180 },
  { title: '角色编码', key: 'code', width: 180 },
  {
    title: '状态',
    key: 'status',
    width: 96,
    render: (row) =>
      h(NTag, { size: 'small', type: statusTagTypes[row.status] }, { default: () => statusLabels[row.status] }),
  },
  { title: '用户数', key: 'userCount', width: 100 },
  { title: '排序', key: 'sortOrder', width: 100 },
  { title: '创建时间', key: 'createdAt', width: 180, render: (row) => formatDateTime(row.createdAt) },
]
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-normal">角色管理</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">共 {{ total }} 个角色</p>
      </div>
      <NButton :loading="rolesQuery.isLoading.value" @click="rolesQuery.refetch()">刷新</NButton>
    </div>

    <NAlert v-if="errorMessage" type="error" :show-icon="false">{{ errorMessage }}</NAlert>

    <div class="flex items-center gap-3">
      <NInput data-test="roles-keyword" v-model:value="filters.keyword" clearable placeholder="搜索角色名称或编码" class="max-w-xs" @keydown.enter="handleSearch" />
      <NSelect data-test="roles-status" v-model:value="filters.status" :options="statusOptions" class="w-36" />
      <NButton data-test="roles-search" type="primary" @click="handleSearch">查询</NButton>
      <NButton @click="handleReset">重置</NButton>
    </div>

    <NDataTable
      :columns="columns"
      :data="rows"
      :loading="rolesQuery.asyncStatus.value === 'loading'"
      :row-key="(row) => row.id"
      :pagination="{ page: query.page, pageSize: query.pageSize, itemCount: total, onUpdatePage: handlePageChange }"
    />
  </section>
</template>
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/pages/system/roles.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/pages/system/roles.vue apps/client/__tests__/pages/system/roles.test.ts
git commit -m "feat: add role management page"
```

---

### Task 7: Add Department Tree Page

**Files:**
- Create: `apps/client/src/pages/system/departments.vue`
- Create: `apps/client/__tests__/pages/system/departments.test.ts`

- [ ] **Step 1: Write failing department page tests**

Create `apps/client/__tests__/pages/system/departments.test.ts`:

```ts
// @vitest-environment happy-dom

import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEPARTMENT_STATUS_DISABLED, DEPARTMENT_STATUS_ENABLED } from '@rev30/shared'
import { getDepartmentTree } from '../../../src/features/system/requests'
import DepartmentsPage from '../../../src/pages/system/departments.vue'
import { disposeActiveTestPinia, mountAuthRoute, stubPreferredDark } from '../../helpers/auth'

enableAutoUnmount(afterEach)

vi.mock('../../../src/features/system/requests', () => ({
  getDepartmentTree: vi.fn(),
  getSystemErrorMessage: vi.fn((error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  ),
}))

const getDepartmentTreeMock = vi.mocked(getDepartmentTree)

const departmentTree = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    parentId: null,
    name: '总部',
    code: 'hq',
    status: DEPARTMENT_STATUS_ENABLED,
    sortOrder: 0,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    children: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        parentId: '11111111-1111-4111-8111-111111111111',
        name: '平台组',
        code: 'platform',
        status: DEPARTMENT_STATUS_DISABLED,
        sortOrder: 1,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
        children: [],
      },
    ],
  },
]

async function mountDepartmentsPage() {
  return mountAuthRoute('/system/departments', [
    { path: '/system/departments', component: DepartmentsPage },
  ])
}

describe('department management page', () => {
  beforeEach(() => {
    getDepartmentTreeMock.mockReset()
    getDepartmentTreeMock.mockResolvedValue(departmentTree)
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
    stubPreferredDark(false)
  })

  afterEach(() => {
    disposeActiveTestPinia()
    vi.unstubAllGlobals()
  })

  it('loads and renders a department tree without pagination', async () => {
    const { wrapper } = await mountDepartmentsPage()
    await flushPromises()

    expect(getDepartmentTreeMock).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('部门管理')
    expect(wrapper.text()).toContain('总部')
    expect(wrapper.text()).toContain('平台组')
    expect(wrapper.text()).toContain('共 2 个部门')
  })

  it('filters by child keyword while preserving the parent context', async () => {
    const { wrapper } = await mountDepartmentsPage()
    await flushPromises()

    await wrapper.find('[data-test="departments-keyword"] input').setValue('platform')
    await wrapper.find('[data-test="departments-search"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('总部')
    expect(wrapper.text()).toContain('平台组')
    expect(wrapper.text()).toContain('共 2 个部门')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/pages/system/departments.test.ts
```

Expected: FAIL because the page does not exist.

- [ ] **Step 3: Implement department tree page**

Create `apps/client/src/pages/system/departments.vue`:

```vue
<script setup lang="ts">
import { computed, h, reactive, ref } from 'vue'
import { useQuery } from '@pinia/colada'
import { NAlert, NButton, NDataTable, NInput, NSelect, NTag, type DataTableColumns } from 'naive-ui'
import type { DepartmentTreeNode } from '@rev30/shared'
import { DEPARTMENT_STATUS_DISABLED, DEPARTMENT_STATUS_ENABLED } from '@rev30/shared'
import { countTreeNodes, filterTree } from '../../features/system/tree'
import { getDepartmentTree, getSystemErrorMessage } from '../../features/system/requests'
import { formatDateTime, statusLabels, statusTagTypes } from '../../features/system/labels'

const filters = reactive<{ keyword: string; status: 0 | 1 | null }>({ keyword: '', status: null })
const activeFilters = ref<{ keyword: string; status: 0 | 1 | null }>({ keyword: '', status: null })

const statusOptions = [
  { label: '全部状态', value: null },
  { label: '启用', value: DEPARTMENT_STATUS_ENABLED },
  { label: '禁用', value: DEPARTMENT_STATUS_DISABLED },
]

const departmentsQuery = useQuery({
  key: ['system', 'departments', 'tree'],
  query: () => getDepartmentTree(),
})

const rawTree = computed(() => departmentsQuery.state.value.data ?? [])
const rows = computed(() =>
  filterTree(rawTree.value, {
    matches: (node) => {
      const keyword = activeFilters.value.keyword.trim().toLowerCase()
      const keywordMatched =
        keyword === '' ||
        node.name.toLowerCase().includes(keyword) ||
        node.code.toLowerCase().includes(keyword)
      const statusMatched = activeFilters.value.status === null || node.status === activeFilters.value.status

      return keywordMatched && statusMatched
    },
  }),
)
const visibleCount = computed(() => countTreeNodes(rows.value))
const errorMessage = computed(() =>
  departmentsQuery.state.value.status === 'error'
    ? getSystemErrorMessage(departmentsQuery.state.value.error, '加载部门失败')
    : '',
)

function handleSearch() {
  activeFilters.value = { keyword: filters.keyword, status: filters.status }
}

function handleReset() {
  filters.keyword = ''
  filters.status = null
  activeFilters.value = { keyword: '', status: null }
}

const columns: DataTableColumns<DepartmentTreeNode> = [
  { title: '部门名称', key: 'name', width: 220 },
  { title: '部门编码', key: 'code', width: 180 },
  {
    title: '状态',
    key: 'status',
    width: 96,
    render: (row) =>
      h(NTag, { size: 'small', type: statusTagTypes[row.status] }, { default: () => statusLabels[row.status] }),
  },
  { title: '排序', key: 'sortOrder', width: 100 },
  { title: '创建时间', key: 'createdAt', width: 180, render: (row) => formatDateTime(row.createdAt) },
]
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-normal">部门管理</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">共 {{ visibleCount }} 个部门</p>
      </div>
      <NButton :loading="departmentsQuery.isLoading.value" @click="departmentsQuery.refetch()">刷新</NButton>
    </div>

    <NAlert v-if="errorMessage" type="error" :show-icon="false">{{ errorMessage }}</NAlert>

    <div class="flex items-center gap-3">
      <NInput data-test="departments-keyword" v-model:value="filters.keyword" clearable placeholder="搜索部门名称或编码" class="max-w-xs" @keydown.enter="handleSearch" />
      <NSelect data-test="departments-status" v-model:value="filters.status" :options="statusOptions" class="w-36" />
      <NButton data-test="departments-search" type="primary" @click="handleSearch">查询</NButton>
      <NButton @click="handleReset">重置</NButton>
    </div>

    <NDataTable
      :columns="columns"
      :data="rows"
      :loading="departmentsQuery.asyncStatus.value === 'loading'"
      :row-key="(row) => row.id"
      default-expand-all
    />
  </section>
</template>
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/pages/system/departments.test.ts __tests__/features/system/tree.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/pages/system/departments.vue apps/client/__tests__/pages/system/departments.test.ts
git commit -m "feat: add department tree page"
```

---

### Task 8: Add Resource Tree Page

**Files:**
- Create: `apps/client/src/pages/system/resources.vue`
- Create: `apps/client/__tests__/pages/system/resources.test.ts`

- [ ] **Step 1: Write failing resource page tests**

Create `apps/client/__tests__/pages/system/resources.test.ts`:

```ts
// @vitest-environment happy-dom

import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_MENU,
} from '@rev30/shared'
import { getResourceTree } from '../../../src/features/system/requests'
import ResourcesPage from '../../../src/pages/system/resources.vue'
import { disposeActiveTestPinia, mountAuthRoute, stubPreferredDark } from '../../helpers/auth'

enableAutoUnmount(afterEach)

vi.mock('../../../src/features/system/requests', () => ({
  getResourceTree: vi.fn(),
  getSystemErrorMessage: vi.fn((error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  ),
}))

const getResourceTreeMock = vi.mocked(getResourceTree)

const resourceTree = [
  {
    id: '44444444-4444-4444-8444-444444444444',
    parentId: null,
    type: RESOURCE_TYPE_DIRECTORY,
    name: '系统管理',
    code: 'system',
    path: null,
    externalUrl: null,
    openTarget: RESOURCE_OPEN_TARGET_SELF,
    icon: 'i-[lucide--settings]',
    hidden: false,
    status: RESOURCE_STATUS_ENABLED,
    sortOrder: 0,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    children: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        parentId: '44444444-4444-4444-8444-444444444444',
        type: RESOURCE_TYPE_MENU,
        name: '用户管理',
        code: 'system:user',
        path: '/system/users',
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
            id: '66666666-6666-4666-8666-666666666666',
            parentId: '55555555-5555-4555-8555-555555555555',
            type: RESOURCE_TYPE_ACTION,
            name: '重置密码',
            code: 'system:user:reset-password',
            path: null,
            externalUrl: null,
            openTarget: RESOURCE_OPEN_TARGET_SELF,
            icon: null,
            hidden: true,
            status: RESOURCE_STATUS_ENABLED,
            sortOrder: 2,
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-01T00:00:00.000Z',
            children: [],
          },
        ],
      },
    ],
  },
]

async function mountResourcesPage() {
  return mountAuthRoute('/system/resources', [
    { path: '/system/resources', component: ResourcesPage },
  ])
}

describe('resource management page', () => {
  beforeEach(() => {
    getResourceTreeMock.mockReset()
    getResourceTreeMock.mockResolvedValue(resourceTree)
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
    stubPreferredDark(false)
  })

  afterEach(() => {
    disposeActiveTestPinia()
    vi.unstubAllGlobals()
  })

  it('loads and renders a resource tree without pagination', async () => {
    const { wrapper } = await mountResourcesPage()
    await flushPromises()

    expect(getResourceTreeMock).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('资源管理')
    expect(wrapper.text()).toContain('系统管理')
    expect(wrapper.text()).toContain('用户管理')
    expect(wrapper.text()).toContain('/system/users')
    expect(wrapper.text()).toContain('共 3 个资源')
  })

  it('filters by action type while preserving parent context', async () => {
    const { wrapper } = await mountResourcesPage()
    await flushPromises()

    wrapper.findComponent('[data-test="resources-type"]').vm.$emit('update:value', RESOURCE_TYPE_ACTION)
    await wrapper.find('[data-test="resources-search"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('系统管理')
    expect(wrapper.text()).toContain('用户管理')
    expect(wrapper.text()).toContain('重置密码')
    expect(wrapper.text()).toContain('共 3 个资源')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/pages/system/resources.test.ts
```

Expected: FAIL because the page does not exist.

- [ ] **Step 3: Implement resource tree page**

Create `apps/client/src/pages/system/resources.vue`:

```vue
<script setup lang="ts">
import { computed, h, reactive, ref } from 'vue'
import { useQuery } from '@pinia/colada'
import { NAlert, NButton, NDataTable, NInput, NSelect, NTag, type DataTableColumns } from 'naive-ui'
import type { ResourceTreeNode, ResourceType } from '@rev30/shared'
import {
  RESOURCE_STATUS_DISABLED,
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_EXTERNAL,
  RESOURCE_TYPE_MENU,
} from '@rev30/shared'
import { countTreeNodes, filterTree } from '../../features/system/tree'
import { getResourceTree, getSystemErrorMessage } from '../../features/system/requests'
import { formatDateTime, resourceTypeLabels, statusLabels, statusTagTypes } from '../../features/system/labels'

const filters = reactive<{ keyword: string; status: 0 | 1 | null; type: ResourceType | null }>({
  keyword: '',
  status: null,
  type: null,
})
const activeFilters = ref<{ keyword: string; status: 0 | 1 | null; type: ResourceType | null }>({
  keyword: '',
  status: null,
  type: null,
})

const statusOptions = [
  { label: '全部状态', value: null },
  { label: '启用', value: RESOURCE_STATUS_ENABLED },
  { label: '禁用', value: RESOURCE_STATUS_DISABLED },
]
const typeOptions = [
  { label: '全部类型', value: null },
  { label: resourceTypeLabels[RESOURCE_TYPE_DIRECTORY], value: RESOURCE_TYPE_DIRECTORY },
  { label: resourceTypeLabels[RESOURCE_TYPE_MENU], value: RESOURCE_TYPE_MENU },
  { label: resourceTypeLabels[RESOURCE_TYPE_EXTERNAL], value: RESOURCE_TYPE_EXTERNAL },
  { label: resourceTypeLabels[RESOURCE_TYPE_ACTION], value: RESOURCE_TYPE_ACTION },
]

const resourcesQuery = useQuery({
  key: ['system', 'resources', 'tree'],
  query: () => getResourceTree(),
})

const rawTree = computed(() => resourcesQuery.state.value.data ?? [])
const rows = computed(() =>
  filterTree(rawTree.value, {
    matches: (node) => {
      const keyword = activeFilters.value.keyword.trim().toLowerCase()
      const keywordMatched =
        keyword === '' ||
        node.name.toLowerCase().includes(keyword) ||
        node.code.toLowerCase().includes(keyword) ||
        (node.path?.toLowerCase().includes(keyword) ?? false) ||
        (node.externalUrl?.toLowerCase().includes(keyword) ?? false)
      const statusMatched = activeFilters.value.status === null || node.status === activeFilters.value.status
      const typeMatched = activeFilters.value.type === null || node.type === activeFilters.value.type

      return keywordMatched && statusMatched && typeMatched
    },
  }),
)
const visibleCount = computed(() => countTreeNodes(rows.value))
const errorMessage = computed(() =>
  resourcesQuery.state.value.status === 'error'
    ? getSystemErrorMessage(resourcesQuery.state.value.error, '加载资源失败')
    : '',
)

function linkText(row: ResourceTreeNode) {
  return row.path ?? row.externalUrl ?? '-'
}

function handleSearch() {
  activeFilters.value = { keyword: filters.keyword, status: filters.status, type: filters.type }
}

function handleReset() {
  filters.keyword = ''
  filters.status = null
  filters.type = null
  activeFilters.value = { keyword: '', status: null, type: null }
}

const columns: DataTableColumns<ResourceTreeNode> = [
  { title: '资源名称', key: 'name', width: 220 },
  { title: '资源编码', key: 'code', width: 220 },
  { title: '类型', key: 'type', width: 96, render: (row) => resourceTypeLabels[row.type] },
  { title: '路径/外链', key: 'path', render: linkText },
  { title: '隐藏', key: 'hidden', width: 80, render: (row) => (row.hidden ? '是' : '否') },
  {
    title: '状态',
    key: 'status',
    width: 96,
    render: (row) =>
      h(NTag, { size: 'small', type: statusTagTypes[row.status] }, { default: () => statusLabels[row.status] }),
  },
  { title: '排序', key: 'sortOrder', width: 90 },
  { title: '创建时间', key: 'createdAt', width: 180, render: (row) => formatDateTime(row.createdAt) },
]
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-normal">资源管理</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">共 {{ visibleCount }} 个资源</p>
      </div>
      <NButton :loading="resourcesQuery.isLoading.value" @click="resourcesQuery.refetch()">刷新</NButton>
    </div>

    <NAlert v-if="errorMessage" type="error" :show-icon="false">{{ errorMessage }}</NAlert>

    <div class="flex items-center gap-3">
      <NInput data-test="resources-keyword" v-model:value="filters.keyword" clearable placeholder="搜索资源名称、编码、路径或外链" class="max-w-xs" @keydown.enter="handleSearch" />
      <NSelect data-test="resources-type" v-model:value="filters.type" :options="typeOptions" class="w-36" />
      <NSelect data-test="resources-status" v-model:value="filters.status" :options="statusOptions" class="w-36" />
      <NButton data-test="resources-search" type="primary" @click="handleSearch">查询</NButton>
      <NButton @click="handleReset">重置</NButton>
    </div>

    <NDataTable
      :columns="columns"
      :data="rows"
      :loading="resourcesQuery.asyncStatus.value === 'loading'"
      :row-key="(row) => row.id"
      default-expand-all
    />
  </section>
</template>
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm --filter @rev30/client test -- __tests__/pages/system/resources.test.ts __tests__/features/system/tree.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/pages/system/resources.vue apps/client/__tests__/pages/system/resources.test.ts
git commit -m "feat: add resource tree page"
```

---

### Task 9: Final Integration And Verification

**Files:**
- Modify after route generation if needed: `apps/client/typed-router.d.ts`
- Modify after formatting if needed: touched client source and test files

- [ ] **Step 1: Run all targeted client tests**

Run:

```bash
pnpm --filter @rev30/client test
```

Expected: PASS for auth, router, layout, system helpers, tree utilities, and four system pages.

- [ ] **Step 2: Run client typecheck**

Run:

```bash
pnpm --filter @rev30/client typecheck
```

Expected: PASS. If typed file routes regenerate `apps/client/typed-router.d.ts`, inspect and keep only the route map changes for `/system`, `/system/users`, `/system/departments`, `/system/roles`, and `/system/resources`.

- [ ] **Step 3: Run formatting and lint checks**

Run:

```bash
pnpm format:check
pnpm lint:check
```

Expected: PASS. If formatting fails, run `pnpm format`, inspect the diff, then rerun both checks.

- [ ] **Step 4: Run full project check**

Run:

```bash
pnpm check
```

Expected: PASS for format, lint, deprecated API check, typecheck, tests, and build.

- [ ] **Step 5: Update progress docs only if implementation changes project status wording**

If the completed implementation makes `AGENTS.md` or `README.md` stale, update only the relevant progress or overview lines. Use this wording for `AGENTS.md` if needed:

```md
- 当前前端已包含桌面优先的后台管理壳层，以及系统用户、部门、角色、资源的只读管理页面。
```

- [ ] **Step 6: Commit verification or documentation adjustments**

If Task 9 changed generated route types, formatting, or project progress docs, commit them:

```bash
git add apps/client/typed-router.d.ts AGENTS.md README.md
git commit -m "chore: finalize admin pages"
```

If there are no changes after verification, skip the commit and record the passing commands in the final response.

---

## Self-Review

- Spec coverage: The plan covers the admin shell, `/system/*` routes, all four pages, real API data, paginated users/roles, tree departments/resources, filters, loading/error/empty states through Naive UI tables and alerts, desktop-first layout, and no CRUD/detail scope.
- Placeholder scan: The plan uses concrete implementation steps instead of placeholder markers or shortcut references. Each production file has concrete code shape and each task has an explicit failing-test step.
- Type consistency: Route paths, request helper names, shared schema names, status constants, resource type constants, and test import paths match the current repo structure and the approved design.
