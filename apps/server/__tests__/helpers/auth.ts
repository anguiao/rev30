import { randomUUID } from 'node:crypto'
import { ROLE_STATUS_ENABLED, USER_STATUS_ENABLED } from '@rev30/contracts'
import { Hono } from 'hono'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { Db } from '../../src/db'
import { createAuthMiddleware } from '../../src/middleware/auth'
import {
  systemRoles,
  systemRoleResources,
  systemResources,
  systemUserRoles,
  systemUsers,
} from '../../src/db/schema'
import { readAuthConfig } from '../../src/modules/auth/config'
import { createTokenPair } from '../../src/modules/auth/tokens'

const now = new Date('2026-05-06T00:00:00.000Z')

type SystemAccessFixtureOptions = {
  admin?: boolean
  accessCodes?: string[]
  usernamePrefix?: string
}

export type SystemAccessFixture = {
  accessToken: string
  authHeaders: Record<string, string>
  userId: string
}

function withDefaultHeaders(
  app: Hono<any, any, any>,
  defaultHeaders: Record<string, string> | undefined,
) {
  if (!defaultHeaders) {
    return app
  }

  const request = app.request.bind(app)

  app.request = ((input, init) => {
    const headers = new Headers(defaultHeaders)
    const requestHeaders = new Headers(init?.headers)

    requestHeaders.forEach((value, key) => {
      headers.set(key, value)
    })

    return request(input, {
      ...init,
      headers,
    })
  }) as typeof app.request

  return app
}

export function createProtectedSystemRouteTestApp(
  database: Db,
  routePath: string,
  routeApp: Hono<any, any, any>,
  defaultHeaders?: Record<string, string>,
) {
  const app = new Hono()
    .use('/api/system/*', createAuthMiddleware(database))
    .route(routePath, routeApp)

  return withDefaultHeaders(app, defaultHeaders)
}

export function createProtectedContentRouteTestApp(
  database: Db,
  routePath: string,
  routeApp: Hono<any, any, any>,
  defaultHeaders?: Record<string, string>,
) {
  const app = new Hono()
    .use('/api/content/*', createAuthMiddleware(database))
    .route(routePath, routeApp)

  return withDefaultHeaders(app, defaultHeaders)
}

export async function createSystemAccessFixture(
  database: Db,
  options: SystemAccessFixtureOptions = {},
): Promise<SystemAccessFixture> {
  const usernamePrefix = options.usernamePrefix ?? 'system-route-user'
  const accessCodes = [...new Set(options.accessCodes ?? [])]
  const [user] = await database
    .insert(systemUsers)
    .values({
      id: randomUUID(),
      username: `${usernamePrefix}-${randomUUID()}`,
      nickname: `${usernamePrefix} Nickname`,
      status: USER_STATUS_ENABLED,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  if (!user) {
    throw new Error('Expected user fixture')
  }

  if (options.admin) {
    const [adminRole] = await database
      .select({
        id: systemRoles.id,
      })
      .from(systemRoles)
      .where(
        and(
          eq(systemRoles.code, 'admin'),
          eq(systemRoles.status, ROLE_STATUS_ENABLED),
          isNull(systemRoles.deletedAt),
        ),
      )
      .limit(1)

    if (!adminRole) {
      throw new Error('Expected seeded admin role')
    }

    await database.insert(systemUserRoles).values({
      userId: user.id,
      roleId: adminRole.id,
      createdAt: now,
    })
  }

  if (accessCodes.length > 0) {
    const [role] = await database
      .insert(systemRoles)
      .values({
        id: randomUUID(),
        name: `${usernamePrefix} Role`,
        code: `${usernamePrefix}-${randomUUID()}`,
        status: ROLE_STATUS_ENABLED,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    if (!role) {
      throw new Error('Expected role fixture')
    }

    const resources = await database
      .select({
        id: systemResources.id,
        code: systemResources.code,
      })
      .from(systemResources)
      .where(and(inArray(systemResources.code, accessCodes), isNull(systemResources.deletedAt)))

    if (resources.length !== accessCodes.length) {
      const foundCodes = new Set(resources.map((resource) => resource.code))
      const missingCodes = accessCodes.filter((code) => !foundCodes.has(code))

      throw new Error(`Expected seeded resources for access codes: ${missingCodes.join(', ')}`)
    }

    await database.insert(systemUserRoles).values({
      userId: user.id,
      roleId: role.id,
      createdAt: now,
    })

    await database.insert(systemRoleResources).values(
      resources.map((resource) => ({
        roleId: role.id,
        resourceId: resource.id,
        createdAt: now,
      })),
    )
  }

  const { accessToken } = await createTokenPair(user.id, readAuthConfig())

  return {
    accessToken,
    authHeaders: {
      authorization: `Bearer ${accessToken}`,
    },
    userId: user.id,
  }
}
