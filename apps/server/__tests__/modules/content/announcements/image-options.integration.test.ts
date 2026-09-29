import { randomUUID } from 'node:crypto'
import {
  ATTACHMENT_CLEANUP_POLICY_MANUAL,
  ATTACHMENT_CLEANUP_POLICY_UNREFERENCED,
  ATTACHMENT_READ_POLICY_AUTHENTICATED,
  ATTACHMENT_READ_POLICY_SIGNED,
  announcementImageOptionsResponseSchema,
} from '@rev30/contracts'
import { describe, expect } from 'vitest'
import { announcements, attachmentReferences, attachments } from '../../../../src/db/schema'
import { createAnnouncementRoutes } from '../../../../src/modules/content/announcements/routes'
import { dbTest } from '../../../fixtures/database'
import {
  createProtectedContentRouteTestApp,
  createSystemAccessFixture,
} from '../../../helpers/auth'
import { createSystemUserFixture } from '../../../helpers/system'

const route = '/api/content/announcements/image-options'
const older = new Date('2026-05-23T09:00:00.000Z')
const newer = new Date('2026-05-24T09:00:00.000Z')

function imageRow(createdBy: string, id: string, originalName: string, createdAt = newer) {
  return {
    id,
    storageProvider: 'local',
    storageKey: `announcements/${id}`,
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

describe('announcement image options', () => {
  dbTest(
    'allows either announcement write permission or admin, without attachment list access',
    async ({ db }) => {
      const app = createProtectedContentRouteTestApp(
        db,
        '/api/content/announcements',
        createAnnouncementRoutes(db),
      )
      const users = await Promise.all([
        createSystemAccessFixture(db, {
          accessCodes: ['content:announcement:create'],
          usernamePrefix: 'image-options-creator',
        }),
        createSystemAccessFixture(db, {
          accessCodes: ['content:announcement:update'],
          usernamePrefix: 'image-options-editor',
        }),
        createSystemAccessFixture(db, { admin: true, usernamePrefix: 'image-options-admin' }),
        createSystemAccessFixture(db, {
          accessCodes: ['content:announcement:list'],
          usernamePrefix: 'image-options-reader',
        }),
        createSystemAccessFixture(db, {
          accessCodes: ['content:attachment:list'],
          usernamePrefix: 'image-options-attachment-reader',
        }),
      ])

      for (const user of users.slice(0, 3)) {
        const response = await app.request(route, { headers: user.authHeaders })
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ list: [], total: 0, page: 1, pageSize: 20 })
      }

      for (const user of users.slice(3)) {
        const response = await app.request(route, { headers: user.authHeaders })
        expect(response.status).toBe(403)
      }

      expect((await app.request(route)).status).toBe(401)
    },
  )

  dbTest(
    'filters before paging and searches literal filename substrings in deterministic order',
    async ({ db }) => {
      const editor = await createSystemAccessFixture(db, {
        accessCodes: ['content:announcement:update'],
        usernamePrefix: 'image-options-search-editor',
      })
      const otherOwner = await createSystemUserFixture(db, {
        username: `image-options-owner-${randomUUID()}`,
      })
      const app = createProtectedContentRouteTestApp(
        db,
        '/api/content/announcements',
        createAnnouncementRoutes(db),
        editor.authHeaders,
      )
      const olderId = '11111111-1111-4111-8111-111111111111'
      const lowerId = '22222222-2222-4222-8222-222222222222'
      const higherId = '33333333-3333-4333-8333-333333333333'
      await db.insert(attachments).values([
        imageRow(otherOwner.id, olderId, 'Alpha\\draft.png', older),
        imageRow(otherOwner.id, lowerId, 'Gamma_2.png'),
        imageRow(otherOwner.id, higherId, '100% Banner.png'),
        { ...imageRow(otherOwner.id, randomUUID(), 'Avatar.png'), usage: 'avatar' },
        {
          ...imageRow(otherOwner.id, randomUUID(), 'Signed.png'),
          readPolicy: ATTACHMENT_READ_POLICY_SIGNED,
        },
        {
          ...imageRow(otherOwner.id, randomUUID(), 'Manual.png'),
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

      const firstResponse = await app.request(`${route}?pageSize=1&usage=avatar`)
      expect(firstResponse.status).toBe(200)
      const first = await firstResponse.json()
      expect(first).toEqual({
        list: [
          {
            id: higherId,
            originalName: '100% Banner.png',
            mimeType: 'image/png',
            extension: 'png',
            size: 42,
            usage: 'announcement-content-image',
            readPolicy: ATTACHMENT_READ_POLICY_AUTHENTICATED,
            createdAt: newer.toISOString(),
          },
        ],
        total: 3,
        page: 1,
        pageSize: 1,
      })
      expect(announcementImageOptionsResponseSchema.parse(first)).toEqual(first)
      const second = announcementImageOptionsResponseSchema.parse(
        await (await app.request(`${route}?page=2&pageSize=1`)).json(),
      )
      expect(second.list.map((item) => item.id)).toEqual([lowerId])
      expect(second.total).toBe(3)
      const third = announcementImageOptionsResponseSchema.parse(
        await (await app.request(`${route}?page=3&pageSize=1`)).json(),
      )
      expect(third.list.map((item) => item.id)).toEqual([olderId])

      const matching = announcementImageOptionsResponseSchema.parse(
        await (await app.request(`${route}?keyword=%20%20gaMM%20%20`)).json(),
      )
      expect(matching.list.map((item) => item.id)).toEqual([lowerId])
      expect(matching.total).toBe(1)
      const literalPercent = announcementImageOptionsResponseSchema.parse(
        await (await app.request(`${route}?keyword=%25`)).json(),
      )
      expect(literalPercent.list.map((item) => item.id)).toEqual([higherId])
      expect(literalPercent.total).toBe(1)
      const literalUnderscore = announcementImageOptionsResponseSchema.parse(
        await (await app.request(`${route}?keyword=_`)).json(),
      )
      expect(literalUnderscore.list.map((item) => item.id)).toEqual([lowerId])
      const literalBackslash = announcementImageOptionsResponseSchema.parse(
        await (await app.request(`${route}?keyword=%5C`)).json(),
      )
      expect(literalBackslash.list.map((item) => item.id)).toEqual([olderId])
      const nonFilename = announcementImageOptionsResponseSchema.parse(
        await (await app.request(`${route}?keyword=image`)).json(),
      )
      expect(nonFilename).toEqual({ list: [], total: 0, page: 1, pageSize: 20 })

      const invalidPage = await app.request(`${route}?page=0`)
      expect(invalidPage.status).toBe(400)
      expect(await invalidPage.json()).toEqual({ message: '查询参数无效' })
    },
  )
})
