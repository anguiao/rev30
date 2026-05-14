# Login Failure Rate Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add username-based login failure rate limiting with a persisted database bucket, 5 failures per 15 minutes, 15-minute lockout, and periodic cleanup.

**Architecture:** Store login failure state in a new `auth_login_attempt_buckets` table keyed by normalized username. Keep the control flow inside the auth service so existing credential validation and anti-enumeration behavior remain centralized. Reuse the current Drizzle schema, PGlite/PostgreSQL migration, auth route error mapping, Vue login form, and database maintenance worker patterns.

**Tech Stack:** TypeScript, Hono, Drizzle ORM, PGlite/PostgreSQL, Vitest, Vue 3, Pinia Colada, TanStack Vue Form.

---

## File Structure

- Modify `apps/server/src/db/schema.ts`: add `authLoginAttemptBuckets`.
- Create generated migration files under `apps/server/drizzle`: new SQL migration and Drizzle metadata.
- Modify `apps/server/.env.example`: document login failure and cleanup env vars.
- Modify `apps/server/src/modules/auth/config.ts`: add limit config defaults and env parsing.
- Modify `apps/server/__tests__/modules/auth/config.test.ts`: cover new config defaults and env parsing.
- Modify `apps/server/src/modules/auth/errors.ts`: add `AuthLoginRateLimitedError`.
- Modify `apps/server/src/modules/auth/repository.ts`: add login attempt bucket read/write/delete methods.
- Modify `apps/server/src/modules/auth/service.ts`: enforce username bucket lockout around existing login flow.
- Modify `apps/server/__tests__/modules/auth/service.test.ts`: cover service-level calls and lockout short circuit.
- Modify `apps/server/__tests__/modules/auth/integration.test.ts`: cover real database login lockout behavior.
- Modify `apps/server/src/modules/auth/routes.ts`: map rate limit errors to 429.
- Modify `apps/server/__tests__/modules/auth/routes.test.ts`: cover 429 route response and no refresh cookie.
- Create `apps/server/src/db/maintenance/login-attempt-cleanup.ts`: cleanup expired login attempt buckets.
- Modify `apps/server/src/db/maintenance/index.ts`: start the new cleanup worker.
- Modify `apps/server/__tests__/db/maintenance.test.ts`: cover login attempt cleanup behavior.
- Modify `apps/client/src/features/auth/useLoginForm.ts`: display 429 server message.
- Modify `apps/client/__tests__/features/auth/login.test.ts`: cover 429 login page feedback.

---

### Task 1: Schema, Migration, And Config

**Files:**
- Modify: `apps/server/src/db/schema.ts`
- Generate: `apps/server/drizzle/0011_*.sql`
- Generate: `apps/server/drizzle/meta/0011_snapshot.json`
- Modify: `apps/server/drizzle/meta/_journal.json`
- Modify: `apps/server/.env.example`
- Modify: `apps/server/src/modules/auth/config.ts`
- Test: `apps/server/__tests__/db/migrate.test.ts`
- Test: `apps/server/__tests__/modules/auth/config.test.ts`

- [ ] **Step 1: Write the failing migration test**

Add this assertion inside `it('applies packaged migrations to a fresh PGlite database', ...)` in `apps/server/__tests__/db/migrate.test.ts`, after the existing `systemResource` assertion:

```ts
      await client.query(
        `
          insert into "auth_login_attempt_buckets"
            ("username", "failed_count", "window_started_at", "last_failed_at", "created_at", "updated_at")
          values
            ('migrated-login-attempt', 1, now(), now(), now(), now())
        `,
      )
```

- [ ] **Step 2: Write the failing config test**

Update `apps/server/__tests__/modules/auth/config.test.ts`:

