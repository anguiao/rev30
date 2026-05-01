# Auth Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Vue frontend authentication flow with protected home, login, registration, in-memory access tokens, refresh-cookie session restore, Hono RPC requests, Pinia Colada request state, Naive UI controls, and TanStack Form validation.

**Architecture:** Hono RPC stays the single HTTP client and receives a custom `authFetch` that sends same-origin cookies and the in-memory access token. Pinia stores only session identity and readiness, while Pinia Colada is used directly in pages for login/register/logout mutations. Router guards restore sessions through the refresh cookie before allowing `/`.

**Tech Stack:** Vue 3, Vue Router file routes, Pinia, Pinia Colada, Hono RPC, TanStack Form, Naive UI, Tailwind CSS v4, zod shared schemas, Vitest, Vue Test Utils, happy-dom.

---

## References

- Design spec: `docs/superpowers/specs/2026-05-01-auth-frontend-design.md`
- Pinia Colada install and plugin API: https://pinia-colada.esm.dev/plugins/
- Pinia Colada mutations API: https://pinia-colada.esm.dev/guide/mutations.html
- TanStack Form Vue validation: https://tanstack.com/form/latest/docs/framework/vue/guides/dynamic-validation
- TanStack Form Vue submission handling: https://tanstack.com/form/latest/docs/framework/vue/guides/submission-handling

## File Structure

- Modify `apps/client/package.json`: add `@pinia/colada`, `@vue/test-utils`, and `happy-dom`.
- Modify `pnpm-lock.yaml`: dependency lockfile updates from pnpm.
- Modify `apps/client/src/main.ts`: install Pinia once, then install Pinia Colada and the router.
- Modify `apps/client/src/api.ts`: add `authFetch`, keep `api = hc<AppType>('/api', { fetch: authFetch })`.
- Modify `apps/client/src/api.test.ts`: keep existing Hono RPC tests and add auth fetch coverage.
- Create `apps/client/src/stores/auth.ts`: in-memory session store.
- Create `apps/client/src/stores/auth.test.ts`: session store tests.
- Create `apps/client/src/auth/requests.ts`: thin Hono RPC request functions and typed auth request errors.
- Create `apps/client/src/auth/requests.test.ts`: token response parsing and error mapping tests.
- Create `apps/client/src/auth/forms.ts`: form defaults, display helpers, and server field error helper.
- Create `apps/client/src/auth/forms.test.ts`: zod-backed form helper tests.
- Create `apps/client/src/auth/guards.ts`: auth route guard installer.
- Create `apps/client/src/auth/guards.test.ts`: memory-router guard tests.
- Modify `apps/client/src/router.ts`: install auth route guards on the file-route router.
- Create `apps/client/src/components/AuthShell.vue`: shared visual shell for login/register.
- Create `apps/client/src/pages/login.vue`: login form.
- Create `apps/client/src/pages/register.vue`: registration form.
- Modify `apps/client/src/pages/index.vue`: protected home with user summary and logout.
- Create `apps/client/src/pages/auth-pages.test.ts`: component behavior tests for login/register/home.

---

### Task 1: Dependencies And Test Harness

**Files:**

- Modify: `apps/client/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/client/src/main.ts`
- Verify through: `apps/client/src/pages/auth-pages.test.ts`

- [ ] **Step 1: Install request state and component test dependencies**

Run:

```bash
pnpm --filter @rev30/client add @pinia/colada@latest
pnpm --filter @rev30/client add -D @vue/test-utils@latest happy-dom@latest
```

Expected: `apps/client/package.json` includes `@pinia/colada` in `dependencies`, and includes `@vue/test-utils` plus `happy-dom` in `devDependencies`.

- [ ] **Step 2: Install Pinia Colada in the app**

Modify `apps/client/src/main.ts`:

```ts
import { PiniaColada } from '@pinia/colada'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import './style.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(PiniaColada)
app.use(router)

app.mount('#app')
```

- [ ] **Step 3: Verify dependency installation and app typing**

Run:

```bash
pnpm --filter @rev30/client typecheck
```

Expected: PASS. If it fails because the package manager has not yet installed the new dependency, rerun Step 1.

- [ ] **Step 4: Commit dependency setup**

```bash
git add apps/client/package.json pnpm-lock.yaml apps/client/src/main.ts
git commit -m "chore: add auth frontend dependencies"
```

---

### Task 2: In-Memory Auth Store

**Files:**

- Create: `apps/client/src/stores/auth.ts`
- Create: `apps/client/src/stores/auth.test.ts`

- [ ] **Step 1: Write the failing auth store test**

