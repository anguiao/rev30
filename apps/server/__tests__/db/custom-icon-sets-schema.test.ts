import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { customIconSetIcons, customIconSets, systemResources } from '../../src/db/schema'
import { createTestDb } from '../helpers/db'

const iconSetResourceCodes = [
  'content:icon-set',
  'content:icon-set:list',
  'content:icon-set:create',
  'content:icon-set:update',
  'content:icon-set:delete',
  'content:icon-set:export',
] as const

const iconSetActionNames = {
  'content:icon-set:create': '创建图标集',
  'content:icon-set:delete': '删除图标集',
  'content:icon-set:export': '导出图标集',
  'content:icon-set:list': '查看图标库',
  'content:icon-set:update': '更新图标集',
} as const

async function expectDatabaseCauseMessage(promise: Promise<unknown>, expectedMessage: string) {
  try {
    await promise
  } catch (error) {
    expect((error as { cause?: { message?: string } }).cause?.message).toContain(expectedMessage)
    return
  }

  throw new Error(`Expected database error containing: ${expectedMessage}`)
}

describe('custom icon set schema', () => {
  it('inserts a custom icon set with prefix, name, and description', async () => {
    const database = await createTestDb()

    const [createdSet] = await database
      .insert(customIconSets)
      .values({
        prefix: 'acme',
        name: 'Acme Icons',
        description: 'Icons for Acme',
      })
      .returning()

    expect(createdSet?.prefix).toBe('acme')
  })

  it('inserts custom icon set icons with svg metadata', async () => {
    const database = await createTestDb()

    const [createdSet] = await database
      .insert(customIconSets)
      .values({
        prefix: 'acme',
        name: 'Acme Icons',
        description: 'Icons for Acme',
      })
      .returning()

    if (!createdSet) {
      throw new Error('Expected icon set')
    }

    const [createdIcon] = await database
      .insert(customIconSetIcons)
      .values({
        setId: createdSet.id,
        name: 'rocket',
        body: '<path d="M0 0h24v24H0z" />',
        width: 24,
        height: 24,
        palette: false,
      })
      .returning()

    expect(createdIcon).toMatchObject({
      name: 'rocket',
      body: '<path d="M0 0h24v24H0z" />',
    })
  })

  it('seeds icon set resources under content management', async () => {
    const database = await createTestDb()

    const resources = await database
      .select({
        code: systemResources.code,
        deletedAt: systemResources.deletedAt,
        name: systemResources.name,
        parentId: systemResources.parentId,
        path: systemResources.path,
        type: systemResources.type,
      })
      .from(systemResources)
      .where(
        and(
          inArray(systemResources.code, [...iconSetResourceCodes]),
          isNull(systemResources.deletedAt),
        ),
      )

    expect(resources).toHaveLength(iconSetResourceCodes.length)
    expect(resources.find((resource) => resource.code === 'content:icon-set')).toMatchObject({
      code: 'content:icon-set',
      name: '图标库',
      path: '/content/icon-sets',
      type: 'menu',
      parentId: '10000000-0000-4000-8000-000000000100',
      deletedAt: null,
    })
    expect(
      Object.fromEntries(
        resources
          .filter((resource) => resource.type === 'action')
          .map((resource) => [resource.code, resource.name]),
      ),
    ).toEqual(iconSetActionNames)
    expect(
      resources
        .filter((resource) => resource.type === 'action')
        .map((resource) => resource.code)
        .sort(),
    ).toEqual([
      'content:icon-set:create',
      'content:icon-set:delete',
      'content:icon-set:export',
      'content:icon-set:list',
      'content:icon-set:update',
    ])
  })

  it('soft deletes custom icon sets and icons via deletedAt', async () => {
    const database = await createTestDb()

    const [createdSet] = await database
      .insert(customIconSets)
      .values({
        prefix: 'acme',
        name: 'Acme Icons',
        description: 'Icons for Acme',
      })
      .returning()

    if (!createdSet) {
      throw new Error('Expected icon set')
    }

    const [createdIcon] = await database
      .insert(customIconSetIcons)
      .values({
        setId: createdSet.id,
        name: 'rocket',
        body: '<path d="M0 0h24v24H0z" />',
        width: 24,
        height: 24,
        palette: false,
      })
      .returning()

    if (!createdIcon) {
      throw new Error('Expected icon')
    }

    const deletedAt = new Date('2026-06-15T00:00:00.000Z')

    await database
      .update(customIconSets)
      .set({ deletedAt })
      .where(eq(customIconSets.id, createdSet.id))

    await database
      .update(customIconSetIcons)
      .set({ deletedAt })
      .where(eq(customIconSetIcons.id, createdIcon.id))

    const [deletedSet] = await database
      .select({
        deletedAt: customIconSets.deletedAt,
        id: customIconSets.id,
      })
      .from(customIconSets)
      .where(eq(customIconSets.id, createdSet.id))

    const [deletedIcon] = await database
      .select({
        deletedAt: customIconSetIcons.deletedAt,
        id: customIconSetIcons.id,
      })
      .from(customIconSetIcons)
      .where(eq(customIconSetIcons.id, createdIcon.id))

    expect(deletedSet?.id).toBe(createdSet.id)
    expect(deletedSet?.deletedAt?.toISOString()).toBe(deletedAt.toISOString())
    expect(deletedIcon?.id).toBe(createdIcon.id)
    expect(deletedIcon?.deletedAt?.toISOString()).toBe(deletedAt.toISOString())
  })

  it('enforces unique active prefixes', async () => {
    const database = await createTestDb()

    await database.insert(customIconSets).values({
      prefix: 'acme',
      name: 'Acme Icons',
      description: 'Icons for Acme',
    })

    await expectDatabaseCauseMessage(
      database.insert(customIconSets).values({
        prefix: 'acme',
        name: 'Acme Icons Duplicate',
        description: 'Duplicate prefix',
      }),
      'custom_icon_sets_prefix_active_unique',
    )
  })

  it('allows reusing a prefix after soft delete', async () => {
    const database = await createTestDb()

    const [createdSet] = await database
      .insert(customIconSets)
      .values({
        prefix: 'acme',
        name: 'Acme Icons',
        description: 'Icons for Acme',
      })
      .returning()

    if (!createdSet) {
      throw new Error('Expected icon set')
    }

    await database
      .update(customIconSets)
      .set({ deletedAt: new Date('2026-06-15T00:00:00.000Z') })
      .where(eq(customIconSets.id, createdSet.id))

    const [recreatedSet] = await database
      .insert(customIconSets)
      .values({
        prefix: 'acme',
        name: 'Acme Icons Reloaded',
        description: 'Recreated prefix',
      })
      .returning()

    expect(recreatedSet?.prefix).toBe('acme')
    expect(recreatedSet?.id).not.toBe(createdSet.id)
  })

  it('enforces unique active icon names within a set', async () => {
    const database = await createTestDb()

    const [createdSet] = await database
      .insert(customIconSets)
      .values({
        prefix: 'acme',
        name: 'Acme Icons',
        description: 'Icons for Acme',
      })
      .returning()

    if (!createdSet) {
      throw new Error('Expected icon set')
    }

    await database.insert(customIconSetIcons).values({
      setId: createdSet.id,
      name: 'rocket',
      body: '<path d="M0 0h24v24H0z" />',
      width: 24,
      height: 24,
      palette: false,
    })

    await expectDatabaseCauseMessage(
      database.insert(customIconSetIcons).values({
        setId: createdSet.id,
        name: 'rocket',
        body: '<path d="M1 1h22v22H1z" />',
        width: 24,
        height: 24,
        palette: false,
      }),
      'custom_icon_set_icons_set_name_active_unique',
    )
  })

  it('rejects inserting an icon without setId', async () => {
    const database = await createTestDb()

    await expectDatabaseCauseMessage(
      database.execute(sql`
        insert into "custom_icon_set_icons" ("name", "body", "width", "height", "palette")
        values ('rocket', '<path d="M0 0h24v24H0z" />', 24, 24, false)
      `),
      'null value in column "set_id"',
    )
  })
})