```ts
  it('uses login failure rate limit defaults', () => {
    expect(readAuthConfig({ NODE_ENV: 'test' })).toMatchObject({
      loginFailureMaxAttempts: 5,
      loginFailureWindowSeconds: 900,
      loginFailureLockSeconds: 900,
    })
  })

  it('reads login failure rate limit settings from env', () => {
    expect(
      readAuthConfig({
        NODE_ENV: 'test',
        AUTH_LOGIN_FAILURE_MAX_ATTEMPTS: '7',
        AUTH_LOGIN_FAILURE_WINDOW_SECONDS: '300',
        AUTH_LOGIN_FAILURE_LOCK_SECONDS: '600',
      }),
    ).toMatchObject({
      loginFailureMaxAttempts: 7,
      loginFailureWindowSeconds: 300,
      loginFailureLockSeconds: 600,
    })
  })
```

Also update the existing `reads secrets and expiration seconds from env` test so its expected object includes the new default fields:

```ts
    ).toEqual({
      accessSecret: 'access-secret',
      refreshSecret: 'refresh-secret',
      accessExpiresInSeconds: 60,
      refreshExpiresInSeconds: 120,
      loginFailureMaxAttempts: 5,
      loginFailureWindowSeconds: 900,
      loginFailureLockSeconds: 900,
      secureCookies: true,
    })
```

- [ ] **Step 3: Run tests to verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/db/migrate.test.ts __tests__/modules/auth/config.test.ts
```

Expected: FAIL. The migration test fails because `auth_login_attempt_buckets` does not exist, and config tests fail because the new config fields are missing.

- [ ] **Step 4: Add the schema table**

In `apps/server/src/db/schema.ts`, add this after `authRefreshTokens`:

```ts
export const authLoginAttemptBuckets = pgTable(
  'auth_login_attempt_buckets',
  {
    username: text('username').primaryKey(),
    failedCount: integer('failed_count').notNull(),
    windowStartedAt: timestamp('window_started_at', timestampOptions).notNull(),
    lastFailedAt: timestamp('last_failed_at', timestampOptions).notNull(),
    lockedUntil: timestamp('locked_until', timestampOptions),
    ...mutableTimestamps(),
  },
  (table) => [
    index('auth_login_attempt_buckets_locked_until_idx').on(table.lockedUntil),
    index('auth_login_attempt_buckets_window_started_at_idx').on(table.windowStartedAt),
  ],
)
```

- [ ] **Step 5: Generate the migration**

Run:

```bash
pnpm --filter @rev30/server db:generate -- --name add_auth_login_attempt_buckets
```

Expected: Drizzle creates a new SQL migration and updates `apps/server/drizzle/meta/_journal.json` plus a new snapshot. Keep the generated migration filename and tag.

- [ ] **Step 6: Add auth config fields**

Update `apps/server/src/modules/auth/config.ts`:

```ts
const defaultLoginFailureMaxAttempts = 5
const defaultLoginFailureWindowSeconds = 900
const defaultLoginFailureLockSeconds = 900
```

Extend `AuthConfig`:

```ts
  loginFailureMaxAttempts: number
  loginFailureWindowSeconds: number
  loginFailureLockSeconds: number
```

Return the values from `readAuthConfig()`:

```ts
    loginFailureMaxAttempts: readPositiveInteger(
      env.AUTH_LOGIN_FAILURE_MAX_ATTEMPTS,
      defaultLoginFailureMaxAttempts,
    ),
    loginFailureWindowSeconds: readPositiveInteger(
      env.AUTH_LOGIN_FAILURE_WINDOW_SECONDS,
      defaultLoginFailureWindowSeconds,
    ),
    loginFailureLockSeconds: readPositiveInteger(
      env.AUTH_LOGIN_FAILURE_LOCK_SECONDS,
      defaultLoginFailureLockSeconds,
    ),
```

- [ ] **Step 7: Update env example**

Add to `apps/server/.env.example` after the JWT expiration settings:

```dotenv
AUTH_LOGIN_FAILURE_MAX_ATTEMPTS=5
AUTH_LOGIN_FAILURE_WINDOW_SECONDS=900
AUTH_LOGIN_FAILURE_LOCK_SECONDS=900
AUTH_LOGIN_ATTEMPT_CLEANUP_INTERVAL_MS=21600000
AUTH_LOGIN_ATTEMPT_RETENTION_MS=86400000
```

- [ ] **Step 8: Run tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/db/migrate.test.ts __tests__/modules/auth/config.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/server/src/db/schema.ts apps/server/drizzle apps/server/.env.example apps/server/src/modules/auth/config.ts apps/server/__tests__/db/migrate.test.ts apps/server/__tests__/modules/auth/config.test.ts
git commit -m "feat: add login attempt bucket schema"
```