Create `apps/client/src/stores/auth.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AuthTokenResponse } from '@rev30/shared'
import { USER_STATUS_ENABLED } from '@rev30/shared'
import { useAuthStore } from './auth'

const session: AuthTokenResponse = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  tokenType: 'Bearer',
  expiresIn: 900,
  user: {
    id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
    username: 'ada',
    nickname: 'Ada Lovelace',
    email: null,
    phone: null,
    status: USER_STATUS_ENABLED,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  },
}

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('stores only the access token and current user from a session response', () => {
    const auth = useAuthStore()

    auth.setSession(session)

    expect(auth.accessToken).toBe('access-token')
    expect(auth.user).toEqual(session.user)
    expect(auth.isAuthenticated).toBe(true)
  })

  it('clears session state without changing readiness', () => {
    const auth = useAuthStore()
    auth.setSession(session)
    auth.markReady()

    auth.clearSession()

    expect(auth.accessToken).toBeNull()
    expect(auth.user).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.isReady).toBe(true)
  })

  it('marks the initial session restore as ready', () => {
    const auth = useAuthStore()

    auth.markReady()

    expect(auth.isReady).toBe(true)
  })
})
```

- [ ] **Step 2: Run the auth store test and verify it fails**

Run:

```bash
pnpm --filter @rev30/client test -- src/stores/auth.test.ts
```

Expected: FAIL because `apps/client/src/stores/auth.ts` does not exist.

- [ ] **Step 3: Implement the auth store**

Create `apps/client/src/stores/auth.ts`:

```ts
import { defineStore } from 'pinia'
import type { AuthTokenResponse, User } from '@rev30/shared'

type AuthState = {
  accessToken: string | null
  user: User | null
  isReady: boolean
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    accessToken: null,
    user: null,
    isReady: false,
  }),
  getters: {
    isAuthenticated: (state) => state.accessToken !== null && state.user !== null,
  },
  actions: {
    setSession(session: AuthTokenResponse) {
      this.accessToken = session.accessToken
      this.user = session.user
    },
    clearSession() {
      this.accessToken = null
      this.user = null
    },
    markReady() {
      this.isReady = true
    },
  },
})
```

- [ ] **Step 4: Run the auth store test and verify it passes**

Run:

```bash
pnpm --filter @rev30/client test -- src/stores/auth.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit auth store**

```bash
git add apps/client/src/stores/auth.ts apps/client/src/stores/auth.test.ts
git commit -m "feat: add auth session store"
```

---

### Task 3: Hono RPC Auth Fetch

**Files:**

- Modify: `apps/client/src/api.ts`
- Modify: `apps/client/src/api.test.ts`

- [ ] **Step 1: Update API tests for the custom fetch boundary**

Modify `apps/client/src/api.test.ts` to create Pinia before each test and add two tests:

```ts
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from './stores/auth'

beforeEach(() => {
  setActivePinia(createPinia())
})

it('sends same-origin credentials through the Hono RPC client', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ service: 'rev30-server', status: 'ok' })),
  )
  vi.stubGlobal('fetch', fetchMock)

  await api.health.$get()

  const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit]
  expect(init.credentials).toBe('same-origin')
})

it('adds the bearer token from the auth store when present', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ service: 'rev30-server', status: 'ok' })),
  )
  vi.stubGlobal('fetch', fetchMock)
  useAuthStore().accessToken = 'access-token'

  await api.health.$get()

  const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit]
  expect(new Headers(init.headers).get('authorization')).toBe('Bearer access-token')
})
```

- [ ] **Step 2: Run the API test and verify the new tests fail**

Run:

```bash
pnpm --filter @rev30/client test -- src/api.test.ts
```

Expected: FAIL because the current RPC client does not set `credentials` and does not attach Authorization.

- [ ] **Step 3: Implement `authFetch` and inject it into Hono RPC**

Modify `apps/client/src/api.ts`:

```ts
import { hc } from 'hono/client'
import type { AppType } from '@rev30/server'
import { useAuthStore } from './stores/auth'

export function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const auth = useAuthStore()
  const headers = new Headers(init.headers)

  if (auth.accessToken !== null) {
    headers.set('authorization', `Bearer ${auth.accessToken}`)
  }

  return fetch(input, {
    ...init,
    credentials: init.credentials ?? 'same-origin',
    headers,
  })
}

export const api = hc<AppType>('/api', {
  fetch: authFetch,
})
```

- [ ] **Step 4: Run the API tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/client test -- src/api.test.ts
```

Expected: PASS, including the existing health and system user RPC tests.

- [ ] **Step 5: Commit auth fetch**

```bash
git add apps/client/src/api.ts apps/client/src/api.test.ts
git commit -m "feat: add authenticated rpc fetch"
```

---

### Task 4: Auth Request Functions And Form Helpers

**Files:**

- Create: `apps/client/src/auth/requests.ts`
- Create: `apps/client/src/auth/requests.test.ts`
- Create: `apps/client/src/auth/forms.ts`
- Create: `apps/client/src/auth/forms.test.ts`

- [ ] **Step 1: Write failing request helper tests**

