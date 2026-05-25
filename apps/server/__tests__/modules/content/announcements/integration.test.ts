import { randomUUID } from 'node:crypto'
import type { Announcement, AnnouncementListResponse, TiptapDocument } from '@rev30/contracts'
import {
  ANNOUNCEMENT_STATUS_ARCHIVED,
  ANNOUNCEMENT_STATUS_DRAFT,
  ANNOUNCEMENT_STATUS_PUBLISHED,
  ANNOUNCEMENT_TYPE_BULLETIN,
  ANNOUNCEMENT_TYPE_NOTICE,
} from '@rev30/contracts'
import { and, eq, isNull } from 'drizzle-orm'
import type { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { contentAnnouncements } from '../../../../src/db/schema'
import { createAnnouncementRoutes } from '../../../../src/modules/content/announcements/routes'
import {
  createProtectedContentRouteTestApp,
  createSystemAccessFixture,
} from '../../../helpers/auth'
import { createTestDb } from '../../../helpers/db'

type ErrorResponse = {
  message: string
  field?: string
}

const createBody = {
  type: 'notice',
  title: '维护通知',
  summary: '今晚维护',
  contentJson: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '今晚维护' }] }],
  },
  pinned: true,
} as const

async function createTestApp(database: Awaited<ReturnType<typeof createTestDb>>) {
  const fixture = await createSystemAccessFixture(database, {
    admin: true,
    usernamePrefix: 'announcement-routes-admin',
  })

  return createProtectedContentRouteTestApp(
    database,
    '/api/content/announcements',
    createAnnouncementRoutes(database),
    fixture.authHeaders,
  )
}