---

### Task 2: Auth Service Limit Flow

**Files:**
- Modify: `apps/server/src/modules/auth/errors.ts`
- Modify: `apps/server/src/modules/auth/repository.ts`
- Modify: `apps/server/src/modules/auth/service.ts`
- Test: `apps/server/__tests__/modules/auth/service.test.ts`

- [ ] **Step 1: Write failing service tests**

Update the repository mock in `apps/server/__tests__/modules/auth/service.test.ts`:

```ts
    clearLoginAttemptBucket: vi.fn(),
    findLoginAttemptBucketByUsername: vi.fn(),
    recordLoginFailure: vi.fn(),
```

Extend the local `config` object:

```ts
  loginFailureMaxAttempts: 5,
  loginFailureWindowSeconds: 900,
  loginFailureLockSeconds: 900,
```

Add these tests in `describe('auth service', ...)`:

```ts
  it('records failed login attempts for unknown users', async () => {
    mocks.repository.findActiveUserCredentialByUsername.mockResolvedValue(undefined)
    mocks.repository.findLoginAttemptBucketByUsername.mockResolvedValue(undefined)

    const service = createAuthService({} as never, config)

    await expect(
      service.login({
        username: 'missing',
        password: 'secret-password',
      }),
    ).rejects.toBeInstanceOf(AuthInvalidCredentialsError)

    expect(mocks.repository.recordLoginFailure).toHaveBeenCalledWith({
      username: 'missing',
      now: expect.any(Date),
      maxAttempts: 5,
      windowSeconds: 900,
      lockSeconds: 900,
    })
  })

  it('rejects locked login attempts before password verification', async () => {
    mocks.repository.findLoginAttemptBucketByUsername.mockResolvedValue({
      username: 'ada',
      failedCount: 5,
      windowStartedAt: new Date('2026-05-14T00:00:00.000Z'),
      lastFailedAt: new Date('2026-05-14T00:00:00.000Z'),
      lockedUntil: new Date(Date.now() + 60_000),
      createdAt: new Date('2026-05-14T00:00:00.000Z'),
      updatedAt: new Date('2026-05-14T00:00:00.000Z'),
    })

    const service = createAuthService({} as never, config)

    await expect(
      service.login({
        username: 'ada',
        password: 'secret-password',
      }),
    ).rejects.toBeInstanceOf(AuthLoginRateLimitedError)

    expect(mocks.verifyPassword).not.toHaveBeenCalled()
    expect(mocks.repository.createRefreshSession).not.toHaveBeenCalled()
  })

  it('clears failed login attempts after successful login', async () => {
    mocks.repository.findLoginAttemptBucketByUsername.mockResolvedValue({
      username: 'ada',
      failedCount: 2,
      windowStartedAt: new Date('2026-05-14T00:00:00.000Z'),
      lastFailedAt: new Date('2026-05-14T00:01:00.000Z'),
      lockedUntil: null,
      createdAt: new Date('2026-05-14T00:00:00.000Z'),
      updatedAt: new Date('2026-05-14T00:01:00.000Z'),
    })
    mocks.repository.findActiveUserCredentialByUsername.mockResolvedValue({
      credential: {
        userId: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        passwordHash: 'stored-password-hash',
        createdAt: new Date('2026-04-30T00:00:00.000Z'),
        updatedAt: new Date('2026-04-30T00:00:00.000Z'),
      },
      departments: [],
      roles: [],
      user: createUserRow(),
    })
    mocks.verifyPassword.mockResolvedValue(true)
    mocks.repository.createRefreshSession.mockResolvedValue(undefined)

    const service = createAuthService({} as never, config)
    await service.login({
      username: 'ada',
      password: 'secret-password',
    })

    expect(mocks.repository.clearLoginAttemptBucket).toHaveBeenCalledWith('ada')
  })
```