Create `apps/client/src/auth/requests.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { USER_STATUS_ENABLED } from '@rev30/shared'
import { AuthRequestError, parseAuthError, parseAuthSession } from './requests'

const tokenBody = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  tokenType: 'Bearer',
  expiresIn: 900,
  user: {
    id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
    username: 'ada',
    nickname: 'Ada Lovelace',
    email: null,
    phone: null,
    status: USER_STATUS_ENABLED,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  },
}

describe('auth requests', () => {
  it('parses auth token responses through the shared schema', async () => {
    await expect(parseAuthSession(new Response(JSON.stringify(tokenBody)))).resolves.toEqual(
      tokenBody,
    )
  })

  it('maps auth error responses to a typed error', async () => {
    await expect(
      parseAuthError(
        new Response(JSON.stringify({ field: 'username', message: 'username already exists' }), {
          status: 409,
        }),
      ),
    ).resolves.toMatchObject({
      status: 409,
      field: 'username',
      message: 'username already exists',
    })
  })

  it('keeps a stable message when the server response is not json', async () => {
    await expect(parseAuthError(new Response('nope', { status: 500 }))).resolves.toMatchObject({
      status: 500,
      message: 'Request failed',
    })
  })

  it('exposes status and field on AuthRequestError', () => {
    const error = new AuthRequestError(401, 'Invalid username or password')

    expect(error.status).toBe(401)
    expect(error.message).toBe('Invalid username or password')
    expect(error.field).toBeUndefined()
  })
})
```

- [ ] **Step 2: Write failing form helper tests**

Create `apps/client/src/auth/forms.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  fieldFeedback,
  loginDefaultValues,
  registerDefaultValues,
  setServerFieldError,
} from './forms'

describe('auth form helpers', () => {
  it('provides empty login and register defaults', () => {
    expect(loginDefaultValues).toEqual({
      username: '',
      password: '',
    })
    expect(registerDefaultValues).toEqual({
      username: '',
      nickname: '',
      password: '',
      email: '',
      phone: '',
    })
  })

  it('returns the first displayable field error', () => {
    expect(fieldFeedback(['Required', 'Too short'])).toBe('Required')
    expect(fieldFeedback([])).toBeUndefined()
  })

  it('sets a server field error through TanStack Form metadata', () => {
    const calls: unknown[] = []
    const form = {
      setFieldMeta: (field: string, updater: (meta: { errorMap: object }) => unknown) => {
        calls.push([field, updater({ errorMap: {} })])
      },
    }

    setServerFieldError(form, 'username', 'username already exists')

    expect(calls).toEqual([
      [
        'username',
        {
          errorMap: {
            onServer: 'username already exists',
          },
        },
      ],
    ])
  })
})
```

- [ ] **Step 3: Run helper tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/client test -- src/auth/requests.test.ts src/auth/forms.test.ts
```

Expected: FAIL because `requests.ts` and `forms.ts` do not exist.

- [ ] **Step 4: Implement request helpers**

Create `apps/client/src/auth/requests.ts`:

```ts
import {
  authTokenResponseSchema,
  type AuthErrorResponse,
  type AuthLoginInput,
  type AuthRegisterInput,
  type AuthTokenResponse,
  type UserUniqueField,
} from '@rev30/shared'
import { api } from '../api'

type AuthErrorBody = AuthErrorResponse & {
  field?: UserUniqueField
}

export class AuthRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly field?: UserUniqueField,
  ) {
    super(message)
    this.name = 'AuthRequestError'
  }
}

export async function parseAuthSession(response: Response): Promise<AuthTokenResponse> {
  return authTokenResponseSchema.parse(await response.json())
}

export async function parseAuthError(response: Response): Promise<AuthRequestError> {
  try {
    const body = (await response.json()) as Partial<AuthErrorBody>

    return new AuthRequestError(
      response.status,
      typeof body.message === 'string' ? body.message : 'Request failed',
      body.field,
    )
  } catch {
    return new AuthRequestError(response.status, 'Request failed')
  }
}

async function parseAuthResponse(response: Response) {
  if (!response.ok) {
    throw await parseAuthError(response)
  }

  return parseAuthSession(response)
}

export async function login(input: AuthLoginInput) {
  return parseAuthResponse(await api.auth.login.$post({ json: input }))
}

export async function register(input: AuthRegisterInput) {
  return parseAuthResponse(await api.auth.register.$post({ json: input }))
}

export async function refreshSession() {
  return parseAuthResponse(await api.auth.refresh.$post())
}

export async function logout() {
  const response = await api.auth.logout.$post()

  if (!response.ok && response.status !== 401 && response.status !== 400) {
    throw await parseAuthError(response)
  }
}
```

- [ ] **Step 5: Implement form helpers**

Create `apps/client/src/auth/forms.ts`:

```ts
export const loginDefaultValues = {
  username: '',
  password: '',
}

