# Auth Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build backend-only username/password authentication with JWT access tokens, rotating refresh tokens, browser refresh cookies, and App-friendly JSON token responses.

**Architecture:** Shared auth schemas live in `packages/shared`, while runtime behavior lives in a new `apps/server/src/modules/auth` module. Access JWTs are stateless and short-lived; refresh JWTs contain a `jti` whose SHA-256 hash is stored in `auth_refresh_tokens` so refresh tokens can be revoked and rotated. The existing `users` table remains the account source of truth; username/password login credentials live in `auth_password_credentials`.

**Tech Stack:** pnpm workspace, TypeScript, zod, Hono, Hono cookie helper, Hono JWT helper, Node `crypto.scrypt`, Drizzle ORM, PGlite, PostgreSQL-compatible SQL migrations, Vitest, oxlint, oxfmt.

---

## File Structure

- Modify `packages/shared/src/index.ts`: export auth schemas and types.
- Create `packages/shared/src/auth.ts`: auth request/response schemas and derived types.
- Create `packages/shared/src/auth.test.ts`: schema tests for register, login, refresh/logout, and token response.
- Modify `apps/server/src/db/schema.ts`: add `authPasswordCredentials` and `authRefreshTokens`.
- Create `apps/server/drizzle/0001_add_auth.sql`: add password credential and refresh token session tables.
- Modify `apps/server/src/db/migrations.test.ts`: verify fresh databases expose the new auth columns/table.
- Create `apps/server/src/modules/auth/config.ts`: read JWT secrets and expiration seconds from env.
- Create `apps/server/src/modules/auth/password.ts`: hash and verify passwords with `crypto.scrypt`.
- Create `apps/server/src/modules/auth/tokens.ts`: sign/verify access and refresh JWTs and hash refresh `jti` values.
- Create `apps/server/src/modules/auth/cookies.ts`: set/read/clear `refresh_token` cookies.
- Create `apps/server/src/modules/auth/errors.ts`: auth-specific domain errors.
- Create `apps/server/src/modules/auth/repository.ts`: user credential lookup and refresh token persistence.
- Create `apps/server/src/modules/auth/service.ts`: register, login, refresh, logout, and me orchestration.
- Create `apps/server/src/modules/auth/routes.ts`: Hono route handlers and HTTP error mapping.
- Create `apps/server/src/modules/auth/routes.test.ts`: route tests for all auth behavior.
- Modify `apps/server/src/app.ts`: mount `/api/auth`.
- Modify `apps/server/.env.example`: document JWT env vars.

---

### Task 1: Shared Auth Schemas

**Files:**

- Create: `packages/shared/src/auth.ts`
- Create: `packages/shared/src/auth.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write failing shared auth schema tests**

Create `packages/shared/src/auth.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { USER_STATUS_ENABLED } from './user'
import {
  authLoginSchema,
  authLogoutSchema,
  authRefreshSchema,
  authRegisterSchema,
  authTokenResponseSchema,
} from './auth'

describe('auth schemas', () => {
  it('parses public registration input without allowing status', () => {
    expect(
      authRegisterSchema.parse({
        username: 'ada',
        password: 'correct horse battery staple',
        nickname: 'Ada Lovelace',
        email: '',
        phone: '',
      }),
    ).toEqual({
      username: 'ada',
      password: 'correct horse battery staple',
      nickname: 'Ada Lovelace',
      email: null,
      phone: null,
    })

    expect(() =>
      authRegisterSchema.parse({
        username: 'ada',
        password: 'correct horse battery staple',
        nickname: 'Ada Lovelace',
        status: 0,
      }),
    ).toThrow()
  })

  it('parses username and password login input', () => {
    expect(
      authLoginSchema.parse({
        username: ' ada ',
        password: 'secret',
      }),
    ).toEqual({
      username: 'ada',
      password: 'secret',
    })
  })

  it('accepts refresh and logout with optional refresh token', () => {
    expect(authRefreshSchema.parse({})).toEqual({})
    expect(authRefreshSchema.parse({ refreshToken: ' token ' })).toEqual({
      refreshToken: 'token',
    })
    expect(authLogoutSchema.parse({})).toEqual({})
    expect(authLogoutSchema.parse({ refreshToken: ' token ' })).toEqual({
      refreshToken: 'token',
    })
  })

  it('parses token response with current user payload', () => {
    expect(
      authTokenResponseSchema.parse({
        user: {
          id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
          username: 'ada',
          nickname: 'Ada Lovelace',
          email: null,
          phone: null,
          status: USER_STATUS_ENABLED,
          createdAt: '2026-04-30T00:00:00.000Z',
          updatedAt: '2026-04-30T00:00:00.000Z',
        },
        accessToken: 'access.jwt',
        refreshToken: 'refresh.jwt',
        tokenType: 'Bearer',
        expiresIn: 900,
      }),
    ).toMatchObject({
      accessToken: 'access.jwt',
      refreshToken: 'refresh.jwt',
      tokenType: 'Bearer',
      expiresIn: 900,
    })
  })
})
```

- [ ] **Step 2: Run the shared auth schema test and verify it fails**

Run:

```bash
pnpm --filter @rev30/shared test -- src/auth.test.ts
```

Expected: FAIL because `./auth` does not exist.

- [ ] **Step 3: Add auth schemas**

Create `packages/shared/src/auth.ts`:

```ts
import { z } from 'zod'
import { userCreateSchema, userSchema } from './user'

const passwordSchema = z.string().min(1)
const optionalTokenSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
)

export const authRegisterSchema = userCreateSchema
  .pick({
    username: true,
    nickname: true,
    email: true,
    phone: true,
  })
  .extend({
    password: passwordSchema,
  })
  .strict()

export const authLoginSchema = z
  .object({
    username: z.string().trim().min(1),
    password: passwordSchema,
  })
  .strict()

export const authRefreshSchema = z
  .object({
    refreshToken: optionalTokenSchema,
  })
  .strict()

export const authLogoutSchema = authRefreshSchema

export const authTokenResponseSchema = z.object({
  user: userSchema,
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(),
})

