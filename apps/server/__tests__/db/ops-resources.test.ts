import { assert, describe, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_DIRECTORY,
  ROLE_STATUS_ENABLED,
} from '@rev30/contracts'
import { systemResources, systemRoleResources, systemRoles } from '../../src/db/schema'
import { dbTest } from '../fixtures/database'

const opsResourceId = '10000000-0000-4000-8000-000000000300'

describe('ops resource seeds', () => {
  dbTest('seeds the ops navigation metadata without role bindings', async ({ db: database }) => {
    const [opsResource] = await database
      .select()
      .from(systemResources)
      .where(eq(systemResources.id, opsResourceId))

    assert(opsResource, 'Expected seeded ops resource')

    const childResources = await database
      .select()
      .from(systemResources)
      .where(eq(systemResources.parentId, opsResourceId))
    const roleResourceBindings = await database
      .select()
      .from(systemRoleResources)
      .where(eq(systemRoleResources.resourceId, opsResourceId))
    const [adminRole] = await database
      .select()
      .from(systemRoles)
      .where(eq(systemRoles.code, 'admin'))

    assert(adminRole, 'Expected seeded admin role')

    expect(opsResource).toMatchObject({
      id: opsResourceId,
      parentId: null,
      type: RESOURCE_TYPE_DIRECTORY,
      name: '运维管理',
      code: 'ops',
      path: null,
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
      icon: 'lucide:activity',
      hidden: false,
      status: RESOURCE_STATUS_ENABLED,
      sortOrder: 300,
      deletedAt: null,
    })
    expect(opsResource.createdAt).toBeInstanceOf(Date)
    expect(opsResource.updatedAt).toBeInstanceOf(Date)
    expect(childResources.map((resource) => resource.code).sort()).toEqual([
      'ops:login-log',
      'ops:online-session',
      'ops:operation-log',
      'ops:scheduled-job',
      'ops:system-health',
    ])
    expect(roleResourceBindings).toEqual([])
    expect(adminRole.status).toBe(ROLE_STATUS_ENABLED)
  })
})