export const registerDefaultValues = {
  username: '',
  nickname: '',
  password: '',
  email: '',
  phone: '',
}

export function fieldFeedback(errors: unknown[]) {
  const [firstError] = errors

  return firstError === undefined ? undefined : String(firstError)
}

type ServerErrorForm = {
  setFieldMeta: (
    field: string,
    updater: (meta: { errorMap: Record<string, unknown> }) => { errorMap: Record<string, unknown> },
  ) => void
}

export function setServerFieldError(form: ServerErrorForm, field: string, message: string) {
  form.setFieldMeta(field, (meta) => ({
    ...meta,
    errorMap: {
      ...meta.errorMap,
      onServer: message,
    },
  }))
}
```

- [ ] **Step 6: Run helper tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/client test -- src/auth/requests.test.ts src/auth/forms.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit request and form helpers**

```bash
git add apps/client/src/auth
git commit -m "feat: add auth request helpers"
```

---

### Task 5: Protected Router Guard

**Files:**

- Create: `apps/client/src/auth/guards.ts`
- Create: `apps/client/src/auth/guards.test.ts`
- Modify: `apps/client/src/router.ts`

- [ ] **Step 1: Write failing router guard tests**

Create `apps/client/src/auth/guards.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { USER_STATUS_ENABLED, type AuthTokenResponse } from '@rev30/shared'
import { useAuthStore } from '../stores/auth'
import { installAuthGuards } from './guards'
import { refreshSession } from './requests'

vi.mock('./requests', () => ({
  refreshSession: vi.fn(),
}))

const routes = [
  { path: '/', component: { template: '<main>Home</main>' } },
  { path: '/login', component: { template: '<main>Login</main>' } },
  { path: '/register', component: { template: '<main>Register</main>' } },
]

const session: AuthTokenResponse = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  tokenType: 'Bearer',
  expiresIn: 900,
  user: {
    id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
    username: 'ada',
    nickname: 'Ada Lovelace',
    email: null,
    phone: null,
    status: USER_STATUS_ENABLED,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  },
}

function createTestRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes,
  })
  installAuthGuards(router)

  return router
}

describe('auth router guards', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(refreshSession).mockReset()
  })

  it('restores the session before entering the protected home route', async () => {
    vi.mocked(refreshSession).mockResolvedValue(session)
    const router = createTestRouter()

    await router.push('/')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/')
    expect(useAuthStore().accessToken).toBe('access-token')
    expect(useAuthStore().isReady).toBe(true)
  })

  it('redirects unauthenticated users to login when refresh fails', async () => {
    vi.mocked(refreshSession).mockRejectedValue(new Error('Invalid refresh token'))
    const router = createTestRouter()

    await router.push('/')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/')
    expect(useAuthStore().isAuthenticated).toBe(false)
    expect(useAuthStore().isReady).toBe(true)
  })

  it('redirects authenticated users away from auth pages', async () => {
    useAuthStore().setSession(session)
    const router = createTestRouter()

    await router.push('/login')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/')
  })
})
```

- [ ] **Step 2: Run router tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/client test -- src/auth/guards.test.ts
```

Expected: FAIL because `apps/client/src/auth/guards.ts` does not exist.

- [ ] **Step 3: Implement protected route guards**

Create `apps/client/src/auth/guards.ts`:

```ts
import type { Router } from 'vue-router'
import { refreshSession } from './requests'
import { useAuthStore } from '../stores/auth'

const authRoutes = new Set(['/login', '/register'])

export function installAuthGuards(router: Router) {
  router.beforeEach(async (to) => {
    const auth = useAuthStore()

    if (authRoutes.has(to.path)) {
      return auth.isAuthenticated ? { path: '/' } : true
    }

    if (to.path !== '/') {
      return true
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

Modify `apps/client/src/router.ts`:

```ts
import { createRouter, createWebHistory } from 'vue-router'
import { handleHotUpdate, routes } from 'vue-router/auto-routes'
import { installAuthGuards } from './auth/guards'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

installAuthGuards(router)

if (import.meta.hot) {
  handleHotUpdate(router)
}
```

- [ ] **Step 4: Run router tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/client test -- src/auth/guards.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit router guard**

```bash
git add apps/client/src/auth/guards.ts apps/client/src/auth/guards.test.ts apps/client/src/router.ts
git commit -m "feat: protect authenticated routes"
```

---

### Task 6: Login Page And Auth Shell

**Files:**

- Create: `apps/client/src/components/AuthShell.vue`
- Create: `apps/client/src/pages/login.vue`
- Create or modify: `apps/client/src/pages/auth-pages.test.ts`

- [ ] **Step 1: Write failing login page behavior tests**

Create `apps/client/src/pages/auth-pages.test.ts` with the first login tests:

```ts
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { USER_STATUS_ENABLED, type AuthTokenResponse } from '@rev30/shared'
import LoginPage from './login.vue'
import { useAuthStore } from '../stores/auth'
import { login } from '../auth/requests'