export const authErrorResponseSchema = z.object({
  message: z.string(),
})

export type AuthRegisterInput = z.infer<typeof authRegisterSchema>
export type AuthLoginInput = z.infer<typeof authLoginSchema>
export type AuthRefreshInput = z.infer<typeof authRefreshSchema>
export type AuthLogoutInput = z.infer<typeof authLogoutSchema>
export type AuthTokenResponse = z.infer<typeof authTokenResponseSchema>
export type AuthErrorResponse = z.infer<typeof authErrorResponseSchema>
```

Modify `packages/shared/src/index.ts`:

```ts
export * from './auth'
export * from './user'
```

- [ ] **Step 4: Run the shared auth schema test and verify it passes**

Run:

```bash
pnpm --filter @rev30/shared test -- src/auth.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add packages/shared/src/auth.ts packages/shared/src/auth.test.ts packages/shared/src/index.ts
git commit -m "feat: add shared auth schemas"
```

---

### Task 2: Auth Database Schema And Migration

**Files:**

- Modify: `apps/server/src/db/schema.ts`
- Create: `apps/server/drizzle/0001_add_auth.sql`
- Modify: `apps/server/src/db/migrations.test.ts`
- Test: `apps/server/src/db/migrations.test.ts`

- [ ] **Step 1: Write failing migration coverage**

Modify `apps/server/src/db/migrations.test.ts` so the fresh development database test verifies the new auth structures:

```ts
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { authPasswordCredentials, authRefreshTokens, users } from './schema'
import { createDb } from './index'
import { applyPgliteMigrations } from './migrations'

const originalNodeEnv = process.env.NODE_ENV
const originalPgliteDataDir = process.env.PGLITE_DATA_DIR
const tempDirs: string[] = []

async function createTempDir() {
  const directory = await mkdtemp(join(tmpdir(), 'rev30-pglite-'))

  tempDirs.push(directory)

  return directory
}

function restoreEnv(key: 'NODE_ENV' | 'PGLITE_DATA_DIR', value: string | undefined) {
  if (value === undefined) {
    delete process.env[key]
    return
  }

  process.env[key] = value
}

