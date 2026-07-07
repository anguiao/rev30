import { randomUUID } from 'node:crypto'
import type {
  AnnouncementMyDetail,
  AnnouncementMyListResponse,
  AnnouncementType,
} from '@rev30/contracts'
import {
  ANNOUNCEMENT_STATUS_ARCHIVED,
  ANNOUNCEMENT_STATUS_DRAFT,
  ANNOUNCEMENT_STATUS_PUBLISHED,
  ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT,
  ANNOUNCEMENT_TARGET_TYPE_ROLE,
  ANNOUNCEMENT_TARGET_TYPE_USER,
  ANNOUNCEMENT_TYPE_BULLETIN,
  ANNOUNCEMENT_TYPE_NOTICE,
  ANNOUNCEMENT_VISIBILITY_ALL,
  ANNOUNCEMENT_VISIBILITY_TARGETED,
  DEPARTMENT_STATUS_DISABLED,
  DEPARTMENT_STATUS_ENABLED,
  ROLE_STATUS_DISABLED,
  ROLE_STATUS_ENABLED,
} from '@rev30/contracts'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  announcements,
  announcementTargets,
  systemDepartments,
  systemRoles,
  systemUserDepartments,
  systemUserRoles,
} from '../../../../../src/db/schema'
import { createAuthMiddleware } from '../../../../../src/middleware/auth'
import { createContentRoutes } from '../../../../../src/modules/content/routes'
import {
  createProtectedContentRouteTestApp,
  createSystemAccessFixture,
} from '../../../../helpers/auth'
import { createTestDb } from '../../../../helpers/db'

const now = new Date('2026-05-20T00:00:00.000Z')

type TestDatabase = Awaited<ReturnType<typeof createTestDb>>

type InsertAnnouncementInput = {
  id?: string
  title: string
  summary?: string | null
  contentText?: string
  contentHtml?: string
  type?: AnnouncementType
  visibility?: 'all' | 'targeted'
  status?: 'draft' | 'published' | 'archived'
  pinned?: boolean
  publishedAt?: Date | null
  updatedAt?: Date
  createdAt?: Date
  deletedAt?: Date | null
  targets?: Array<{
    targetType: 'user' | 'department' | 'role'
    targetId: string
  }>
}

async function createTestApp(database: TestDatabase) {
  const fixture = await createSystemAccessFixture(database, {
    usernamePrefix: 'my-announcement-user',
  })

  const app = createProtectedContentRouteTestApp(
    database,
    '/api/content',
    createContentRoutes(database, createAuthMiddleware(database)),
    fixture.authHeaders,
  )

  return { app, fixture }
}

async function insertAnnouncement(database: TestDatabase, input: InsertAnnouncementInput) {
  const announcementId = input.id ?? randomUUID()
  const contentText = input.contentText ?? input.title
  const contentHtml = input.contentHtml ?? `<p>${contentText}</p>`

  await database.insert(announcements).values({
    id: announcementId,
    type: input.type ?? ANNOUNCEMENT_TYPE_NOTICE,
    title: input.title,
    summary: input.summary ?? null,
    contentJson: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: contentText }] }],
    },
    contentText,
    contentHtml,
    visibility: input.visibility ?? ANNOUNCEMENT_VISIBILITY_TARGETED,
    status: input.status ?? ANNOUNCEMENT_STATUS_PUBLISHED,
    pinned: input.pinned ?? false,
    publishedAt: input.publishedAt ?? now,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    deletedAt: input.deletedAt ?? null,
  })

  if (input.targets && input.targets.length > 0) {
    await database.insert(announcementTargets).values(
      input.targets.map((target) => ({
        announcementId,
        targetType: target.targetType,
        targetId: target.targetId,
      })),
    )
  }

  return announcementId
}