vi.mock('../auth/requests', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
}))

const session: AuthTokenResponse = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  tokenType: 'Bearer',
  expiresIn: 900,
  user: {
    id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
    username: 'ada',
    nickname: 'Ada Lovelace',
    email: null,
    phone: null,
    status: USER_STATUS_ENABLED,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  },
}

async function mountWithRouter(component: object) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<main>Home</main>' } },
      { path: '/login', component },
      { path: '/register', component: { template: '<main>Register</main>' } },
    ],
  })
  router.push('/login')
  await router.isReady()

  return {
    router,
    wrapper: mount(component, {
      global: {
        plugins: [pinia, PiniaColada, router],
      },
    }),
  }
}

describe('login page', () => {
  beforeEach(() => {
    vi.mocked(login).mockReset()
  })

  it('blocks invalid login submissions with field errors', async () => {
    const { wrapper } = await mountWithRouter(LoginPage)

    await wrapper.get('[data-test="login-submit"]').trigger('click')
    await flushPromises()

    expect(login).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Too small')
  })

  it('stores the session and navigates home after login', async () => {
    vi.mocked(login).mockResolvedValue(session)
    const { router, wrapper } = await mountWithRouter(LoginPage)

    await wrapper.get('[data-test="login-username"] input').setValue('ada')
    await wrapper.get('[data-test="login-password"] input').setValue('secret-password')
    await wrapper.get('[data-test="login-submit"]').trigger('click')
    await flushPromises()

    expect(login).toHaveBeenCalledWith({
      username: 'ada',
      password: 'secret-password',
    })
    expect(useAuthStore().accessToken).toBe('access-token')
    expect(router.currentRoute.value.path).toBe('/')
  })
})
```

- [ ] **Step 2: Run login page tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/client test -- src/pages/auth-pages.test.ts
```

Expected: FAIL because `login.vue` and `AuthShell.vue` do not exist.

- [ ] **Step 3: Create the shared auth shell**

Create `apps/client/src/components/AuthShell.vue`:

```vue
<template>
  <main class="grid min-h-screen bg-slate-100 px-4 py-6 text-slate-900 md:px-8">
    <section
      class="mx-auto grid w-full max-w-5xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm md:grid-cols-[1fr_1fr]"
    >
      <div class="px-6 py-8 md:px-10 md:py-12">
        <RouterLink class="text-2xl font-bold tracking-normal text-slate-950" to="/">
          Rev30
        </RouterLink>
        <slot />
      </div>
      <aside class="border-t border-slate-200 bg-slate-50 px-6 py-8 md:border-l md:border-t-0 md:px-10 md:py-12">
        <p class="text-sm font-medium text-slate-500">Workspace access</p>
        <h2 class="mt-4 text-2xl font-semibold text-slate-950">Secure session entry</h2>
        <p class="mt-3 text-sm leading-6 text-slate-600">
          Refresh sessions stay in the HTTP-only cookie. The client keeps only the current access token in memory.
        </p>
        <dl class="mt-8 grid gap-4 text-sm">
          <div class="border-t border-slate-200 pt-4">
            <dt class="font-medium text-slate-950">Token policy</dt>
            <dd class="mt-1 text-slate-600">Access token in memory, refresh token in cookie.</dd>
          </div>
          <div class="border-t border-slate-200 pt-4">
            <dt class="font-medium text-slate-950">Route policy</dt>
            <dd class="mt-1 text-slate-600">The home workspace restores the session before entry.</dd>
          </div>
        </dl>
      </aside>
    </section>
  </main>
</template>
```

- [ ] **Step 4: Implement the login page**

Create `apps/client/src/pages/login.vue`:

