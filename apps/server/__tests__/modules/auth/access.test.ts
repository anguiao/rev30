import { randomUUID } from 'node:crypto'
import { describe, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_STATUS_DISABLED,
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_EXTERNAL,
  RESOURCE_TYPE_MENU,
  ROLE_STATUS_DISABLED,
  ROLE_STATUS_ENABLED,
} from '@rev30/contracts'
import {
  systemRoleResources,
  systemRoles,
  systemResources,
  systemUserRoles,
} from '../../../src/db/schema'
import { dbTest, type TestDatabase } from '../../fixtures/database'
import {
  createSystemResourceFixture as createResource,
  createSystemRoleFixture,
  createSystemUserFixture,
} from '../../helpers/system'
import { createUserAccessService } from '../../../src/modules/auth/access'

const now = new Date('2026-05-06T00:00:00.000Z')
const opsResourceId = '10000000-0000-4000-8000-000000000300'

async function createRole(database: TestDatabase, code: string) {
  return createSystemRoleFixture(database, { name: code, code })
}

describe('user access service', () => {
  dbTest(
    'grants the seeded enabled ops resources to administrators without role bindings',
    async ({ db: database }) => {
      const [opsResource] = await database
        .select()
        .from(systemResources)
        .where(eq(systemResources.id, opsResourceId))

      if (!opsResource) {
        throw new Error('Expected seeded ops resource')
      }

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

      if (!adminRole) {
        throw new Error('Expected seeded admin role')
      }

      const user = await createSystemUserFixture(database, { username: 'ops-admin' })

      await database.insert(systemUserRoles).values({
        userId: user.id,
        roleId: adminRole.id,
        createdAt: now,
      })

      const access = await createUserAccessService(database).resolveUserAccess(user.id)

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
      ])
      expect(roleResourceBindings).toEqual([])
      expect(adminRole.status).toBe(ROLE_STATUS_ENABLED)
      expect(access.isAdmin).toBe(true)
      expect(access.accessCodes).toEqual(
        expect.arrayContaining([
          'ops',
          'ops:login-log',
          'ops:login-log:list',
          'ops:online-session',
          'ops:online-session:list',
          'ops:online-session:revoke',
          'ops:operation-log',
          'ops:operation-log:list',
        ]),
      )
      expect(access.menus.some((node) => node.code === 'ops')).toBe(true)
    },
  )

  dbTest(
    'collects access codes and menus from enabled roles and resources',
    async ({ db: database }) => {
      const user = await createSystemUserFixture(database, { username: 'ada' })
      const operatorRole = await createRole(database, 'operator')
      const auditRole = await createRole(database, 'auditor')
      const prefix = randomUUID()

      const system = await createResource(database, {
        code: `${prefix}-system`,
        name: 'System',
        type: RESOURCE_TYPE_DIRECTORY,
        parentId: null,
        path: null,
        externalUrl: null,
        openTarget: 'self',
        icon: 'lucide:settings',
        hidden: false,
        status: RESOURCE_STATUS_ENABLED,
        sortOrder: 0,
      })

      const userMenu = await createResource(database, {
        code: `${prefix}-system:user`,
        name: 'Users',
        type: RESOURCE_TYPE_MENU,
        parentId: system.id,
        path: '/system/users',
        externalUrl: null,
        openTarget: 'self',
        icon: 'lucide:users',
        hidden: false,
        status: RESOURCE_STATUS_ENABLED,
        sortOrder: 10,
      })

      const userListAction = await createResource(database, {
        code: `${prefix}-system:user:list`,
        name: 'View Users',
        type: RESOURCE_TYPE_ACTION,
        parentId: userMenu.id,
        path: null,
        externalUrl: null,
        openTarget: 'self',
        icon: null,
        hidden: false,
        status: RESOURCE_STATUS_ENABLED,
        sortOrder: 20,
      })

      await database.insert(systemUserRoles).values({
        userId: user.id,
        roleId: operatorRole.id,
        createdAt: now,
      })

      await database.insert(systemUserRoles).values({
        userId: user.id,
        roleId: auditRole.id,
        createdAt: now,
      })

      await database.insert(systemRoleResources).values([
        { roleId: operatorRole.id, resourceId: system.id, createdAt: now },
        { roleId: operatorRole.id, resourceId: userMenu.id, createdAt: now },
        { roleId: operatorRole.id, resourceId: userListAction.id, createdAt: now },
        { roleId: auditRole.id, resourceId: userListAction.id, createdAt: now },
      ])

      const access = await createUserAccessService(database).resolveUserAccess(user.id)

      expect(access.isAdmin).toBe(false)
      expect(access.accessCodes).toEqual([
        `${prefix}-system`,
        `${prefix}-system:user`,
        `${prefix}-system:user:list`,
      ])
      expect(access.menus).toHaveLength(1)
      expect(access.menus[0]?.code).toBe(`${prefix}-system`)
      expect(access.menus[0]?.children).toHaveLength(1)
      expect(access.menus[0]?.children[0]).toMatchObject({
        code: `${prefix}-system:user`,
        path: '/system/users',
        icon: 'lucide:users',
        type: RESOURCE_TYPE_MENU,
        hidden: false,
      })
    },
  )

  dbTest('ignores disabled roles and disabled resources', async ({ db: database }) => {
    const user = await createSystemUserFixture(database, { username: 'disabled-access' })
    const role = await createRole(database, 'disabled-role')
    const prefix = randomUUID()
    const userList = await createResource(database, {
      code: `${prefix}-system:user:list`,
      name: 'List Users',
      type: RESOURCE_TYPE_ACTION,
      parentId: null,
      path: null,
      externalUrl: null,
      openTarget: 'self',
      icon: null,
      hidden: false,
      status: RESOURCE_STATUS_ENABLED,
      sortOrder: 0,
    })

    await database.insert(systemUserRoles).values({
      userId: user.id,
      roleId: role.id,
      createdAt: now,
    })
    await database.insert(systemRoleResources).values({
      roleId: role.id,
      resourceId: userList.id,
      createdAt: now,
    })
    await database
      .update(systemRoles)
      .set({ status: ROLE_STATUS_DISABLED })
      .where(eq(systemRoles.id, role.id))

    const disabledRoleAccess = await createUserAccessService(database).resolveUserAccess(user.id)
    expect(disabledRoleAccess.accessCodes).toEqual([])

    await database
      .update(systemRoles)
      .set({ status: RESOURCE_STATUS_ENABLED })
      .where(eq(systemRoles.id, role.id))
    await database
      .update(systemResources)
      .set({ status: RESOURCE_STATUS_DISABLED })
      .where(eq(systemResources.id, userList.id))

    const disabledResourceAccess = await createUserAccessService(database).resolveUserAccess(
      user.id,
    )
    expect(disabledResourceAccess.accessCodes).toEqual([])
  })

  dbTest(
    'grants all enabled resources to enabled admin roles without role resource bindings',
    async ({ db: database }) => {
      const user = await createSystemUserFixture(database, { username: 'root' })
      const prefix = randomUUID()
      const existingAdminRole = await database
        .select()
        .from(systemRoles)
        .where(eq(systemRoles.code, 'admin'))
        .then((rows) => rows[0])

      const adminRole = existingAdminRole ?? (await createRole(database, 'admin'))

      const system = await createResource(database, {
        code: `${prefix}-system`,
        name: 'System',
        type: RESOURCE_TYPE_DIRECTORY,
        parentId: null,
        path: null,
        externalUrl: null,
        openTarget: 'self',
        icon: 'lucide:settings',
        hidden: false,
        status: RESOURCE_STATUS_ENABLED,
        sortOrder: 0,
      })

      await createResource(database, {
        code: `${prefix}-system:role:list`,
        name: 'Role List',
        type: RESOURCE_TYPE_ACTION,
        parentId: system.id,
        path: null,
        externalUrl: null,
        openTarget: 'self',
        icon: null,
        hidden: false,
        status: RESOURCE_STATUS_ENABLED,
        sortOrder: 10,
      })

      await createResource(database, {
        code: `${prefix}-system:resource:delete`,
        name: 'Delete Resource',
        type: RESOURCE_TYPE_ACTION,
        parentId: system.id,
        path: null,
        externalUrl: null,
        openTarget: 'self',
        icon: null,
        hidden: false,
        status: RESOURCE_STATUS_ENABLED,
        sortOrder: 20,
      })

      await database.insert(systemUserRoles).values({
        userId: user.id,
        roleId: adminRole.id,
        createdAt: now,
      })

      const access = await createUserAccessService(database).resolveUserAccess(user.id)

      expect(access.isAdmin).toBe(true)
      expect(access.accessCodes).toContain(`${prefix}-system:role:list`)
      expect(access.accessCodes).toContain(`${prefix}-system:resource:delete`)
      expect(access.menus.some((node) => node.code === `${prefix}-system`)).toBe(true)
      expect(access.accessCodes).toContain('system')
      expect(access.accessCodes).toContain('system:user')
      const customSystemMenu = access.menus.find((node) => node.code === `${prefix}-system`)
      expect(customSystemMenu?.children).toEqual([])
    },
  )

  dbTest(
    'builds accessible non-action menus and does not auto-fill missing parent menus',
    async ({ db: database }) => {
      const user = await createSystemUserFixture(database, { username: 'menu-viewer' })
      const role = await createRole(database, 'menu')
      const prefix = randomUUID()

      const rootMenu = await createResource(database, {
        code: `${prefix}-system`,
        name: 'System',
        type: RESOURCE_TYPE_DIRECTORY,
        parentId: null,
        path: null,
        externalUrl: null,
        openTarget: 'self',
        icon: 'lucide:settings',
        hidden: false,
        status: RESOURCE_STATUS_ENABLED,
        sortOrder: 0,
      })

      const usersMenu = await createResource(database, {
        code: `${prefix}-system:user`,
        name: 'Users',
        type: RESOURCE_TYPE_MENU,
        parentId: rootMenu.id,
        path: '/system/users',
        externalUrl: null,
        openTarget: 'self',
        icon: 'lucide:users',
        hidden: false,
        status: RESOURCE_STATUS_ENABLED,
        sortOrder: 10,
      })

      const usersListAction = await createResource(database, {
        code: `${prefix}-system:user:list`,
        name: 'View Users',
        type: RESOURCE_TYPE_ACTION,
        parentId: usersMenu.id,
        path: null,
        externalUrl: null,
        openTarget: 'self',
        icon: null,
        hidden: false,
        status: RESOURCE_STATUS_ENABLED,
        sortOrder: 11,
      })

      const hiddenMenu = await createResource(database, {
        code: `${prefix}-system:hidden`,
        name: 'Hidden',
        type: RESOURCE_TYPE_MENU,
        parentId: rootMenu.id,
        path: '/system/hidden',
        externalUrl: null,
        openTarget: 'self',
        icon: 'lucide:eye-off',
        hidden: true,
        status: RESOURCE_STATUS_ENABLED,
        sortOrder: 20,
      })

      const externalMenu = await createResource(database, {
        code: `${prefix}-system:help`,
        name: 'Help',
        type: RESOURCE_TYPE_EXTERNAL,
        parentId: rootMenu.id,
        path: null,
        externalUrl: 'https://example.com/help',
        openTarget: 'blank',
        icon: 'lucide:help-circle',
        hidden: false,
        status: RESOURCE_STATUS_ENABLED,
        sortOrder: 30,
      })

      const orphanParent = await createResource(database, {
        code: `${prefix}-system:orphan`,
        name: 'Orphan Parent',
        type: RESOURCE_TYPE_DIRECTORY,
        parentId: null,
        path: null,
        externalUrl: null,
        openTarget: 'self',
        icon: 'lucide:alert-triangle',
        hidden: false,
        status: RESOURCE_STATUS_ENABLED,
        sortOrder: 40,
      })

      const orphanChild = await createResource(database, {
        code: `${prefix}-system:orphan:list`,
        name: 'Orphan Child',
        type: RESOURCE_TYPE_MENU,
        parentId: orphanParent.id,
        path: '/system/orphan',
        externalUrl: null,
        openTarget: 'self',
        icon: 'lucide:anchor',
        hidden: false,
        status: RESOURCE_STATUS_ENABLED,
        sortOrder: 41,
      })

      await database.insert(systemUserRoles).values({
        userId: user.id,
        roleId: role.id,
        createdAt: now,
      })

      await database.insert(systemRoleResources).values([
        { roleId: role.id, resourceId: rootMenu.id, createdAt: now },
        { roleId: role.id, resourceId: usersMenu.id, createdAt: now },
        { roleId: role.id, resourceId: usersListAction.id, createdAt: now },
        { roleId: role.id, resourceId: hiddenMenu.id, createdAt: now },
        { roleId: role.id, resourceId: externalMenu.id, createdAt: now },
        { roleId: role.id, resourceId: orphanChild.id, createdAt: now },
      ])

      const access = await createUserAccessService(database).resolveUserAccess(user.id)

      expect(access.isAdmin).toBe(false)
      expect(access.accessCodes).toEqual([
        `${prefix}-system`,
        `${prefix}-system:user`,
        `${prefix}-system:user:list`,
        `${prefix}-system:hidden`,
        `${prefix}-system:help`,
        `${prefix}-system:orphan:list`,
      ])
      expect(access.menus).toEqual([
        expect.objectContaining({
          code: `${prefix}-system`,
          type: RESOURCE_TYPE_DIRECTORY,
          children: [
            expect.objectContaining({
              code: `${prefix}-system:user`,
              type: RESOURCE_TYPE_MENU,
              children: [],
            }),
            expect.objectContaining({
              code: `${prefix}-system:hidden`,
              type: RESOURCE_TYPE_MENU,
              hidden: true,
              children: [],
            }),
            expect.objectContaining({
              code: `${prefix}-system:help`,
              type: RESOURCE_TYPE_EXTERNAL,
              children: [],
            }),
          ],
        }),
      ])
      const userMenuNode = access.menus[0]!.children.find(
        (node) => node.code === `${prefix}-system:user`,
      )
      expect(userMenuNode?.children).toHaveLength(0)
    },
  )
})