describe('PGlite migrations', () => {
  afterEach(async () => {
    restoreEnv('NODE_ENV', originalNodeEnv)
    restoreEnv('PGLITE_DATA_DIR', originalPgliteDataDir)

    await Promise.all(
      tempDirs.splice(0).map((directory) => rm(directory, { force: true, recursive: true })),
    )
  })

  it('runs every SQL migration in order', async () => {
    const migrationsDir = await createTempDir()
    const client = new PGlite()

    await writeFile(
      join(migrationsDir, '0000_create_widgets.sql'),
      'create table widgets (name text not null);',
    )
    await writeFile(
      join(migrationsDir, '0001_insert_widgets.sql'),
      "insert into widgets (name) values ('first'), ('second');",
    )

    await applyPgliteMigrations(client, migrationsDir)

    const result = await client.query<{ name: string }>('select name from widgets order by name')

    expect(result.rows).toEqual([{ name: 'first' }, { name: 'second' }])

    await client.close()
  })

  it('creates usable auth tables for fresh development databases', async () => {
    const dataDir = join(await createTempDir(), 'dev')

    process.env.NODE_ENV = 'development'
    process.env.PGLITE_DATA_DIR = dataDir

    const database = await createDb()
    const now = new Date()
    const [created] = await database
      .insert(users)
      .values({
        id: randomUUID(),
        username: 'migration-auth',
        nickname: 'Migration Auth',
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    if (!created) {
      throw new Error('Expected migrated user')
    }

    const [credential] = await database
      .insert(authPasswordCredentials)
      .values({
        userId: created.id,
        passwordHash: 'scrypt$salt$hash',
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    const [session] = await database
      .insert(authRefreshTokens)
      .values({
        id: randomUUID(),
        userId: created.id,
        tokenHash: 'token-hash',
        expiresAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    expect(credential?.passwordHash).toBe('scrypt$salt$hash')
    expect(session?.tokenHash).toBe('token-hash')
  })
})
```

- [ ] **Step 2: Run migration tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/server test -- src/db/migrations.test.ts
```

Expected: FAIL because `authPasswordCredentials` and `authRefreshTokens` are not defined.

- [ ] **Step 3: Add Drizzle auth schema**

Modify `apps/server/src/db/schema.ts`:

```ts
import { USER_STATUS_ENABLED } from '@rev30/shared'
import { index, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    username: text('username').notNull(),
    nickname: text('nickname').notNull(),
    email: text('email'),
    phone: text('phone'),
    status: smallint('status').notNull().default(USER_STATUS_ENABLED),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('users_username_unique').on(table.username),
    uniqueIndex('users_email_unique').on(table.email),
    uniqueIndex('users_phone_unique').on(table.phone),
  ],
)

export const authPasswordCredentials = pgTable('auth_password_credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const authRefreshTokens = pgTable(
  'auth_refresh_tokens',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('auth_refresh_tokens_token_hash_unique').on(table.tokenHash),
    index('auth_refresh_tokens_user_id_idx').on(table.userId),
  ],
)
```

- [ ] **Step 4: Add SQL migration**

Create `apps/server/drizzle/0001_add_auth.sql`:

```sql
CREATE TABLE "auth_password_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_password_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE "auth_refresh_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "auth_refresh_tokens_token_hash_unique" ON "auth_refresh_tokens" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "auth_refresh_tokens_user_id_idx" ON "auth_refresh_tokens" USING btree ("user_id");
```

- [ ] **Step 5: Run migration tests**

Run:

```bash
pnpm --filter @rev30/server test -- src/db/migrations.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add apps/server/src/db/schema.ts apps/server/drizzle/0001_add_auth.sql apps/server/src/db/migrations.test.ts
git commit -m "feat: add auth database tables"
```

---

### Task 3: Auth Core Helpers

**Files:**

- Create: `apps/server/src/modules/auth/config.ts`
- Create: `apps/server/src/modules/auth/password.ts`
- Create: `apps/server/src/modules/auth/tokens.ts`
- Create: `apps/server/src/modules/auth/cookies.ts`
- Create: `apps/server/src/modules/auth/errors.ts`
- Test: `apps/server/src/modules/auth/config.test.ts`
- Test: `apps/server/src/modules/auth/password.test.ts`
- Test: `apps/server/src/modules/auth/tokens.test.ts`

- [ ] **Step 1: Write failing config helper tests**

Create `apps/server/src/modules/auth/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readAuthConfig } from './config'

describe('auth config', () => {
  it('uses development defaults for local and test environments', () => {
    expect(readAuthConfig({ NODE_ENV: 'test' })).toMatchObject({
      accessExpiresInSeconds: 900,
      refreshExpiresInSeconds: 604800,
      secureCookies: false,
    })
  })

  it('requires explicit secrets in production', () => {
    expect(() => readAuthConfig({ NODE_ENV: 'production' })).toThrow(
      'JWT_ACCESS_SECRET is required in production',
    )
  })

  it('reads secrets and expiration seconds from env', () => {
    expect(
      readAuthConfig({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'access-secret',
        JWT_REFRESH_SECRET: 'refresh-secret',
        JWT_ACCESS_EXPIRES_IN_SECONDS: '60',
        JWT_REFRESH_EXPIRES_IN_SECONDS: '120',
      }),
    ).toEqual({
      accessSecret: 'access-secret',
      refreshSecret: 'refresh-secret',
      accessExpiresInSeconds: 60,
      refreshExpiresInSeconds: 120,
      secureCookies: true,
    })
  })
})
```

- [ ] **Step 2: Write failing password helper tests**

Create `apps/server/src/modules/auth/password.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password'

describe('auth password helpers', () => {
  it('hashes passwords without storing plaintext and verifies matching passwords', async () => {
    const hash = await hashPassword('secret-password')

    expect(hash).not.toBe('secret-password')
    expect(hash.startsWith('scrypt$')).toBe(true)
    expect(await verifyPassword('secret-password', hash)).toBe(true)
    expect(await verifyPassword('wrong-password', hash)).toBe(false)
  })

  it('rejects malformed stored password hashes', async () => {
    expect(await verifyPassword('secret-password', 'scrypt$disabled$disabled')).toBe(false)
  })
})
```

- [ ] **Step 3: Write failing token helper tests**

Create `apps/server/src/modules/auth/tokens.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { AuthConfig } from './config'
import {
  createTokenPair,
  hashRefreshTokenId,
  verifyAccessToken,
  verifyRefreshToken,
} from './tokens'

const config: AuthConfig = {
  accessSecret: 'test-access-secret',
  refreshSecret: 'test-refresh-secret',
  accessExpiresInSeconds: 900,
  refreshExpiresInSeconds: 604800,
  secureCookies: false,
}

describe('auth token helpers', () => {
  it('creates and verifies access and refresh tokens with different secrets', async () => {
    const pair = await createTokenPair('8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7', config)

    expect(pair.accessToken).toEqual(expect.any(String))
    expect(pair.refreshToken).toEqual(expect.any(String))
    expect(pair.refreshTokenHash).toBe(hashRefreshTokenId(pair.refreshTokenId))
    expect(pair.accessExpiresIn).toBe(900)

    await expect(verifyAccessToken(pair.accessToken, config)).resolves.toEqual({
      userId: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
    })
    await expect(verifyRefreshToken(pair.refreshToken, config)).resolves.toMatchObject({
      userId: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
      refreshTokenId: pair.refreshTokenId,
      refreshTokenHash: pair.refreshTokenHash,
    })
    await expect(verifyAccessToken(pair.refreshToken, config)).rejects.toThrow(
      'Invalid access token',
    )
  })
})
```

- [ ] **Step 4: Run helper tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/server test -- src/modules/auth/config.test.ts src/modules/auth/password.test.ts src/modules/auth/tokens.test.ts
```

Expected: FAIL because the auth helper modules do not exist.

- [ ] **Step 5: Implement auth config and errors**

Create `apps/server/src/modules/auth/config.ts`:

```ts
const defaultAccessExpiresInSeconds = 900
const defaultRefreshExpiresInSeconds = 604800
const developmentAccessSecret = 'rev30-development-access-secret'
const developmentRefreshSecret = 'rev30-development-refresh-secret'

export type AuthConfig = {
  accessSecret: string
  refreshSecret: string
  accessExpiresInSeconds: number
  refreshExpiresInSeconds: number
  secureCookies: boolean
}

function readPositiveInteger(value: string | undefined, fallback: number) {
  if (value === undefined || value.trim() === '') {
    return fallback
  }

  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('JWT expiration values must be positive integers')
  }

  return parsed
}

export function readAuthConfig(env = process.env): AuthConfig {
  const isProduction = env.NODE_ENV === 'production'
  const accessSecret = env.JWT_ACCESS_SECRET ?? (isProduction ? undefined : developmentAccessSecret)
  const refreshSecret =
    env.JWT_REFRESH_SECRET ?? (isProduction ? undefined : developmentRefreshSecret)

  if (!accessSecret) {
    throw new Error('JWT_ACCESS_SECRET is required in production')
  }

  if (!refreshSecret) {
    throw new Error('JWT_REFRESH_SECRET is required in production')
  }

  return {
    accessSecret,
    refreshSecret,
    accessExpiresInSeconds: readPositiveInteger(
      env.JWT_ACCESS_EXPIRES_IN_SECONDS,
      defaultAccessExpiresInSeconds,
    ),
    refreshExpiresInSeconds: readPositiveInteger(
      env.JWT_REFRESH_EXPIRES_IN_SECONDS,
      defaultRefreshExpiresInSeconds,
    ),
    secureCookies: isProduction,
  }
}
```

Create `apps/server/src/modules/auth/errors.ts`:

```ts
export class AuthInvalidCredentialsError extends Error {
  constructor() {
    super('Invalid username or password')
    this.name = 'AuthInvalidCredentialsError'
  }
}

export class AuthInvalidRefreshTokenError extends Error {
  constructor() {
    super('Invalid refresh token')
    this.name = 'AuthInvalidRefreshTokenError'
  }
}

export class AuthUnauthorizedError extends Error {
  constructor() {
    super('Unauthorized')
    this.name = 'AuthUnauthorizedError'
  }
}
```

- [ ] **Step 6: Implement password helpers**

Create `apps/server/src/modules/auth/password.ts`:

```ts
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)
const algorithm = 'scrypt'
const keyLength = 64

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('base64url')
  const hash = (await scryptAsync(password, salt, keyLength)) as Buffer

  return `${algorithm}$${salt}$${hash.toString('base64url')}`
}

export async function verifyPassword(password: string, storedHash: string) {
  const [storedAlgorithm, salt, encodedHash] = storedHash.split('$')

  if (storedAlgorithm !== algorithm || !salt || !encodedHash) {
    return false
  }

  const expected = Buffer.from(encodedHash, 'base64url')
  const actual = (await scryptAsync(password, salt, expected.length)) as Buffer

  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
```

- [ ] **Step 7: Implement token helpers**

Create `apps/server/src/modules/auth/tokens.ts`:

```ts
import { randomUUID, createHash } from 'node:crypto'
import { sign, verify } from 'hono/jwt'
import type { AuthConfig } from './config'

type JwtPayload = {
  sub?: unknown
  type?: unknown
  jti?: unknown
  exp?: unknown
}

function nowInSeconds() {
  return Math.floor(Date.now() / 1000)
}

function assertSubject(payload: JwtPayload) {
  if (typeof payload.sub !== 'string') {
    throw new Error('Invalid token subject')
  }

  return payload.sub
}

export function hashRefreshTokenId(refreshTokenId: string) {
  return createHash('sha256').update(refreshTokenId).digest('hex')
}

export async function createTokenPair(userId: string, config: AuthConfig) {
  const issuedAt = nowInSeconds()
  const accessExpiresAt = issuedAt + config.accessExpiresInSeconds
  const refreshExpiresAt = issuedAt + config.refreshExpiresInSeconds
  const refreshTokenId = randomUUID()
  const refreshTokenHash = hashRefreshTokenId(refreshTokenId)
  const accessToken = await sign(
    {
      sub: userId,
      type: 'access',
      iat: issuedAt,
      exp: accessExpiresAt,
    },
    config.accessSecret,
    'HS256',
  )
  const refreshToken = await sign(
    {
      sub: userId,
      type: 'refresh',
      jti: refreshTokenId,
      iat: issuedAt,
      exp: refreshExpiresAt,
    },
    config.refreshSecret,
    'HS256',
  )

  return {
    accessToken,
    refreshToken,
    refreshTokenId,
    refreshTokenHash,
    refreshExpiresAt: new Date(refreshExpiresAt * 1000),
    accessExpiresIn: config.accessExpiresInSeconds,
  }
}

export async function verifyAccessToken(token: string, config: AuthConfig) {
  const payload = (await verify(token, config.accessSecret, 'HS256')) as JwtPayload
  const userId = assertSubject(payload)

  if (payload.type !== 'access') {
    throw new Error('Invalid access token')
  }

  return { userId }
}

export async function verifyRefreshToken(token: string, config: AuthConfig) {
  const payload = (await verify(token, config.refreshSecret, 'HS256')) as JwtPayload
  const userId = assertSubject(payload)

  if (payload.type !== 'refresh' || typeof payload.jti !== 'string') {
    throw new Error('Invalid refresh token')
  }

  return {
    userId,
    refreshTokenId: payload.jti,
    refreshTokenHash: hashRefreshTokenId(payload.jti),
  }
}
```

- [ ] **Step 8: Implement cookie helpers**

Create `apps/server/src/modules/auth/cookies.ts`:

```ts
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Context } from 'hono'
import type { AuthConfig } from './config'

export const refreshTokenCookieName = 'refresh_token'

export function getRefreshTokenCookie(c: Context) {
  return getCookie(c, refreshTokenCookieName)
}

export function setRefreshTokenCookie(c: Context, refreshToken: string, config: AuthConfig) {
  setCookie(c, refreshTokenCookieName, refreshToken, {
    httpOnly: true,
    maxAge: config.refreshExpiresInSeconds,
    path: '/api/auth',
    sameSite: 'lax',
    secure: config.secureCookies,
  })
}

export function clearRefreshTokenCookie(c: Context) {
  deleteCookie(c, refreshTokenCookieName, {
    path: '/api/auth',
  })
}
```

- [ ] **Step 9: Run helper tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/server test -- src/modules/auth/config.test.ts src/modules/auth/password.test.ts src/modules/auth/tokens.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit Task 3**

```bash
git add apps/server/src/modules/auth/config.ts apps/server/src/modules/auth/password.ts apps/server/src/modules/auth/tokens.ts apps/server/src/modules/auth/cookies.ts apps/server/src/modules/auth/errors.ts apps/server/src/modules/auth/config.test.ts apps/server/src/modules/auth/password.test.ts apps/server/src/modules/auth/tokens.test.ts
git commit -m "feat: add auth token helpers"
```

---

### Task 4: Register And Login APIs

**Files:**

- Create: `apps/server/src/modules/auth/repository.ts`
- Create: `apps/server/src/modules/auth/service.ts`
- Create: `apps/server/src/modules/auth/routes.ts`
- Create: `apps/server/src/modules/auth/routes.test.ts`
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: Write failing register and login route tests**

Create `apps/server/src/modules/auth/routes.test.ts` with the first auth behaviors:

```ts
import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { USER_STATUS_DISABLED, type AuthTokenResponse } from '@rev30/shared'
import { authPasswordCredentials, users } from '../../db/schema'
import { createTestDb } from '../../test/db'
import { verifyPassword } from './password'
import { createAuthRoutes } from './routes'

type ErrorResponse = {
  message: string
  field?: string
}

function createTestApp(database: Awaited<ReturnType<typeof createTestDb>>) {
  return new Hono().route('/api/auth', createAuthRoutes(database))
}

async function register(app: Hono, body = {}) {
  const response = await app.request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: 'ada',
      password: 'secret-password',
      nickname: 'Ada Lovelace',
      ...body,
    }),
    headers: {
      'content-type': 'application/json',
    },
  })

  return {
    body: (await response.json()) as AuthTokenResponse,
    response,
  }
}