Update the import:

```ts
import {
  AuthInvalidCredentialsError,
  AuthLoginRateLimitedError,
} from '../../../src/modules/auth/errors'
```

- [ ] **Step 2: Run service tests to verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/auth/service.test.ts
```

Expected: FAIL because `AuthLoginRateLimitedError` and repository methods do not exist.

- [ ] **Step 3: Add the rate limit error**

In `apps/server/src/modules/auth/errors.ts`:

```ts
export class AuthLoginRateLimitedError extends Error {
  constructor() {
    super('登录失败次数过多，请稍后再试')
    this.name = 'AuthLoginRateLimitedError'
  }
}
```

- [ ] **Step 4: Add repository methods**

In `apps/server/src/modules/auth/repository.ts`, import `authLoginAttemptBuckets`:

```ts
import { and, eq, gt, isNull, ne } from 'drizzle-orm'
import { authLoginAttemptBuckets, authPasswordCredentials, authRefreshTokens, systemUsers } from '../../db/schema'
```

Add this type near the top:

```ts
type RecordLoginFailureInput = {
  username: string
  now: Date
  maxAttempts: number
  windowSeconds: number
  lockSeconds: number
}
```

Add these methods to the returned repository object:

```ts
    async findLoginAttemptBucketByUsername(username: string) {
      const rows = await database
        .select()
        .from(authLoginAttemptBuckets)
        .where(eq(authLoginAttemptBuckets.username, username))
        .limit(1)

      return rows[0]
    },

    async recordLoginFailure(input: RecordLoginFailureInput) {
      const windowCutoff = new Date(input.now.getTime() - input.windowSeconds * 1000)

      return await database.transaction(async (tx) => {
        const [bucket] = await tx
          .select()
          .from(authLoginAttemptBuckets)
          .where(eq(authLoginAttemptBuckets.username, input.username))
          .limit(1)
          .for('update')

        const shouldReset =
          !bucket ||
          bucket.windowStartedAt <= windowCutoff ||
          (bucket.lockedUntil !== null && bucket.lockedUntil <= input.now)
        const failedCount = shouldReset ? 1 : bucket.failedCount + 1
        const lockedUntil =
          failedCount >= input.maxAttempts
            ? new Date(input.now.getTime() + input.lockSeconds * 1000)
            : null

        if (!bucket) {
          const [created] = await tx
            .insert(authLoginAttemptBuckets)
            .values({
              username: input.username,
              failedCount,
              windowStartedAt: input.now,
              lastFailedAt: input.now,
              lockedUntil,
            })
            .returning()

          return created
        }

        const [updated] = await tx
          .update(authLoginAttemptBuckets)
          .set({
            failedCount,
            windowStartedAt: shouldReset ? input.now : bucket.windowStartedAt,
            lastFailedAt: input.now,
            lockedUntil,
          })
          .where(eq(authLoginAttemptBuckets.username, input.username))
          .returning()

        return updated
      })
    },

    async clearLoginAttemptBucket(username: string) {
      await database
        .delete(authLoginAttemptBuckets)
        .where(eq(authLoginAttemptBuckets.username, username))
    },