async function createAnnouncement(
  app: Hono,
  body: {
    type: 'notice' | 'bulletin'
    title: string
    summary?: string | null
    contentJson: TiptapDocument
    pinned?: boolean
    publish?: boolean
  },
) {
  const response = await app.request('/api/content/announcements', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })

  return { body: (await response.json()) as Announcement, response }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('announcement routes', () => {
  it('supports creating draft and published announcements and exposes list/detail shapes', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    const { body: createdDraft, response: createDraftResponse } = await createAnnouncement(
      app,
      createBody,
    )
    expect(createDraftResponse.status).toBe(201)
    expect(createdDraft).toMatchObject({
      type: 'notice',
      title: '维护通知',
      summary: '今晚维护',
      status: 'draft',
      pinned: true,
      publishedAt: null,
      contentText: '今晚维护',
    })

    const { body: createdPublished, response: createPublishedResponse } = await createAnnouncement(
      app,
      {
        ...createBody,
        title: '已发布通知',
        publish: true,
      },
    )
    expect(createPublishedResponse.status).toBe(201)
    expect(createdPublished.status).toBe('published')
    expect(createdPublished.publishedAt).toEqual(expect.any(String))

    const listResponse = await app.request('/api/content/announcements?page=1&pageSize=10')
    const listBody = (await listResponse.json()) as AnnouncementListResponse
    expect(listResponse.status).toBe(200)
    const listedDraft = listBody.list.find((item) => item.id === createdDraft.id)
    expect(listedDraft).toBeDefined()
    expect(listedDraft).not.toHaveProperty('contentJson')
    expect(listedDraft).not.toHaveProperty('contentText')

    const detailResponse = await app.request(`/api/content/announcements/${createdDraft.id}`)
    const detailBody = (await detailResponse.json()) as Announcement
    expect(detailResponse.status).toBe(200)
    expect(detailBody.contentJson).toEqual(createBody.contentJson)
  })

  it('rejects creating announcements with invalid contentJson structure', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    const response = await app.request('/api/content/announcements', {
      method: 'POST',
      body: JSON.stringify({
        ...createBody,
        contentJson: { type: 'bad' },
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(response.status).toBe(400)
    expect((await response.json()) as ErrorResponse).toEqual({ message: '请求体无效' })
  })

  it('rejects invalid create payloads', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    const response = await app.request('/api/content/announcements', {
      method: 'POST',
      body: JSON.stringify({
        ...createBody,
        title: '   ',
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(response.status).toBe(400)
    expect((await response.json()) as ErrorResponse).toEqual({ message: '请求体无效' })
  })

  it('rejects publish false in update payloads', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: created } = await createAnnouncement(app, createBody)

    const response = await app.request(`/api/content/announcements/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ publish: false }),
      headers: { 'content-type': 'application/json' },
    })

    expect(response.status).toBe(400)
    expect((await response.json()) as ErrorResponse).toEqual({ message: '请求体无效' })
  })

  it('updates content text when patching announcement content', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: created } = await createAnnouncement(app, createBody)

    const response = await app.request(`/api/content/announcements/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        contentJson: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '维护时间改到 23:00' }] }],
        },
      }),
      headers: { 'content-type': 'application/json' },
    })
    const body = (await response.json()) as Announcement

    expect(response.status).toBe(200)
    expect(body.contentText).toBe('维护时间改到 23:00')
  })

  it('publishes archived announcements and refreshes publishedAt', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const firstTime = new Date()
    vi.useFakeTimers()
    vi.setSystemTime(firstTime)

    const { body: created } = await createAnnouncement(app, {
      ...createBody,
      publish: true,
    })
    const firstPublishedAt = created.publishedAt

    const archiveResponse = await app.request(`/api/content/announcements/${created.id}/archive`, {
      method: 'POST',
    })
    const archived = (await archiveResponse.json()) as Announcement
    expect(archiveResponse.status).toBe(200)
    expect(archived.status).toBe(ANNOUNCEMENT_STATUS_ARCHIVED)
    expect(archived.publishedAt).toBe(firstPublishedAt)

    const republishTime = new Date(firstTime.getTime() + 1000)
    vi.setSystemTime(republishTime)
    const publishResponse = await app.request(`/api/content/announcements/${created.id}/publish`, {
      method: 'POST',
    })
    const republished = (await publishResponse.json()) as Announcement
    expect(publishResponse.status).toBe(200)
    expect(republished.status).toBe(ANNOUNCEMENT_STATUS_PUBLISHED)
    expect(republished.publishedAt).toBe(republishTime.toISOString())
    expect(republished.publishedAt).not.toBe(firstPublishedAt)
  })

  it('rejects archiving draft announcements', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: created } = await createAnnouncement(app, createBody)

    const response = await app.request(`/api/content/announcements/${created.id}/archive`, {
      method: 'POST',
    })

    expect(response.status).toBe(400)
    expect((await response.json()) as ErrorResponse).toEqual({ message: '草稿通知公告不能下线' })
  })

  it('matches keyword against title, summary, and content text', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)

    await createAnnouncement(app, {
      ...createBody,
      title: '标题命中关键字',
      summary: '普通摘要',
      contentJson: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '普通正文' }] }],
      },
    })
    await createAnnouncement(app, {
      ...createBody,
      title: '普通标题',
      summary: '摘要命中关键字',
      contentJson: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '普通正文' }] }],
      },
    })
    await createAnnouncement(app, {
      ...createBody,
      title: '普通标题 2',
      summary: '普通摘要 2',
      contentJson: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '正文命中关键字' }] }],
      },
    })

    const response = await app.request(
      '/api/content/announcements?page=1&pageSize=10&keyword=关键字',
    )
    const body = (await response.json()) as AnnouncementListResponse

    expect(response.status).toBe(200)
    expect(body.total).toBe(3)
    expect(body.list.map((item) => item.title).sort()).toEqual([
      '普通标题',
      '普通标题 2',
      '标题命中关键字',
    ])
  })

  it('sorts pinned announcements first, then published, then drafts, then archived', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const now = new Date('2026-05-18T10:00:00.000Z')

    await database.insert(contentAnnouncements).values([
      {
        id: randomUUID(),
        type: ANNOUNCEMENT_TYPE_NOTICE,
        title: '置顶已发布',
        summary: null,
        contentJson: createBody.contentJson,
        contentText: '置顶已发布',
        status: ANNOUNCEMENT_STATUS_PUBLISHED,
        pinned: true,
        publishedAt: new Date('2026-05-18T09:00:00.000Z'),
        createdAt: now,
        updatedAt: new Date('2026-05-18T09:00:00.000Z'),
      },
      {
        id: randomUUID(),
        type: ANNOUNCEMENT_TYPE_NOTICE,
        title: '较新已发布',
        summary: null,
        contentJson: createBody.contentJson,
        contentText: '较新已发布',
        status: ANNOUNCEMENT_STATUS_PUBLISHED,
        pinned: false,
        publishedAt: new Date('2026-05-18T08:00:00.000Z'),
        createdAt: now,
        updatedAt: new Date('2026-05-18T08:00:00.000Z'),
      },
      {
        id: randomUUID(),
        type: ANNOUNCEMENT_TYPE_BULLETIN,
        title: '较旧已发布',
        summary: null,
        contentJson: createBody.contentJson,
        contentText: '较旧已发布',
        status: ANNOUNCEMENT_STATUS_PUBLISHED,
        pinned: false,
        publishedAt: new Date('2026-05-18T07:00:00.000Z'),
        createdAt: now,
        updatedAt: new Date('2026-05-18T07:00:00.000Z'),
      },
      {
        id: randomUUID(),
        type: ANNOUNCEMENT_TYPE_NOTICE,
        title: '归档但发布时间更新',
        summary: null,
        contentJson: createBody.contentJson,
        contentText: '归档但发布时间更新',
        status: ANNOUNCEMENT_STATUS_ARCHIVED,
        pinned: false,
        publishedAt: new Date('2026-05-18T10:30:00.000Z'),
        createdAt: now,
        updatedAt: new Date('2026-05-18T10:30:00.000Z'),
      },
      {
        id: randomUUID(),
        type: ANNOUNCEMENT_TYPE_NOTICE,
        title: '草稿最近更新',
        summary: null,
        contentJson: createBody.contentJson,
        contentText: '草稿最近更新',
        status: ANNOUNCEMENT_STATUS_DRAFT,
        pinned: false,
        publishedAt: null,
        createdAt: now,
        updatedAt: new Date('2026-05-18T11:00:00.000Z'),
      },
      {
        id: randomUUID(),
        type: ANNOUNCEMENT_TYPE_NOTICE,
        title: '草稿较旧更新',
        summary: null,
        contentJson: createBody.contentJson,
        contentText: '草稿较旧更新',
        status: ANNOUNCEMENT_STATUS_DRAFT,
        pinned: false,
        publishedAt: null,
        createdAt: new Date('2026-05-18T09:30:00.000Z'),
        updatedAt: new Date('2026-05-18T09:30:00.000Z'),
      },
      {
        id: randomUUID(),
        type: ANNOUNCEMENT_TYPE_NOTICE,
        title: '更早归档',
        summary: null,
        contentJson: createBody.contentJson,
        contentText: '更早归档',
        status: ANNOUNCEMENT_STATUS_ARCHIVED,
        pinned: false,
        publishedAt: new Date('2026-05-18T06:00:00.000Z'),
        createdAt: new Date('2026-05-18T06:00:00.000Z'),
        updatedAt: new Date('2026-05-18T06:00:00.000Z'),
      },
    ])

    const response = await app.request('/api/content/announcements?page=1&pageSize=10')
    const body = (await response.json()) as AnnouncementListResponse

    expect(response.status).toBe(200)
    expect(body.list.slice(0, 7).map((item) => item.title)).toEqual([
      '置顶已发布',
      '较新已发布',
      '较旧已发布',
      '草稿最近更新',
      '草稿较旧更新',
      '归档但发布时间更新',
      '更早归档',
    ])
  })

  it('uses deterministic tie breakers when publishedAt and updatedAt are equal', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const sharedPublishedAt = new Date('2026-05-18T08:00:00.000Z')
    const sharedUpdatedAt = new Date('2026-05-18T09:00:00.000Z')

    await database.insert(contentAnnouncements).values([
      {
        id: '11111111-1111-4111-8111-111111111111',
        type: ANNOUNCEMENT_TYPE_NOTICE,
        title: '较小 ID',
        summary: null,
        contentJson: createBody.contentJson,
        contentText: '较小 ID',
        status: ANNOUNCEMENT_STATUS_PUBLISHED,
        pinned: false,
        publishedAt: sharedPublishedAt,
        createdAt: new Date('2026-05-18T07:00:00.000Z'),
        updatedAt: sharedUpdatedAt,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        type: ANNOUNCEMENT_TYPE_NOTICE,
        title: '较大 ID 但较早创建',
        summary: null,
        contentJson: createBody.contentJson,
        contentText: '较大 ID 但较早创建',
        status: ANNOUNCEMENT_STATUS_PUBLISHED,
        pinned: false,
        publishedAt: sharedPublishedAt,
        createdAt: new Date('2026-05-18T06:00:00.000Z'),
        updatedAt: sharedUpdatedAt,
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        type: ANNOUNCEMENT_TYPE_NOTICE,
        title: '更新创建更晚',
        summary: null,
        contentJson: createBody.contentJson,
        contentText: '更新创建更晚',
        status: ANNOUNCEMENT_STATUS_PUBLISHED,
        pinned: false,
        publishedAt: sharedPublishedAt,
        createdAt: new Date('2026-05-18T10:00:00.000Z'),
        updatedAt: sharedUpdatedAt,
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        type: ANNOUNCEMENT_TYPE_NOTICE,
        title: '同创建时间取较大 ID',
        summary: null,
        contentJson: createBody.contentJson,
        contentText: '同创建时间取较大 ID',
        status: ANNOUNCEMENT_STATUS_PUBLISHED,
        pinned: false,
        publishedAt: sharedPublishedAt,
        createdAt: new Date('2026-05-18T05:00:00.000Z'),
        updatedAt: sharedUpdatedAt,
      },
      {
        id: '55555555-5555-4555-8555-555555555555',
        type: ANNOUNCEMENT_TYPE_NOTICE,
        title: '同创建时间取最大 ID',
        summary: null,
        contentJson: createBody.contentJson,
        contentText: '同创建时间取最大 ID',
        status: ANNOUNCEMENT_STATUS_PUBLISHED,
        pinned: false,
        publishedAt: sharedPublishedAt,
        createdAt: new Date('2026-05-18T05:00:00.000Z'),
        updatedAt: sharedUpdatedAt,
      },
    ])

    const response = await app.request('/api/content/announcements?page=1&pageSize=10')
    const body = (await response.json()) as AnnouncementListResponse

    expect(response.status).toBe(200)
    expect(body.list.slice(0, 5).map((item) => item.title)).toEqual([
      '更新创建更晚',
      '较小 ID',
      '较大 ID 但较早创建',
      '同创建时间取最大 ID',
      '同创建时间取较大 ID',
    ])
  })

  it('soft deletes announcements and hides them from list', async () => {
    const database = await createTestDb()
    const app = await createTestApp(database)
    const { body: created } = await createAnnouncement(app, createBody)

    const deleteResponse = await app.request(`/api/content/announcements/${created.id}`, {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(204)

    const [deleted] = await database
      .select()
      .from(contentAnnouncements)
      .where(eq(contentAnnouncements.id, created.id))
    expect(deleted?.deletedAt).toEqual(expect.any(Date))

    const listResponse = await app.request('/api/content/announcements?page=1&pageSize=10')
    const listBody = (await listResponse.json()) as AnnouncementListResponse
    expect(listResponse.status).toBe(200)
    expect(listBody.list.some((item) => item.id === created.id)).toBe(false)

    const [activeRow] = await database
      .select()
      .from(contentAnnouncements)
      .where(and(eq(contentAnnouncements.id, created.id), isNull(contentAnnouncements.deletedAt)))
    expect(activeRow).toBeUndefined()
  })
})