async function login(app: Hono, body = {}) {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      username: 'ada',
      password: 'secret-password',
      ...body,
    }),
    headers: {
      'content-type': 'application/json',
    },
  })

  return {
    body:
      response.status === 200
        ? ((await response.json()) as AuthTokenResponse)
        : ((await response.json()) as ErrorResponse),
    response,
  }
}

describe('auth routes', () => {
  it('registers users with a password credential, token response, and refresh cookie', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    const { body, response } = await register(app, {
      email: 'ada@example.com',
      phone: '10000000001',
    })

    expect(response.status).toBe(201)
    expect(response.headers.get('set-cookie')).toContain('refresh_token=')
    expect(body).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        username: 'ada',
        nickname: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '10000000001',
      },
    })
    expect(body.accessToken).toEqual(expect.any(String))
    expect(body.refreshToken).toEqual(expect.any(String))

    const storedUsers = await database.select().from(users).where(eq(users.id, body.user.id))
    expect(storedUsers).toHaveLength(1)
    const storedCredentials = await database
      .select()
      .from(authPasswordCredentials)
      .where(eq(authPasswordCredentials.userId, body.user.id))

    expect(storedCredentials).toHaveLength(1)
    expect(storedCredentials[0]?.passwordHash).not.toBe('secret-password')
    await expect(
      verifyPassword('secret-password', storedCredentials[0]?.passwordHash ?? ''),
    ).resolves.toBe(true)
  })

  it('returns conflict when registering duplicate usernames', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    await register(app)
    const duplicate = await register(app, {
      nickname: 'Duplicate Ada',
    })

    expect(duplicate.response.status).toBe(409)
    expect(duplicate.body).toMatchObject({
      field: 'username',
      message: 'username already exists',
    })
  })

  it('logs in with username and password', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    await register(app)
    const { body, response } = await login(app)

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('refresh_token=')
    expect(body).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        username: 'ada',
      },
    })
  })

  it('returns a uniform credentials error for wrong passwords and disabled users', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)

    const registered = await register(app)
    const wrongPassword = await login(app, {
      password: 'wrong-password',
    })

    expect(wrongPassword.response.status).toBe(401)
    expect(wrongPassword.body).toEqual({
      message: 'Invalid username or password',
    })

    await database
      .update(users)
      .set({
        status: USER_STATUS_DISABLED,
      })
      .where(eq(users.id, registered.body.user.id))

    const disabled = await login(app)

    expect(disabled.response.status).toBe(401)
    expect(disabled.body).toEqual({
      message: 'Invalid username or password',
    })
  })
})
```

- [ ] **Step 2: Run auth route tests and verify they fail**

Run:

```bash
pnpm --filter @rev30/server test -- src/modules/auth/routes.test.ts
```

Expected: FAIL because `createAuthRoutes` does not exist.

- [ ] **Step 3: Implement auth repository**

Create `apps/server/src/modules/auth/repository.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { USER_STATUS_ENABLED, type AuthRegisterInput } from '@rev30/shared'
import { and, eq, gt, isNull } from 'drizzle-orm'
import type { Db } from '../../db'
import { authPasswordCredentials, authRefreshTokens, users } from '../../db/schema'