```

- [ ] **Step 5: Enforce limit in the service**

In `apps/server/src/modules/auth/service.ts`, import `AuthLoginRateLimitedError` and add helpers above `createAuthService`:

```ts
function isLoginAttemptLocked(
  bucket: { lockedUntil: Date | null } | undefined,
  now: Date,
) {
  return bucket?.lockedUntil !== null && bucket?.lockedUntil !== undefined && bucket.lockedUntil > now
}
```

Update `login()`:

```ts
    async login(input: AuthLoginInput) {
      const now = new Date()
      const bucket = await repository.findLoginAttemptBucketByUsername(input.username)

      if (isLoginAttemptLocked(bucket, now)) {
        throw new AuthLoginRateLimitedError()
      }

      const account = await repository.findActiveUserCredentialByUsername(input.username)
      const passwordHash = account?.credential.passwordHash ?? dummyPasswordHash
      const passwordMatches = await verifyPassword(input.password, passwordHash)

      if (!account || account.user.status !== USER_STATUS_ENABLED || !passwordMatches) {
        await repository.recordLoginFailure({
          username: input.username,
          now,
          maxAttempts: config.loginFailureMaxAttempts,
          windowSeconds: config.loginFailureWindowSeconds,
          lockSeconds: config.loginFailureLockSeconds,
        })
        throw new AuthInvalidCredentialsError()
      }

      await repository.clearLoginAttemptBucket(input.username)

      const user = toUser(account.user, account.departments, account.roles)

      return createAuthSession(user)
    },
```

- [ ] **Step 6: Run service tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/auth/service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/modules/auth/errors.ts apps/server/src/modules/auth/repository.ts apps/server/src/modules/auth/service.ts apps/server/__tests__/modules/auth/service.test.ts
git commit -m "feat: enforce login failure limit in auth service"
```

---

### Task 3: Real Database Login Lockout

**Files:**
- Modify: `apps/server/__tests__/modules/auth/integration.test.ts`
- Read: `apps/server/src/modules/auth/repository.ts`
- Read: `apps/server/src/modules/auth/service.ts`

- [ ] **Step 1: Write the failing integration test**

Import the new table:

```ts
  authLoginAttemptBuckets,
```

Add this test after `returns a uniform credentials error for wrong passwords and disabled users`:

```ts
  it('locks a username after repeated login failures and clears failures after success', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    await createPasswordAccount(database, {
      username: 'rate-limit-user',
      password: 'secret-password',
    })

    for (let index = 0; index < 5; index += 1) {
      const failed = await login(app, {
        username: 'rate-limit-user',
        password: 'wrong-password',
      })

      expect(failed.response.status).toBe(401)
      expect(failed.body).toEqual({ message: '用户名或密码错误' })
    }

    const locked = await login(app, {
      username: 'rate-limit-user',
      password: 'secret-password',
    })

    expect(locked.response.status).toBe(429)
    expect(locked.body).toEqual({ message: '登录失败次数过多，请稍后再试' })
    expect(locked.response.headers.get('set-cookie')).toBeNull()

    const unaffectedUser = await createPasswordAccount(database, {
      username: 'unaffected-login-user',
      password: 'secret-password',
    })
    const unaffected = await login(app, {
      username: unaffectedUser.username,
      password: 'secret-password',
    })

    expect(unaffected.response.status).toBe(200)

    await database
      .delete(authLoginAttemptBuckets)
      .where(eq(authLoginAttemptBuckets.username, 'rate-limit-user'))

    const recovered = await login(app, {
      username: 'rate-limit-user',
      password: 'secret-password',
    })

    expect(recovered.response.status).toBe(200)

    const remainingBuckets = await database
      .select()
      .from(authLoginAttemptBuckets)
      .where(eq(authLoginAttemptBuckets.username, 'rate-limit-user'))

    expect(remainingBuckets).toHaveLength(0)
  })
```

- [ ] **Step 2: Run integration test to verify RED or expose implementation gap**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/auth/integration.test.ts
```

Expected before Task 2 implementation: FAIL. If Task 2 has already passed, this may PASS; if it fails, use the failure to fix repository or service behavior.

- [ ] **Step 3: Fix minimal persistence implementation gaps**

If Step 2 fails because `recordLoginFailure()` does not persist the bucket shape expected by the integration test, update `apps/server/src/modules/auth/repository.ts` so both insert and update paths return the Drizzle result without throwing:

```ts
return created
```

or

```ts
return updated
```

Do not edit route or frontend files in this task.

- [ ] **Step 4: Run integration test to verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/auth/integration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/__tests__/modules/auth/integration.test.ts apps/server/src/modules/auth/repository.ts apps/server/src/modules/auth/service.ts
git commit -m "test: cover persisted login failure lockout"
```

