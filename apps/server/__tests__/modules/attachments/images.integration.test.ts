import { randomUUID } from 'node:crypto'
import {
  ATTACHMENT_CLEANUP_POLICY_MANUAL,
  ATTACHMENT_CLEANUP_POLICY_UNREFERENCED,
  ATTACHMENT_READ_POLICY_AUTHENTICATED,
  ATTACHMENT_READ_POLICY_SIGNED,
  attachmentImageListResponseSchema,
} from '@rev30/contracts'
import { describe, expect } from 'vitest'
import { announcements, attachmentReferences, attachments } from '../../../src/db/schema'
import { dbTest } from '../../fixtures/database'
import { createApp } from '../../helpers/app'
import { createSystemAccessFixture } from '../../helpers/auth'
import { createSystemUserFixture } from '../../helpers/system'

const route = '/api/attachments/images'
const older = new Date('2026-05-23T09:00:00.000Z')
const newer = new Date('2026-05-24T09:00:00.000Z')

function imageRow(createdBy: string, id: string, originalName: string, createdAt = newer) {
  return {
    id,
    storageProvider: 'local',
    storageKey: `images/${id}`,
    originalName,
    mimeType: 'image/png',
    extension: 'png',
    size: 42,
    usage: 'announcement-content-image',
    readPolicy: ATTACHMENT_READ_POLICY_AUTHENTICATED,
    cleanupPolicy: ATTACHMENT_CLEANUP_POLICY_UNREFERENCED,
    createdBy,
    createdAt,
    updatedAt: createdAt,
  }
}