export function createAuthRepository(database: Db) {
  return {
    async createUser(input: AuthRegisterInput, passwordHash: string) {
      const now = new Date()

      return await database.transaction(async (tx) => {
        const [created] = await tx
          .insert(users)
          .values({
            id: randomUUID(),
            username: input.username,
            nickname: input.nickname,
            email: input.email,
            phone: input.phone,
            status: USER_STATUS_ENABLED,
            createdAt: now,
            updatedAt: now,
          })
          .returning()

        if (!created) {
          throw new Error('Failed to create user')
        }

        await tx.insert(authPasswordCredentials).values({
          userId: created.id,
          passwordHash,
          createdAt: now,
          updatedAt: now,
        })

        return created
      })
    },

    async findActiveUserCredentialByUsername(username: string) {
      const rows = await database
        .select({
          user: users,
          credential: authPasswordCredentials,
        })
        .from(users)
        .innerJoin(authPasswordCredentials, eq(authPasswordCredentials.userId, users.id))
        .where(and(eq(users.username, username), isNull(users.deletedAt)))
        .limit(1)

      return rows[0]
    },

    async findActiveUserById(id: string) {
      const rows = await database
        .select()
        .from(users)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .limit(1)

      return rows[0]
    },

    async createRefreshSession(input: {
      userId: string
      tokenHash: string
      expiresAt: Date
    }) {
      const now = new Date()
      const [created] = await database
        .insert(authRefreshTokens)
        .values({
          id: randomUUID(),
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          createdAt: now,
          updatedAt: now,
        })
        .returning()

      if (!created) {
        throw new Error('Failed to create refresh session')
      }

      return created
    },

    async consumeRefreshSession(tokenHash: string) {
      const now = new Date()
      const [session] = await database
        .update(authRefreshTokens)
        .set({
          revokedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(authRefreshTokens.tokenHash, tokenHash),
            isNull(authRefreshTokens.revokedAt),
            gt(authRefreshTokens.expiresAt, now),
          ),
        )
        .returning()

      return session
    },

    async revokeRefreshSession(tokenHash: string) {
      const now = new Date()
      const [session] = await database
        .update(authRefreshTokens)
        .set({
          revokedAt: now,
          updatedAt: now,
        })
        .where(and(eq(authRefreshTokens.tokenHash, tokenHash), isNull(authRefreshTokens.revokedAt)))
        .returning()

      return session
    },
  }
}
```

- [ ] **Step 4: Implement auth service for register and login**

Create `apps/server/src/modules/auth/service.ts`:

```ts
import {
  USER_STATUS_ENABLED,
  type AuthLoginInput,
  type AuthRegisterInput,
  type AuthTokenResponse,
} from '@rev30/shared'
import type { Db } from '../../db'
import { toUserConflictError } from '../system/users/errors'
import { toUser } from '../system/users/mapper'
import type { AuthConfig } from './config'
import { AuthInvalidCredentialsError } from './errors'
import { hashPassword, verifyPassword } from './password'
import { createAuthRepository } from './repository'
import { createTokenPair } from './tokens'