---

### Task 4: Route And Frontend Error Mapping

**Files:**
- Modify: `apps/server/src/modules/auth/routes.ts`
- Modify: `apps/server/__tests__/modules/auth/routes.test.ts`
- Modify: `apps/client/src/features/auth/useLoginForm.ts`
- Modify: `apps/client/__tests__/features/auth/login.test.ts`

- [ ] **Step 1: Write failing route test**

Update the import in `apps/server/__tests__/modules/auth/routes.test.ts`:

```ts
  AuthLoginRateLimitedError,
```

Add this test after `maps invalid login credentials to route responses`:

```ts
  it('maps login rate limit errors to route responses without refresh cookies', async () => {
    const app = createTestApp()

    mocks.service.login.mockRejectedValueOnce(new AuthLoginRateLimitedError())
    const loginResponse = await app.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'ada',
        password: 'secret-password',
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(loginResponse.status).toBe(429)
    expect(await loginResponse.json()).toEqual({
      message: '登录失败次数过多，请稍后再试',
    })
    expect(loginResponse.headers.get('set-cookie')).toBeNull()
  })
```

- [ ] **Step 2: Write failing frontend test**

Add this test to `apps/client/__tests__/features/auth/login.test.ts` after the 401 test:

```ts
  it('shows the server message for login rate limit errors', async () => {
    loginMock.mockRejectedValue(
      new MockAuthRequestError(429, '登录失败次数过多，请稍后再试'),
    )
    const { router, wrapper } = await mountLoginPage()

    await wrapper.find('[data-test="login-username"] input').setValue('ada')
    await wrapper.find('[data-test="login-password"] input').setValue('password123')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const auth = useAuthStore()
    expect(loginMock).toHaveBeenCalledOnce()
    expect(auth.isAuthenticated).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/login')
    expect(wrapper.text()).toContain('登录失败次数过多，请稍后再试')
  })
```

- [ ] **Step 3: Run tests to verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/auth/routes.test.ts
pnpm --filter @rev30/client test -- __tests__/features/auth/login.test.ts
```

Expected: FAIL because route mapping and frontend 429 handling are missing.

- [ ] **Step 4: Map 429 in auth routes**

In `apps/server/src/modules/auth/routes.ts`, import `AuthLoginRateLimitedError` and add this branch before the 401 branch:

```ts
  if (error instanceof AuthLoginRateLimitedError) {
    return c.json({ message: error.message }, 429)
  }
```

- [ ] **Step 5: Display 429 message in the login form**

In `apps/client/src/features/auth/useLoginForm.ts`, replace the catch assignment with:

```ts
        formError.value =
          error instanceof AuthRequestError && error.status === 401
            ? '用户名或密码错误'
            : error instanceof AuthRequestError && error.status === 429
              ? error.message
              : '登录失败，请稍后再试'
```

- [ ] **Step 6: Run tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/modules/auth/routes.test.ts
pnpm --filter @rev30/client test -- __tests__/features/auth/login.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/modules/auth/routes.ts apps/server/__tests__/modules/auth/routes.test.ts apps/client/src/features/auth/useLoginForm.ts apps/client/__tests__/features/auth/login.test.ts
git commit -m "feat: show login rate limit errors"
```

---

### Task 5: Login Attempt Cleanup Worker

**Files:**
- Create: `apps/server/src/db/maintenance/login-attempt-cleanup.ts`
- Modify: `apps/server/src/db/maintenance/index.ts`
- Test: `apps/server/__tests__/db/maintenance.test.ts`

- [ ] **Step 1: Write failing cleanup tests**

Update imports in `apps/server/__tests__/db/maintenance.test.ts`:

```ts
import { authLoginAttemptBuckets, authRefreshTokens, systemUsers } from '../../src/db/schema'
import {
  cleanupAuthLoginAttemptBuckets,
  startAuthLoginAttemptCleanup,
} from '../../src/db/maintenance/login-attempt-cleanup'
```