describe('my announcement integration', () => {
  it('shows all-visibility announcements to logged-in users and supports keyword/type filters', async () => {
    const database = await createTestDb()
    const { app } = await createTestApp(database)

    const visibleId = await insertAnnouncement(database, {
      title: '全员维护通知',
      summary: '今晚维护',
      contentText: '系统将于今晚维护',
      visibility: ANNOUNCEMENT_VISIBILITY_ALL,
      type: ANNOUNCEMENT_TYPE_NOTICE,
      pinned: true,
    })
    await insertAnnouncement(database, {
      title: '全员周报',
      summary: '本周总结',
      visibility: ANNOUNCEMENT_VISIBILITY_ALL,
      type: ANNOUNCEMENT_TYPE_BULLETIN,
      publishedAt: new Date('2026-05-19T00:00:00.000Z'),
    })

    const listResponse = await app.request(
      '/api/content/announcements/my?page=1&pageSize=10&keyword=维护&type=notice',
    )
    const listBody = (await listResponse.json()) as AnnouncementMyListResponse

    expect(listResponse.status).toBe(200)
    expect(listBody).toEqual({
      list: [
        {
          id: visibleId,
          type: ANNOUNCEMENT_TYPE_NOTICE,
          title: '全员维护通知',
          summary: '今晚维护',
          pinned: true,
          publishedAt: '2026-05-20T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    })

    const detailResponse = await app.request(`/api/content/announcements/my/${visibleId}`)
    const detailBody = (await detailResponse.json()) as AnnouncementMyDetail

    expect(detailResponse.status).toBe(200)
    expect(detailBody).toEqual({
      id: visibleId,
      type: ANNOUNCEMENT_TYPE_NOTICE,
      title: '全员维护通知',
      summary: '今晚维护',
      pinned: true,
      publishedAt: '2026-05-20T00:00:00.000Z',
      contentHtml: '<p>系统将于今晚维护</p>',
    })
  })

  it('shows user-targeted announcements only to the matching user', async () => {
    const database = await createTestDb()
    const { app, fixture } = await createTestApp(database)

    const visibleId = await insertAnnouncement(database, {
      title: '给当前用户的通知',
      visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
      targets: [
        {
          targetType: ANNOUNCEMENT_TARGET_TYPE_USER,
          targetId: fixture.userId,
        },
      ],
    })
    await insertAnnouncement(database, {
      title: '给别人的通知',
      visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
      targets: [
        {
          targetType: ANNOUNCEMENT_TARGET_TYPE_USER,
          targetId: randomUUID(),
        },
      ],
    })

    const listResponse = await app.request('/api/content/announcements/my?page=1&pageSize=10')
    const listBody = (await listResponse.json()) as AnnouncementMyListResponse

    expect(listResponse.status).toBe(200)
    expect(listBody.list.map((item) => item.id)).toEqual([visibleId])
    expect(listBody.total).toBe(1)
  })

  it('shows department-targeted announcements only for direct department matches', async () => {
    const database = await createTestDb()
    const { app, fixture } = await createTestApp(database)
    const departmentId = randomUUID()

    await database.insert(systemDepartments).values({
      id: departmentId,
      name: 'Engineering',
      code: `engineering-${departmentId.slice(0, 8)}`,
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    })
    await database.insert(systemUserDepartments).values({
      userId: fixture.userId,
      departmentId,
      createdAt: now,
    })

    const visibleId = await insertAnnouncement(database, {
      title: '研发部通知',
      visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
      targets: [
        {
          targetType: ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT,
          targetId: departmentId,
        },
      ],
    })
    await insertAnnouncement(database, {
      title: '别的部门通知',
      visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
      targets: [
        {
          targetType: ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT,
          targetId: randomUUID(),
        },
      ],
    })

    const response = await app.request('/api/content/announcements/my?page=1&pageSize=10')
    const body = (await response.json()) as AnnouncementMyListResponse

    expect(response.status).toBe(200)
    expect(body.list.map((item) => item.id)).toEqual([visibleId])
  })

  it('hides department-targeted announcements when the matched department is disabled', async () => {
    const database = await createTestDb()
    const { app, fixture } = await createTestApp(database)
    const departmentId = randomUUID()

    await database.insert(systemDepartments).values({
      id: departmentId,
      name: 'Disabled Engineering',
      code: `disabled-engineering-${departmentId.slice(0, 8)}`,
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    })
    await database.insert(systemUserDepartments).values({
      userId: fixture.userId,
      departmentId,
      createdAt: now,
    })

    const announcementId = await insertAnnouncement(database, {
      title: '禁用部门通知',
      visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
      targets: [
        {
          targetType: ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT,
          targetId: departmentId,
        },
      ],
    })

    await database
      .update(systemDepartments)
      .set({ status: DEPARTMENT_STATUS_DISABLED })
      .where(eq(systemDepartments.id, departmentId))

    const listResponse = await app.request('/api/content/announcements/my?page=1&pageSize=10')
    const listBody = (await listResponse.json()) as AnnouncementMyListResponse

    expect(listResponse.status).toBe(200)
    expect(listBody.list.map((item) => item.id)).not.toContain(announcementId)

    const detailResponse = await app.request(`/api/content/announcements/my/${announcementId}`)
    expect(detailResponse.status).toBe(404)
  })

  it('does not include child department users when targeting a parent department', async () => {
    const database = await createTestDb()
    const { app, fixture } = await createTestApp(database)
    const parentDepartmentId = randomUUID()
    const childDepartmentId = randomUUID()

    await database.insert(systemDepartments).values([
      {
        id: parentDepartmentId,
        name: 'Head Office',
        code: `parent-${parentDepartmentId.slice(0, 8)}`,
        parentId: null,
        status: DEPARTMENT_STATUS_ENABLED,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: childDepartmentId,
        name: 'Branch Office',
        code: `child-${childDepartmentId.slice(0, 8)}`,
        parentId: parentDepartmentId,
        status: DEPARTMENT_STATUS_ENABLED,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
    ])
    await database.insert(systemUserDepartments).values({
      userId: fixture.userId,
      departmentId: childDepartmentId,
      createdAt: now,
    })

    const announcementId = await insertAnnouncement(database, {
      title: '总部通知',
      visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
      targets: [
        {
          targetType: ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT,
          targetId: parentDepartmentId,
        },
      ],
    })

    const listResponse = await app.request('/api/content/announcements/my?page=1&pageSize=10')
    const listBody = (await listResponse.json()) as AnnouncementMyListResponse
    expect(listResponse.status).toBe(200)
    expect(listBody).toEqual({
      list: [],
      total: 0,
      page: 1,
      pageSize: 10,
    })

    const detailResponse = await app.request(`/api/content/announcements/my/${announcementId}`)
    expect(detailResponse.status).toBe(404)
    expect(await detailResponse.json()).toEqual({ message: '通知公告不存在' })
  })

  it('shows role-targeted announcements only for matching roles', async () => {
    const database = await createTestDb()
    const { app, fixture } = await createTestApp(database)
    const roleId = randomUUID()

    await database.insert(systemRoles).values({
      id: roleId,
      name: 'Announcement Reader',
      code: `announcement-reader-${roleId.slice(0, 8)}`,
      status: ROLE_STATUS_ENABLED,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    })
    await database.insert(systemUserRoles).values({
      userId: fixture.userId,
      roleId,
      createdAt: now,
    })

    const visibleId = await insertAnnouncement(database, {
      title: '角色可见通知',
      visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
      targets: [
        {
          targetType: ANNOUNCEMENT_TARGET_TYPE_ROLE,
          targetId: roleId,
        },
      ],
    })
    await insertAnnouncement(database, {
      title: '其他角色通知',
      visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
      targets: [
        {
          targetType: ANNOUNCEMENT_TARGET_TYPE_ROLE,
          targetId: randomUUID(),
        },
      ],
    })

    const response = await app.request('/api/content/announcements/my?page=1&pageSize=10')
    const body = (await response.json()) as AnnouncementMyListResponse

    expect(response.status).toBe(200)
    expect(body.list.map((item) => item.id)).toEqual([visibleId])
  })

  it('hides role-targeted announcements when the matched role is disabled', async () => {
    const database = await createTestDb()
    const { app, fixture } = await createTestApp(database)
    const roleId = randomUUID()

    await database.insert(systemRoles).values({
      id: roleId,
      name: 'Disabled Announcement Reader',
      code: `disabled-announcement-reader-${roleId.slice(0, 8)}`,
      status: ROLE_STATUS_ENABLED,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    })
    await database.insert(systemUserRoles).values({
      userId: fixture.userId,
      roleId,
      createdAt: now,
    })

    const announcementId = await insertAnnouncement(database, {
      title: '禁用角色通知',
      visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
      targets: [
        {
          targetType: ANNOUNCEMENT_TARGET_TYPE_ROLE,
          targetId: roleId,
        },
      ],
    })

    await database
      .update(systemRoles)
      .set({ status: ROLE_STATUS_DISABLED })
      .where(eq(systemRoles.id, roleId))

    const listResponse = await app.request('/api/content/announcements/my?page=1&pageSize=10')
    const listBody = (await listResponse.json()) as AnnouncementMyListResponse

    expect(listResponse.status).toBe(200)
    expect(listBody.list.map((item) => item.id)).not.toContain(announcementId)

    const detailResponse = await app.request(`/api/content/announcements/my/${announcementId}`)
    expect(detailResponse.status).toBe(404)
  })

  it('hides draft, archived, soft-deleted, and non-matching targeted announcements', async () => {
    const database = await createTestDb()
    const { app } = await createTestApp(database)

    const visibleId = await insertAnnouncement(database, {
      title: '真正可见的全员通知',
      visibility: ANNOUNCEMENT_VISIBILITY_ALL,
    })
    await insertAnnouncement(database, {
      title: '草稿通知',
      visibility: ANNOUNCEMENT_VISIBILITY_ALL,
      status: ANNOUNCEMENT_STATUS_DRAFT,
      publishedAt: null,
    })
    await insertAnnouncement(database, {
      title: '已归档通知',
      visibility: ANNOUNCEMENT_VISIBILITY_ALL,
      status: ANNOUNCEMENT_STATUS_ARCHIVED,
    })
    await insertAnnouncement(database, {
      title: '已删除通知',
      visibility: ANNOUNCEMENT_VISIBILITY_ALL,
      deletedAt: now,
    })
    await insertAnnouncement(database, {
      title: '不匹配的定向通知',
      visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
      targets: [
        {
          targetType: ANNOUNCEMENT_TARGET_TYPE_USER,
          targetId: randomUUID(),
        },
      ],
    })

    const response = await app.request('/api/content/announcements/my?page=1&pageSize=10')
    const body = (await response.json()) as AnnouncementMyListResponse

    expect(response.status).toBe(200)
    expect(body.list.map((item) => item.id)).toEqual([visibleId])
    expect(body.total).toBe(1)
  })

  it('returns 404 for invisible announcements in detail', async () => {
    const database = await createTestDb()
    const { app } = await createTestApp(database)

    const hiddenId = await insertAnnouncement(database, {
      title: '别人可见的通知',
      visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
      targets: [
        {
          targetType: ANNOUNCEMENT_TARGET_TYPE_USER,
          targetId: randomUUID(),
        },
      ],
    })

    const response = await app.request(`/api/content/announcements/my/${hiddenId}`)

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ message: '通知公告不存在' })
  })

  it('stores visibility targets for fixture setup as expected', async () => {
    const database = await createTestDb()
    const { fixture } = await createTestApp(database)

    const announcementId = await insertAnnouncement(database, {
      title: 'fixture assertion',
      visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
      targets: [
        {
          targetType: ANNOUNCEMENT_TARGET_TYPE_USER,
          targetId: fixture.userId,
        },
      ],
    })

    const rows = await database
      .select()
      .from(announcementTargets)
      .where(
        and(
          eq(announcementTargets.announcementId, announcementId),
          eq(announcementTargets.targetType, ANNOUNCEMENT_TARGET_TYPE_USER),
          eq(announcementTargets.targetId, fixture.userId),
        ),
      )

    expect(rows).toHaveLength(1)
  })
})