async function withUserUniqueConflict<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    const uniqueConflict = toUserConflictError(error)

    if (uniqueConflict) {
      throw uniqueConflict
    }

    throw error
  }
}

export function createAuthService(database: Db, config: AuthConfig) {
  const repository = createAuthRepository(database)

  async function createTokenResponse(userId: string): Promise<Omit<AuthTokenResponse, 'user'>> {
    const tokenPair = await createTokenPair(userId, config)

    await repository.createRefreshSession({
      userId,
      tokenHash: tokenPair.refreshTokenHash,
      expiresAt: tokenPair.refreshExpiresAt,
    })

    return {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      tokenType: 'Bearer',
      expiresIn: tokenPair.accessExpiresIn,
    }
  }

  return {
    async register(input: AuthRegisterInput): Promise<AuthTokenResponse> {
      const passwordHash = await hashPassword(input.password)
      const created = await withUserUniqueConflict(() => repository.createUser(input, passwordHash))
      const tokens = await createTokenResponse(created.id)

      return {
        user: toUser(created),
        ...tokens,
      }
    },

    async login(input: AuthLoginInput): Promise<AuthTokenResponse> {
      const account = await repository.findActiveUserCredentialByUsername(input.username)

      if (
        !account ||
        account.user.status !== USER_STATUS_ENABLED ||
        !(await verifyPassword(input.password, account.credential.passwordHash))
      ) {
        throw new AuthInvalidCredentialsError()
      }

      const tokens = await createTokenResponse(account.user.id)

      return {
        user: toUser(account.user),
        ...tokens,
      }
    },
  }
}
```

- [ ] **Step 5: Implement auth routes**

Create `apps/server/src/modules/auth/routes.ts`:

```ts
import {
  type AuthLoginInput,
  type AuthRegisterInput,
  authLoginSchema,
  authRegisterSchema,
} from '@rev30/shared'
import { zValidator } from '@hono/zod-validator'
import { Hono, type Context } from 'hono'
import type { Db } from '../../db'
import { UserConflictError } from '../system/users/errors'
import { setRefreshTokenCookie } from './cookies'
import { readAuthConfig } from './config'
import { AuthInvalidCredentialsError } from './errors'
import { createAuthService } from './service'

const registerBodyValidator = zValidator('json', authRegisterSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: 'Invalid body' }, 400)
  }
})

const loginBodyValidator = zValidator('json', authLoginSchema, (result, c) => {
  if (!result.success) {
    return c.json({ message: 'Invalid body' }, 400)
  }
})

function authErrorResponse(error: unknown, c: Context) {
  if (error instanceof UserConflictError) {
    return c.json(
      {
        field: error.field,
        message: error.message,
      },
      409,
    )
  }

  if (error instanceof AuthInvalidCredentialsError) {
    return c.json({ message: error.message }, 401)
  }

  throw error
}

export function createAuthRoutes(database: Db) {
  const config = readAuthConfig()
  const service = createAuthService(database, config)
  const app = new Hono()

  app.onError((error, c) => authErrorResponse(error, c))

  return app
    .post('/register', registerBodyValidator, async (c) => {
      const body: AuthRegisterInput = c.req.valid('json')
      const result = await service.register(body)

      setRefreshTokenCookie(c, result.refreshToken, config)

      return c.json(result, 201)
    })
    .post('/login', loginBodyValidator, async (c) => {
      const body: AuthLoginInput = c.req.valid('json')
      const result = await service.login(body)

      setRefreshTokenCookie(c, result.refreshToken, config)

      return c.json(result)
    })
}
```

- [ ] **Step 6: Mount auth routes in the app**

Modify `apps/server/src/app.ts`:

```ts
import { Hono } from 'hono'
import type { Db } from './db'
import { healthRoutes } from './modules/health/routes'
import { createAuthRoutes } from './modules/auth/routes'
import { createSystemRoutes } from './modules/system/routes'

export function createApiRoutes(database: Db) {
  return new Hono()
    .route('/', healthRoutes)
    .route('/auth', createAuthRoutes(database))
    .route('/system', createSystemRoutes(database))
}

export function createApp(database: Db) {
  return new Hono().route('/api', createApiRoutes(database))
}

export type AppType = ReturnType<typeof createApiRoutes>
```

- [ ] **Step 7: Run register/login tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/server test -- src/modules/auth/routes.test.ts
```

Expected: PASS for the register and login tests written in this task.

- [ ] **Step 8: Commit Task 4**

```bash
git add apps/server/src/modules/auth/repository.ts apps/server/src/modules/auth/service.ts apps/server/src/modules/auth/routes.ts apps/server/src/modules/auth/routes.test.ts apps/server/src/app.ts
git commit -m "feat: add auth register and login"
```

---

### Task 5: Refresh And Logout APIs

**Files:**

- Modify: `apps/server/src/modules/auth/routes.test.ts`
- Modify: `apps/server/src/modules/auth/service.ts`
- Modify: `apps/server/src/modules/auth/routes.ts`

- [ ] **Step 1: Add failing refresh and logout tests**

Append these tests inside `describe('auth routes', () => { ... })` in `apps/server/src/modules/auth/routes.test.ts`:

```ts
  it('rotates refresh tokens and rejects reuse of the old refresh token', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const registered = await register(app)

    const refreshResponse = await app.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({
        refreshToken: registered.body.refreshToken,
      }),
      headers: {
        'content-type': 'application/json',
      },
    })
    const refreshBody = (await refreshResponse.json()) as AuthTokenResponse

    expect(refreshResponse.status).toBe(200)
    expect(refreshResponse.headers.get('set-cookie')).toContain('refresh_token=')
    expect(refreshBody.refreshToken).not.toBe(registered.body.refreshToken)

    const reuseResponse = await app.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({
        refreshToken: registered.body.refreshToken,
      }),
      headers: {
        'content-type': 'application/json',
      },
    })
    const reuseBody = (await reuseResponse.json()) as ErrorResponse

    expect(reuseResponse.status).toBe(401)
    expect(reuseBody).toEqual({
      message: 'Invalid refresh token',
    })
  })

  it('refreshes from the refresh cookie when no body token is provided', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const registered = await register(app)

    const refreshResponse = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: {
        cookie: `refresh_token=${registered.body.refreshToken}`,
      },
    })
    const refreshBody = (await refreshResponse.json()) as AuthTokenResponse

    expect(refreshResponse.status).toBe(200)
    expect(refreshBody.user.id).toBe(registered.body.user.id)
    expect(refreshBody.refreshToken).not.toBe(registered.body.refreshToken)
  })

  it('logs out by revoking refresh tokens and clearing the cookie', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const registered = await register(app)

    const logoutResponse = await app.request('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({
        refreshToken: registered.body.refreshToken,
      }),
      headers: {
        'content-type': 'application/json',
      },
    })

    expect(logoutResponse.status).toBe(204)
    expect(logoutResponse.headers.get('set-cookie')).toContain('refresh_token=')
    expect(logoutResponse.headers.get('set-cookie')).toContain('Max-Age=0')

    const refreshResponse = await app.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({
        refreshToken: registered.body.refreshToken,
      }),
      headers: {
        'content-type': 'application/json',
      },
    })

    expect(refreshResponse.status).toBe(401)

    const secondLogoutResponse = await app.request('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({
        refreshToken: registered.body.refreshToken,
      }),
      headers: {
        'content-type': 'application/json',
      },
    })

    expect(secondLogoutResponse.status).toBe(204)
  })
```

- [ ] **Step 2: Run auth route tests and verify new tests fail**

Run:

```bash
pnpm --filter @rev30/server test -- src/modules/auth/routes.test.ts
```

Expected: FAIL in refresh/logout behavior if Task 4 only implemented register/login.

- [ ] **Step 3: Implement refresh/logout behavior**

Modify `apps/server/src/modules/auth/service.ts` imports:

```ts
import {
  AuthInvalidCredentialsError,
  AuthInvalidRefreshTokenError,
} from './errors'
import { createTokenPair, verifyRefreshToken } from './tokens'
```

Add these methods inside the object returned by `createAuthService`, immediately after `login()`:

```ts
    async refresh(refreshToken: string | undefined): Promise<AuthTokenResponse> {
      if (!refreshToken) {
        throw new AuthInvalidRefreshTokenError()
      }

      let verified: Awaited<ReturnType<typeof verifyRefreshToken>>

      try {
        verified = await verifyRefreshToken(refreshToken, config)
      } catch {
        throw new AuthInvalidRefreshTokenError()
      }

      const consumed = await repository.consumeRefreshSession(verified.refreshTokenHash)

      if (!consumed) {
        throw new AuthInvalidRefreshTokenError()
      }

      const user = await repository.findActiveUserById(verified.userId)

      if (!user || user.status !== USER_STATUS_ENABLED) {
        throw new AuthInvalidRefreshTokenError()
      }

      const tokens = await createTokenResponse(user.id)

      return {
        user: toUser(user),
        ...tokens,
      }
    },

    async logout(refreshToken: string | undefined) {
      if (!refreshToken) {
        return
      }

      try {
        const verified = await verifyRefreshToken(refreshToken, config)

        await repository.revokeRefreshSession(verified.refreshTokenHash)
      } catch {
        return
      }
    },
```

Modify `apps/server/src/modules/auth/routes.ts` imports:

```ts
import {
  type AuthLoginInput,
  type AuthRefreshInput,
  type AuthRegisterInput,
  authLoginSchema,
  authLogoutSchema,
  authRefreshSchema,
  authRegisterSchema,
} from '@rev30/shared'
import {
  clearRefreshTokenCookie,
  getRefreshTokenCookie,
  setRefreshTokenCookie,
} from './cookies'
import {
  AuthInvalidCredentialsError,
  AuthInvalidRefreshTokenError,
} from './errors'
```

Add these helpers above `authErrorResponse()`:

```ts
async function readOptionalJson(c: Context) {
  const text = await c.req.text()

  if (!text.trim()) {
    return {}
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    return {}
  }
}

async function readRefreshBody(c: Context): Promise<AuthRefreshInput> {
  const result = authRefreshSchema.safeParse(await readOptionalJson(c))

  if (!result.success) {
    throw new AuthInvalidRefreshTokenError()
  }

  return result.data
}

async function readLogoutBody(c: Context): Promise<AuthRefreshInput> {
  const result = authLogoutSchema.safeParse(await readOptionalJson(c))

  if (!result.success) {
    return {}
  }

  return result.data
}
```

Add this branch to `authErrorResponse()` after the credentials branch:

```ts
  if (error instanceof AuthInvalidRefreshTokenError) {
    return c.json({ message: error.message }, 401)
  }
```

Add these routes after `/login`:

```ts
    .post('/refresh', async (c) => {
      const body = await readRefreshBody(c)
      const result = await service.refresh(body.refreshToken ?? getRefreshTokenCookie(c))

      setRefreshTokenCookie(c, result.refreshToken, config)

      return c.json(result)
    })
    .post('/logout', async (c) => {
      const body = await readLogoutBody(c)

      await service.logout(body.refreshToken ?? getRefreshTokenCookie(c))
      clearRefreshTokenCookie(c)

      return c.body(null, 204)
    })
```

