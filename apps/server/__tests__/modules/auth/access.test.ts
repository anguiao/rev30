import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  RESOURCE_STATUS_DISABLED,
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_EXTERNAL,
  RESOURCE_TYPE_MENU,
  ROLE_STATUS_DISABLED,
} from '@rev30/shared'
import { roleResources, roles, systemResources, userRoles, users } from '../../../src/db/schema'
import { createTestDb } from '../../helpers/db'
import { createUserAccessService } from '../../../src/modules/auth/access'

type ResourceInsertInput = {
  code: string
  name: string
  type: string
  parentId: string | null
  path: string | null
  externalUrl: string | null
  openTarget: string
  icon: string | null
  hidden: boolean
  status: number
  sortOrder: number
}

const now = new Date('2026-05-06T00:00:00.000Z')

async function createUser(database: Awaited<ReturnType<typeof createTestDb>>, username: string) {
  const [user] = await database
    .insert(users)
    .values({
      id: randomUUID(),
      username,
      nickname: `${username} Nickname`,
      status: 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  if (!user) {
    throw new Error('Expected user')
  }

  return user
}

async function createRole(database: Awaited<ReturnType<typeof createTestDb>>, code: string) {
  const [role] = await database
    .insert(roles)
    .values({
      id: randomUUID(),
      name: code,
      code,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  if (!role) {
    throw new Error('Expected role')
  }

  return role
}

async function createResource(
  database: Awaited<ReturnType<typeof createTestDb>>,
  input: ResourceInsertInput,
) {
  const [resource] = await database
    .insert(systemResources)
    .values({
      id: randomUUID(),
      ...input,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  if (!resource) {
    throw new Error(`Expected resource ${input.code}`)
  }

  return resource
}

describe('user access service', () => {
  it('collects access codes and menus from enabled roles and resources', async () => {
    const database = await createTestDb()
    const user = await createUser(database, 'ada')
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

    await database.insert(userRoles).values({
      userId: user.id,
      roleId: operatorRole.id,
      createdAt: now,
    })

    await database.insert(userRoles).values({
      userId: user.id,
      roleId: auditRole.id,
      createdAt: now,
    })

    await database.insert(roleResources).values([
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
  })

  it('ignores disabled roles and disabled resources', async () => {
    const database = await createTestDb()
    const user = await createUser(database, 'disabled-access')
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

    await database.insert(userRoles).values({
      userId: user.id,
      roleId: role.id,
      createdAt: now,
    })
    await database.insert(roleResources).values({
      roleId: role.id,
      resourceId: userList.id,
      createdAt: now,
    })
    await database.update(roles).set({ status: ROLE_STATUS_DISABLED }).where(eq(roles.id, role.id))

    const disabledRoleAccess = await createUserAccessService(database).resolveUserAccess(user.id)
    expect(disabledRoleAccess.accessCodes).toEqual([])

    await database
      .update(roles)
      .set({ status: RESOURCE_STATUS_ENABLED })
      .where(eq(roles.id, role.id))
    await database
      .update(systemResources)
      .set({ status: RESOURCE_STATUS_DISABLED })
      .where(eq(systemResources.id, userList.id))

    const disabledResourceAccess = await createUserAccessService(database).resolveUserAccess(
      user.id,
    )
    expect(disabledResourceAccess.accessCodes).toEqual([])
  })

  it('grants all enabled resources to enabled admin roles without role resource bindings', async () => {
    const database = await createTestDb()
    const user = await createUser(database, 'root')
    const prefix = randomUUID()
    const existingAdminRole = await database
      .select()
      .from(roles)
      .where(eq(roles.code, 'admin'))
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

    await database.insert(userRoles).values({
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
  })

  it('builds only visible non-action menus and does not auto-fill missing parent menus', async () => {
    const database = await createTestDb()
    const user = await createUser(database, 'menu-viewer')
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

    await database.insert(userRoles).values({
      userId: user.id,
      roleId: role.id,
      createdAt: now,
    })

    await database.insert(roleResources).values([
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
  })
})