Add these tests inside `describe('database maintenance', ...)`:

```ts
  it('removes login attempt buckets outside the retention window', async () => {
    const database = await createTestDb()
    const now = new Date()

    await database.insert(authLoginAttemptBuckets).values([
      {
        username: 'expired-open-window',
        failedCount: 1,
        windowStartedAt: new Date(now.getTime() - 25 * hourMs),
        lastFailedAt: new Date(now.getTime() - 25 * hourMs),
        createdAt: now,
        updatedAt: now,
      },
      {
        username: 'expired-lock',
        failedCount: 5,
        windowStartedAt: new Date(now.getTime() - 48 * hourMs),
        lastFailedAt: new Date(now.getTime() - 48 * hourMs),
        lockedUntil: new Date(now.getTime() - 25 * hourMs),
        createdAt: now,
        updatedAt: now,
      },
      {
        username: 'recent-open-window',
        failedCount: 1,
        windowStartedAt: new Date(now.getTime() - hourMs),
        lastFailedAt: new Date(now.getTime() - hourMs),
        createdAt: now,
        updatedAt: now,
      },
      {
        username: 'recent-lock',
        failedCount: 5,
        windowStartedAt: new Date(now.getTime() - 2 * hourMs),
        lastFailedAt: new Date(now.getTime() - 2 * hourMs),
        lockedUntil: new Date(now.getTime() - hourMs),
        createdAt: now,
        updatedAt: now,
      },
    ])

    const deletedCount = await cleanupAuthLoginAttemptBuckets(database, 24 * hourMs)

    const remaining = await database
      .select({ username: authLoginAttemptBuckets.username })
      .from(authLoginAttemptBuckets)
      .orderBy(authLoginAttemptBuckets.username)

    expect(deletedCount).toBe(2)
    expect(remaining.map((bucket) => bucket.username)).toEqual([
      'recent-lock',
      'recent-open-window',
    ])
  })

  it('keeps login attempt cleanup disabled when the interval is zero', async () => {
    vi.useFakeTimers()
    vi.stubEnv('AUTH_LOGIN_ATTEMPT_CLEANUP_INTERVAL_MS', '0')

    const returning = vi.fn(() => Promise.resolve([]))
    const worker = startAuthLoginAttemptCleanup({
      delete: vi.fn(() => ({
        where: vi.fn(() => ({
          returning,
        })),
      })),
    } as never)

    await vi.advanceTimersByTimeAsync(0)
    await worker.stop()

    expect(returning).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run cleanup tests to verify RED**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/db/maintenance.test.ts
```

Expected: FAIL because the new cleanup module does not exist.

- [ ] **Step 3: Add the cleanup worker**

Create `apps/server/src/db/maintenance/login-attempt-cleanup.ts`:

```ts
import { and, isNotNull, isNull, lte, or } from 'drizzle-orm'
import { logger } from '../../logger'
import type { Db } from '../index'
import { authLoginAttemptBuckets } from '../schema'
import type { MaintenanceWorker } from './types'

const defaultLoginAttemptCleanupIntervalMs = 6 * 60 * 60 * 1000
const defaultLoginAttemptRetentionMs = 24 * 60 * 60 * 1000
const maxTimerDelayMs = 2 ** 31 - 1

function readLoginAttemptCleanupIntervalMs() {
  const value = Number(
    process.env.AUTH_LOGIN_ATTEMPT_CLEANUP_INTERVAL_MS ?? defaultLoginAttemptCleanupIntervalMs,
  )

  if (!Number.isInteger(value) || value < 0 || value > maxTimerDelayMs) {
    throw new Error(`AUTH_LOGIN_ATTEMPT_CLEANUP_INTERVAL_MS 必须是 0 或正整数毫秒值`)
  }

  return value
}

function readLoginAttemptRetentionMs() {
  const value = Number(process.env.AUTH_LOGIN_ATTEMPT_RETENTION_MS ?? defaultLoginAttemptRetentionMs)

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`AUTH_LOGIN_ATTEMPT_RETENTION_MS 必须是 0 或正整数毫秒值`)
  }

  return value
}

export async function cleanupAuthLoginAttemptBuckets(
  database: Db,
  retentionMs: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - retentionMs)
  const deleted = await database
    .delete(authLoginAttemptBuckets)
    .where(
      or(
        and(
          isNull(authLoginAttemptBuckets.lockedUntil),
          lte(authLoginAttemptBuckets.windowStartedAt, cutoff),
        ),
        and(
          isNotNull(authLoginAttemptBuckets.lockedUntil),
          lte(authLoginAttemptBuckets.lockedUntil, cutoff),
        ),
      ),
    )
    .returning()

  return deleted.length
}

export function startAuthLoginAttemptCleanup(database: Db): MaintenanceWorker {
  const intervalMs = readLoginAttemptCleanupIntervalMs()
  const retentionMs = readLoginAttemptRetentionMs()

  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let currentRun: Promise<void> | null = null

  function scheduleNext(delayMs: number) {
    if (stopped || intervalMs <= 0) {
      return
    }

    timer = setTimeout(() => {
      timer = null
      currentRun = run().finally(() => {
        currentRun = null
      })
    }, delayMs)
    timer.unref()
  }

  async function run() {
    if (stopped) {
      return
    }

    try {
      const deletedCount = await cleanupAuthLoginAttemptBuckets(database, retentionMs)

      if (deletedCount > 0) {
        logger.info({ deletedCount }, 'auth login attempt cleanup completed')
      }
    } catch (error) {
      if (!stopped) {
        logger.error({ error }, 'auth login attempt cleanup failed')
      }
    }

    scheduleNext(intervalMs)
  }

  scheduleNext(0)

  return {
    async stop() {
      stopped = true

      if (timer) {
        clearTimeout(timer)
        timer = null
      }

      await currentRun
    },
  }
}
```

- [ ] **Step 4: Start the worker**

Update `apps/server/src/db/maintenance/index.ts`:

```ts
import { startAuthLoginAttemptCleanup } from './login-attempt-cleanup'
```

and:

```ts
  const workers: MaintenanceWorker[] = [
    startAuthRefreshTokenCleanup(database),
    startAuthLoginAttemptCleanup(database),
  ]
```

- [ ] **Step 5: Run cleanup tests to verify GREEN**

Run:

```bash
pnpm --filter @rev30/server test -- __tests__/db/maintenance.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/db/maintenance/login-attempt-cleanup.ts apps/server/src/db/maintenance/index.ts apps/server/__tests__/db/maintenance.test.ts
git commit -m "feat: clean up login attempt buckets"
```

---

### Task 6: Full Verification

**Files:**
- Read: `docs/superpowers/specs/2026-05-14-login-failure-rate-limit-design.md`
- Verify changed files from Tasks 1-5

- [ ] **Step 1: Run focused server tests**

```bash
pnpm --filter @rev30/server test -- __tests__/modules/auth/service.test.ts __tests__/modules/auth/routes.test.ts __tests__/modules/auth/integration.test.ts __tests__/db/maintenance.test.ts __tests__/db/migrate.test.ts __tests__/modules/auth/config.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused client tests**

```bash
pnpm --filter @rev30/client test -- __tests__/features/auth/login.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Run lint and format checks**

```bash
pnpm lint:check
pnpm format:check
```

Expected: PASS.

- [ ] **Step 5: Run complete test suite**

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 6: Check git status**

```bash
git status --short
```

Expected: only intentional files are modified, staged, or committed.

---

## Self-Review

- Spec coverage: data model, config, service flow, route response, frontend response, cleanup, migration, and tests are covered.
- Placeholder scan: no TBD, TODO, or deferred implementation wording.
- Type consistency: the plan consistently uses `authLoginAttemptBuckets`, `AuthLoginRateLimitedError`, `loginFailureMaxAttempts`, `loginFailureWindowSeconds`, and `loginFailureLockSeconds`.