- [ ] **Step 4: Run auth route tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/server test -- src/modules/auth/routes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add apps/server/src/modules/auth/routes.test.ts apps/server/src/modules/auth/service.ts apps/server/src/modules/auth/routes.ts
git commit -m "feat: rotate auth refresh tokens"
```

---

### Task 6: Current User API

**Files:**

- Modify: `apps/server/src/modules/auth/routes.test.ts`
- Modify: `apps/server/src/modules/auth/service.ts`
- Modify: `apps/server/src/modules/auth/routes.ts`

- [ ] **Step 1: Add failing me endpoint tests**

Append these tests inside `describe('auth routes', () => { ... })` in `apps/server/src/modules/auth/routes.test.ts`:

```ts
  it('returns the current user for a valid access token', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const registered = await register(app)

    const response = await app.request('/api/auth/me', {
      headers: {
        authorization: `Bearer ${registered.body.accessToken}`,
      },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      id: registered.body.user.id,
      username: 'ada',
      nickname: 'Ada Lovelace',
    })
  })

  it('rejects missing, refresh, and disabled-user tokens for current user', async () => {
    const database = await createTestDb()
    const app = createTestApp(database)
    const registered = await register(app)

    const missingResponse = await app.request('/api/auth/me')
    expect(missingResponse.status).toBe(401)
    expect(await missingResponse.json()).toEqual({
      message: 'Unauthorized',
    })

    const refreshTokenResponse = await app.request('/api/auth/me', {
      headers: {
        authorization: `Bearer ${registered.body.refreshToken}`,
      },
    })
    expect(refreshTokenResponse.status).toBe(401)

    await database
      .update(users)
      .set({
        status: USER_STATUS_DISABLED,
      })
      .where(eq(users.id, registered.body.user.id))

    const disabledResponse = await app.request('/api/auth/me', {
      headers: {
        authorization: `Bearer ${registered.body.accessToken}`,
      },
    })

    expect(disabledResponse.status).toBe(401)
    expect(await disabledResponse.json()).toEqual({
      message: 'Unauthorized',
    })
  })
```

- [ ] **Step 2: Run auth route tests and verify new tests fail**

Run:

```bash
pnpm --filter @rev30/server test -- src/modules/auth/routes.test.ts
```

Expected: FAIL if `/me` is not implemented.

- [ ] **Step 3: Implement current user behavior**

Modify `apps/server/src/modules/auth/service.ts` imports:

```ts
import {
  AuthInvalidCredentialsError,
  AuthInvalidRefreshTokenError,
  AuthUnauthorizedError,
} from './errors'
import { createTokenPair, verifyAccessToken, verifyRefreshToken } from './tokens'
```

Add this method inside the object returned by `createAuthService`, immediately after `logout()`:

```ts
    async me(accessToken: string | undefined) {
      if (!accessToken) {
        throw new AuthUnauthorizedError()
      }

      let verified: Awaited<ReturnType<typeof verifyAccessToken>>

      try {
        verified = await verifyAccessToken(accessToken, config)
      } catch {
        throw new AuthUnauthorizedError()
      }

      const user = await repository.findActiveUserById(verified.userId)

      if (!user || user.status !== USER_STATUS_ENABLED) {
        throw new AuthUnauthorizedError()
      }

      return toUser(user)
    },
```

Modify `apps/server/src/modules/auth/routes.ts` imports:

```ts
import {
  AuthInvalidCredentialsError,
  AuthInvalidRefreshTokenError,
  AuthUnauthorizedError,
} from './errors'
```

Add this helper above `authErrorResponse()`:

```ts
function bearerToken(c: Context) {
  const authorization = c.req.header('authorization')
  const [scheme, token] = authorization?.split(' ') ?? []

  if (scheme !== 'Bearer' || !token) {
    return undefined
  }

  return token
}
```

Add this branch to `authErrorResponse()` after the refresh branch:

```ts
  if (error instanceof AuthUnauthorizedError) {
    return c.json({ message: error.message }, 401)
  }
```

Add this route after `/logout`:

```ts
    .get('/me', async (c) => c.json(await service.me(bearerToken(c))))
```

- [ ] **Step 4: Run auth route tests and verify they pass**

Run:

```bash
pnpm --filter @rev30/server test -- src/modules/auth/routes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add apps/server/src/modules/auth/routes.test.ts apps/server/src/modules/auth/service.ts apps/server/src/modules/auth/routes.ts
git commit -m "feat: add current auth user endpoint"
```

---

### Task 7: App Config Documentation And Route Integration

**Files:**

- Modify: `apps/server/.env.example`
- Modify: `apps/server/src/app.ts`
- Test: `apps/server/src/modules/auth/routes.test.ts`
- Test: `apps/server/src/modules/health/routes.test.ts`

- [ ] **Step 1: Add JWT env vars to server example env**

Modify `apps/server/.env.example`:

```dotenv
PORT=3000
PGLITE_DATA_DIR=.pglite/dev
JWT_ACCESS_SECRET=change-me-access-secret
JWT_REFRESH_SECRET=change-me-refresh-secret
JWT_ACCESS_EXPIRES_IN_SECONDS=900
JWT_REFRESH_EXPIRES_IN_SECONDS=604800
# DATABASE_URL=postgres://postgres:postgres@localhost:5432/rev30
```

- [ ] **Step 2: Verify auth route is mounted in app**

Ensure `apps/server/src/app.ts` matches the Task 4 Step 6 snippet and exports `AppType` from the real `/api` route tree.

- [ ] **Step 3: Run focused server route tests**

Run:

```bash
pnpm --filter @rev30/server test -- src/modules/auth/routes.test.ts src/modules/health/routes.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit Task 7**

```bash
git add apps/server/.env.example apps/server/src/app.ts
git commit -m "chore: document auth env vars"
```

---

### Task 8: Full Verification

**Files:**

- Check all files changed by Tasks 1-7.

- [ ] **Step 1: Run shared tests**

Run:

```bash
pnpm --filter @rev30/shared test
```

Expected: PASS.

- [ ] **Step 2: Run server tests**

Run:

```bash
pnpm --filter @rev30/server test
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Run full project check**

Run:

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 5: Inspect final diff**

Run:

```bash
git status --short
git diff --stat HEAD
```

Expected: only auth backend implementation, schema/migration, shared auth schemas, env example, and focused tests are changed.
