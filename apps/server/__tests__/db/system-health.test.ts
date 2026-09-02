import { asc, inArray } from 'drizzle-orm'
import { describe, expect } from 'vitest'
import { systemResources, systemRoleResources } from '../../src/db/schema'
import { dbTest } from '../fixtures/database'

const resourceIds = ['10000000-0000-4000-8000-000000000327', '10000000-0000-4000-8000-000000000328']

describe('system health resource migration', () => {
  dbTest(
    'adds the enabled menu and list action without granting any role access',
    async ({ db }) => {
      const resources = await db
        .select({
          id: systemResources.id,
          parentId: systemResources.parentId,
          type: systemResources.type,
          name: systemResources.name,
          code: systemResources.code,
          path: systemResources.path,
          icon: systemResources.icon,
          sortOrder: systemResources.sortOrder,
          status: systemResources.status,
        })
        .from(systemResources)
        .where(inArray(systemResources.id, resourceIds))
        .orderBy(asc(systemResources.id))
      expect(resources).toEqual([
        {
          id: resourceIds[0],
          parentId: '10000000-0000-4000-8000-000000000300',
          type: 'menu',
          name: '系统健康',
          code: 'ops:system-health',
          path: '/ops/system-health',
          icon: 'lucide:heart-pulse',
          sortOrder: 50,
          status: 1,
        },
        {
          id: resourceIds[1],
          parentId: resourceIds[0],
          type: 'action',
          name: '查看系统健康',
          code: 'ops:system-health:list',
          path: null,
          icon: null,
          sortOrder: 10,
          status: 1,
        },
      ])
      expect(
        await db
          .select()
          .from(systemRoleResources)
          .where(inArray(systemRoleResources.resourceId, resourceIds)),
      ).toEqual([])
    },
  )
})