describe('attachment images', () => {
  dbTest('requires login without granting attachment management access', async ({ db }) => {
    const app = createApp(db)
    const user = await createSystemAccessFixture(db, { usernamePrefix: 'images-reader' })
    const response = await app.request(route, { headers: user.authHeaders })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ list: [], total: 0, page: 1, pageSize: 20 })
    expect((await app.request(route)).status).toBe(401)
    expect((await app.request('/api/attachments', { headers: user.authHeaders })).status).toBe(403)
  })

  dbTest(
    'filters before paging and searches literal filename substrings in deterministic order',
    async ({ db }) => {
      const user = await createSystemAccessFixture(db, {
        usernamePrefix: 'images-search-user',
      })
      const otherOwner = await createSystemUserFixture(db, {
        username: `images-owner-${randomUUID()}`,
      })
      const app = createApp(db)
      const requestImages = (query = '') =>
        app.request(`${route}?${query}`, { headers: user.authHeaders })
      const announcementFilters = 'usage=announcement-content-image'
      const olderId = '11111111-1111-4111-8111-111111111111'
      const lowerId = '22222222-2222-4222-8222-222222222222'
      const higherId = '33333333-3333-4333-8333-333333333333'
      const avatarId = '44444444-4444-4444-8444-444444444444'
      const manualId = '55555555-5555-4555-8555-555555555555'
      await db.insert(attachments).values([
        imageRow(otherOwner.id, olderId, 'Alpha\\draft.png', older),
        imageRow(otherOwner.id, lowerId, 'Gamma_2.png'),
        imageRow(otherOwner.id, higherId, '100% Banner.png'),
        { ...imageRow(otherOwner.id, avatarId, 'Avatar.png'), usage: 'avatar' },
        {
          ...imageRow(otherOwner.id, randomUUID(), 'Signed.png'),
          readPolicy: ATTACHMENT_READ_POLICY_SIGNED,
        },
        {
          ...imageRow(otherOwner.id, manualId, 'Manual.png'),
          cleanupPolicy: ATTACHMENT_CLEANUP_POLICY_MANUAL,
        },
        {
          ...imageRow(otherOwner.id, randomUUID(), 'Vector.svg'),
          mimeType: 'image/svg+xml',
          extension: 'svg',
        },
        {
          ...imageRow(otherOwner.id, randomUUID(), 'Document.pdf'),
          mimeType: 'application/pdf',
          extension: 'pdf',
        },
        { ...imageRow(otherOwner.id, randomUUID(), 'Deleted.png'), deletedAt: new Date() },
      ])
      const announcementId = randomUUID()
      await db.insert(announcements).values({
        id: announcementId,
        type: 'notice',
        title: 'Referenced image',
        visibility: 'all',
        contentJson: { type: 'doc', content: [{ type: 'paragraph' }] },
        contentText: '',
        contentHtml: '<p></p>',
      })
      await db.insert(attachmentReferences).values({
        attachmentId: olderId,
        sourceType: 'announcement',
        sourceId: announcementId,
        sourceField: 'contentJson',
      })

      const all = attachmentImageListResponseSchema.parse(await (await requestImages()).json())
      expect(all.list.map((item) => item.id)).toEqual([
        manualId,
        avatarId,
        higherId,
        lowerId,
        olderId,
      ])
      expect(all.total).toBe(5)
      expect(await (await requestImages('readPolicy=signed')).json()).toEqual(all)

      const avatars = attachmentImageListResponseSchema.parse(
        await (await requestImages('usage=avatar')).json(),
      )
      expect(avatars.list.map((item) => item.id)).toEqual([avatarId])
      expect(avatars.total).toBe(1)

      const firstResponse = await requestImages(`${announcementFilters}&pageSize=1`)
      expect(firstResponse.status).toBe(200)
      const first = await firstResponse.json()
      expect(first).toEqual({
        list: [
          {
            id: manualId,
            originalName: 'Manual.png',
            mimeType: 'image/png',
            extension: 'png',
            size: 42,
            usage: 'announcement-content-image',
            readPolicy: ATTACHMENT_READ_POLICY_AUTHENTICATED,
            createdAt: newer.toISOString(),
          },
        ],
        total: 4,
        page: 1,
        pageSize: 1,
      })
      expect(attachmentImageListResponseSchema.parse(first)).toEqual(first)
      const second = attachmentImageListResponseSchema.parse(
        await (await requestImages(`${announcementFilters}&page=2&pageSize=1`)).json(),
      )
      expect(second.list.map((item) => item.id)).toEqual([higherId])
      expect(second.total).toBe(4)
      const third = attachmentImageListResponseSchema.parse(
        await (await requestImages(`${announcementFilters}&page=3&pageSize=1`)).json(),
      )
      expect(third.list.map((item) => item.id)).toEqual([lowerId])
      const fourth = attachmentImageListResponseSchema.parse(
        await (await requestImages(`${announcementFilters}&page=4&pageSize=1`)).json(),
      )
      expect(fourth.list.map((item) => item.id)).toEqual([olderId])

      const matching = attachmentImageListResponseSchema.parse(
        await (await requestImages('keyword=%20%20gaMM%20%20')).json(),
      )
      expect(matching.list.map((item) => item.id)).toEqual([lowerId])
      expect(matching.total).toBe(1)
      const literalPercent = attachmentImageListResponseSchema.parse(
        await (await requestImages('keyword=%25')).json(),
      )
      expect(literalPercent.list.map((item) => item.id)).toEqual([higherId])
      expect(literalPercent.total).toBe(1)
      const literalUnderscore = attachmentImageListResponseSchema.parse(
        await (await requestImages('keyword=_')).json(),
      )
      expect(literalUnderscore.list.map((item) => item.id)).toEqual([lowerId])
      const literalBackslash = attachmentImageListResponseSchema.parse(
        await (await requestImages('keyword=%5C')).json(),
      )
      expect(literalBackslash.list.map((item) => item.id)).toEqual([olderId])
      const nonFilename = attachmentImageListResponseSchema.parse(
        await (await requestImages('keyword=image')).json(),
      )
      expect(nonFilename).toEqual({ list: [], total: 0, page: 1, pageSize: 20 })

      const invalidPage = await requestImages('page=0')
      expect(invalidPage.status).toBe(400)
      expect(await invalidPage.json()).toEqual({ message: '查询参数无效' })
    },
  )
})