```vue
<script setup lang="ts">
import { useMutation } from '@pinia/colada'
import { useForm } from '@tanstack/vue-form'
import { authLoginSchema } from '@rev30/shared'
import { NAlert, NButton, NForm, NFormItem, NInput } from 'naive-ui'
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AuthShell from '../components/AuthShell.vue'
import { AuthRequestError, login } from '../auth/requests'
import { fieldFeedback, loginDefaultValues } from '../auth/forms'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()

const loginMutation = useMutation({
  mutation: login,
})

const form = useForm({
  defaultValues: loginDefaultValues,
  validators: {
    onSubmit: authLoginSchema,
  },
  async onSubmit({ value }) {
    const session = await loginMutation.mutateAsync(authLoginSchema.parse(value))
    auth.setSession(session)
    await router.push('/')
  },
})

const formError = computed(() => {
  const error = loginMutation.error.value

  if (error instanceof AuthRequestError && error.status === 401) {
    return '用户名或密码错误'
  }

  return error === null ? null : '登录失败，请稍后再试'
})
</script>

<template>
  <AuthShell>
    <div class="mt-10 max-w-sm">
      <p class="text-sm font-medium text-slate-500">Sign in</p>
      <h1 class="mt-2 text-3xl font-semibold text-slate-950">Welcome back</h1>
      <p class="mt-3 text-sm leading-6 text-slate-600">Use your Rev30 username and password.</p>

      <n-alert v-if="formError" class="mt-6" type="error">
        {{ formError }}
      </n-alert>

      <n-form class="mt-8" @submit.prevent.stop="form.handleSubmit()">
        <form.Field name="username">
          <template #default="{ field }">
            <n-form-item
              label="Username"
              :feedback="fieldFeedback(field.state.meta.errors)"
              :validation-status="field.state.meta.errors.length ? 'error' : undefined"
            >
              <n-input
                data-test="login-username"
                :value="field.state.value"
                autocomplete="username"
                placeholder="ada"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </n-form-item>
          </template>
        </form.Field>

        <form.Field name="password">
          <template #default="{ field }">
            <n-form-item
              label="Password"
              :feedback="fieldFeedback(field.state.meta.errors)"
              :validation-status="field.state.meta.errors.length ? 'error' : undefined"
            >
              <n-input
                data-test="login-password"
                :value="field.state.value"
                autocomplete="current-password"
                placeholder="At least 8 characters"
                type="password"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </n-form-item>
          </template>
        </form.Field>

        <n-button
          attr-type="submit"
          block
          class="mt-2"
          data-test="login-submit"
          :loading="loginMutation.asyncStatus.value === 'loading'"
          type="primary"
        >
          Sign in
        </n-button>
      </n-form>

      <p class="mt-6 text-sm text-slate-600">
        No account yet?
        <RouterLink class="font-medium text-slate-950 underline underline-offset-4" to="/register">
          Create one
        </RouterLink>
      </p>
    </div>
  </AuthShell>
</template>
```

- [ ] **Step 5: Run login page tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/client test -- src/pages/auth-pages.test.ts
```

Expected: PASS for the login page tests.

- [ ] **Step 6: Commit login page**

```bash
git add apps/client/src/components/AuthShell.vue apps/client/src/pages/login.vue apps/client/src/pages/auth-pages.test.ts
git commit -m "feat: add login page"
```

---

### Task 7: Registration Page

**Files:**

- Create: `apps/client/src/pages/register.vue`
- Modify: `apps/client/src/pages/auth-pages.test.ts`

- [ ] **Step 1: Add failing registration page tests**

Append these tests to `apps/client/src/pages/auth-pages.test.ts`:

```ts
import RegisterPage from './register.vue'
import { register } from '../auth/requests'

describe('register page', () => {
  beforeEach(() => {
    vi.mocked(register).mockReset()
  })

  it('blocks invalid registration submissions with field errors', async () => {
    const { wrapper } = await mountWithRouter(RegisterPage)

    await wrapper.get('[data-test="register-submit"]').trigger('click')
    await flushPromises()

    expect(register).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Too small')
  })

  it('stores the session and navigates home after registration', async () => {
    vi.mocked(register).mockResolvedValue(session)
    const { router, wrapper } = await mountWithRouter(RegisterPage)

    await wrapper.get('[data-test="register-username"] input').setValue('ada')
    await wrapper.get('[data-test="register-nickname"] input').setValue('Ada Lovelace')
    await wrapper.get('[data-test="register-password"] input').setValue('secret-password')
    await wrapper.get('[data-test="register-email"] input').setValue('')
    await wrapper.get('[data-test="register-phone"] input').setValue('')
    await wrapper.get('[data-test="register-submit"]').trigger('click')
    await flushPromises()

    expect(register).toHaveBeenCalledWith({
      username: 'ada',
      nickname: 'Ada Lovelace',
      password: 'secret-password',
      email: null,
      phone: null,
    })
    expect(useAuthStore().accessToken).toBe('access-token')
    expect(router.currentRoute.value.path).toBe('/')
  })
})
```

- [ ] **Step 2: Run registration tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/client test -- src/pages/auth-pages.test.ts
```

Expected: FAIL because `register.vue` does not exist.

- [ ] **Step 3: Implement the registration page**

Create `apps/client/src/pages/register.vue` using the same field pattern as the login page:

```vue
<script setup lang="ts">
import { useMutation } from '@pinia/colada'
import { useForm } from '@tanstack/vue-form'
import { authRegisterSchema } from '@rev30/shared'
import { NAlert, NButton, NForm, NFormItem, NInput } from 'naive-ui'
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AuthShell from '../components/AuthShell.vue'
import { AuthRequestError, register } from '../auth/requests'
import { fieldFeedback, registerDefaultValues, setServerFieldError } from '../auth/forms'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()

const registerMutation = useMutation({
  mutation: register,
})

const form = useForm({
  defaultValues: registerDefaultValues,
  validators: {
    onSubmit: authRegisterSchema,
  },
  async onSubmit({ value }) {
    try {
      const input = authRegisterSchema.parse(value)
      const session = await registerMutation.mutateAsync(input)
      auth.setSession(session)
      await router.push('/')
    } catch (error) {
      if (error instanceof AuthRequestError && error.field !== undefined) {
        setServerFieldError(form, error.field, error.message)
      }
      throw error
    }
  },
})

const formError = computed(() => {
  const error = registerMutation.error.value

  if (error instanceof AuthRequestError && error.field !== undefined) {
    return null
  }

  if (error instanceof AuthRequestError && error.status === 409) {
    return '注册信息已被占用'
  }

  return error === null ? null : '注册失败，请稍后再试'
})
</script>

<template>
  <AuthShell>
    <div class="mt-10 max-w-sm">
      <p class="text-sm font-medium text-slate-500">Create account</p>
      <h1 class="mt-2 text-3xl font-semibold text-slate-950">Start with Rev30</h1>
      <p class="mt-3 text-sm leading-6 text-slate-600">Create a username/password account.</p>

      <n-alert v-if="formError" class="mt-6" type="error">
        {{ formError }}
      </n-alert>

      <n-form class="mt-8" @submit.prevent.stop="form.handleSubmit()">
        <form.Field name="username">
          <template #default="{ field }">
            <n-form-item
              label="Username"
              :feedback="fieldFeedback(field.state.meta.errors)"
              :validation-status="field.state.meta.errors.length ? 'error' : undefined"
            >
              <n-input data-test="register-username" :value="field.state.value" @blur="field.handleBlur" @update:value="field.handleChange" />
            </n-form-item>
          </template>
        </form.Field>

        <form.Field name="nickname">
          <template #default="{ field }">
            <n-form-item
              label="Nickname"
              :feedback="fieldFeedback(field.state.meta.errors)"
              :validation-status="field.state.meta.errors.length ? 'error' : undefined"
            >
              <n-input data-test="register-nickname" :value="field.state.value" @blur="field.handleBlur" @update:value="field.handleChange" />
            </n-form-item>
          </template>
        </form.Field>

        <form.Field name="password">
          <template #default="{ field }">
            <n-form-item
              label="Password"
              :feedback="fieldFeedback(field.state.meta.errors)"
              :validation-status="field.state.meta.errors.length ? 'error' : undefined"
            >
              <n-input data-test="register-password" :value="field.state.value" autocomplete="new-password" type="password" @blur="field.handleBlur" @update:value="field.handleChange" />
            </n-form-item>
          </template>
        </form.Field>

        <form.Field name="email">
          <template #default="{ field }">
            <n-form-item
              label="Email"
              :feedback="fieldFeedback(field.state.meta.errors)"
              :validation-status="field.state.meta.errors.length ? 'error' : undefined"
            >
              <n-input data-test="register-email" :value="field.state.value" placeholder="Optional" @blur="field.handleBlur" @update:value="field.handleChange" />
            </n-form-item>
          </template>
        </form.Field>

        <form.Field name="phone">
          <template #default="{ field }">
            <n-form-item
              label="Phone"
              :feedback="fieldFeedback(field.state.meta.errors)"
              :validation-status="field.state.meta.errors.length ? 'error' : undefined"
            >
              <n-input data-test="register-phone" :value="field.state.value" placeholder="Optional" @blur="field.handleBlur" @update:value="field.handleChange" />
            </n-form-item>
          </template>
        </form.Field>

        <n-button
          attr-type="submit"
          block
          class="mt-2"
          data-test="register-submit"
          :loading="registerMutation.asyncStatus.value === 'loading'"
          type="primary"
        >
          Create account
        </n-button>
      </n-form>

      <p class="mt-6 text-sm text-slate-600">
        Already have an account?
        <RouterLink class="font-medium text-slate-950 underline underline-offset-4" to="/login">
          Sign in
        </RouterLink>
      </p>
    </div>
  </AuthShell>
</template>
```

- [ ] **Step 4: Run registration tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/client test -- src/pages/auth-pages.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit registration page**

```bash
git add apps/client/src/pages/register.vue apps/client/src/pages/auth-pages.test.ts
git commit -m "feat: add registration page"
```

---

### Task 8: Protected Home And Logout

**Files:**

- Modify: `apps/client/src/pages/index.vue`
- Modify: `apps/client/src/pages/auth-pages.test.ts`

- [ ] **Step 1: Add failing protected home tests**

Append these tests to `apps/client/src/pages/auth-pages.test.ts`:

```ts
import HomePage from './index.vue'
import { logout } from '../auth/requests'

describe('protected home page', () => {
  beforeEach(() => {
    vi.mocked(logout).mockReset()
  })

  it('shows the current user summary', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    useAuthStore().setSession(session)

    const wrapper = mount(HomePage, {
      global: {
        plugins: [pinia, PiniaColada],
      },
    })

    expect(wrapper.text()).toContain('Ada Lovelace')
    expect(wrapper.text()).toContain('ada')
  })

  it('clears the session after logout', async () => {
    vi.mocked(logout).mockResolvedValue()
    const { router, wrapper } = await mountWithRouter(HomePage)
    useAuthStore().setSession(session)

    await wrapper.get('[data-test="logout"]').trigger('click')
    await flushPromises()

    expect(logout).toHaveBeenCalledOnce()
    expect(useAuthStore().isAuthenticated).toBe(false)
    expect(router.currentRoute.value.path).toBe('/login')
  })
})
```

- [ ] **Step 2: Run home tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/client test -- src/pages/auth-pages.test.ts
```

Expected: FAIL because the current homepage is empty.

- [ ] **Step 3: Implement protected home page**

Modify `apps/client/src/pages/index.vue`:

```vue
<script setup lang="ts">
import { useMutation } from '@pinia/colada'
import { NButton } from 'naive-ui'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { logout } from '../auth/requests'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()

const initials = computed(() => auth.user?.nickname.slice(0, 1).toUpperCase() ?? 'R')

const logoutMutation = useMutation({
  mutation: logout,
  async onSettled() {
    auth.clearSession()
    await router.push('/login')
  },
})
</script>

<template>
  <main class="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 md:px-8">
    <section class="mx-auto max-w-5xl rounded-lg border border-slate-200 bg-white px-6 py-6 shadow-sm md:px-8">
      <header class="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="text-sm font-medium text-slate-500">Rev30 workspace</p>
          <h1 class="mt-1 text-2xl font-semibold text-slate-950">Home</h1>
        </div>
        <n-button
          data-test="logout"
          :loading="logoutMutation.asyncStatus.value === 'loading'"
          secondary
          @click="logoutMutation.mutate()"
        >
          Sign out
        </n-button>
      </header>

      <section v-if="auth.user" class="mt-8 grid gap-6 md:grid-cols-[auto_1fr] md:items-start">
        <div class="flex size-16 items-center justify-center rounded-md bg-slate-950 text-xl font-semibold text-white">
          {{ initials }}
        </div>
        <div>
          <h2 class="text-xl font-semibold text-slate-950">{{ auth.user.nickname }}</h2>
          <p class="mt-1 text-sm text-slate-600">@{{ auth.user.username }}</p>
          <dl class="mt-6 grid gap-4 text-sm sm:grid-cols-2">
            <div class="border-t border-slate-200 pt-4">
              <dt class="font-medium text-slate-950">Email</dt>
              <dd class="mt-1 text-slate-600">{{ auth.user.email ?? 'Not set' }}</dd>
            </div>
            <div class="border-t border-slate-200 pt-4">
              <dt class="font-medium text-slate-950">Phone</dt>
              <dd class="mt-1 text-slate-600">{{ auth.user.phone ?? 'Not set' }}</dd>
            </div>
          </dl>
        </div>
      </section>
    </section>
  </main>
</template>
```

- [ ] **Step 4: Run home tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/client test -- src/pages/auth-pages.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit protected home**

```bash
git add apps/client/src/pages/index.vue apps/client/src/pages/auth-pages.test.ts
git commit -m "feat: add protected home page"
```

---

### Task 9: Full Verification And Browser QA

**Files:**

- All frontend auth files from previous tasks.

- [ ] **Step 1: Run focused client tests**

Run:

```bash
pnpm --filter @rev30/client test -- src/api.test.ts src/stores/auth.test.ts src/auth/requests.test.ts src/auth/forms.test.ts src/auth/guards.test.ts src/pages/auth-pages.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run client typecheck**

Run:

```bash
pnpm --filter @rev30/client typecheck
```

Expected: PASS.

- [ ] **Step 3: Run full project checks**

Run:

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 4: Start the development server**

Run:

```bash
pnpm dev
```

Expected: server starts at `http://localhost:3000`, client starts at `http://localhost:5173`, and Vite proxies `/api` to the server.

- [ ] **Step 5: Browser check desktop and mobile**

Open `http://localhost:5173/login` and verify:

- Desktop login page uses the two-column auth shell.
- Mobile width collapses to one column with the form first.
- Invalid login shows field errors without sending a request.
- Register page includes username, nickname, password, email, and phone.
- Register success enters `/`.
- Refreshing `/` after login restores session through `/api/auth/refresh`.
- Clicking sign out clears the session and routes to `/login`.

- [ ] **Step 6: Commit final verification fixes if any were needed**

If verification required changes, commit them with a narrow message:

```bash
git add apps/client
git commit -m "fix: polish auth frontend verification"
```

If no changes were needed, do not create an empty commit.
