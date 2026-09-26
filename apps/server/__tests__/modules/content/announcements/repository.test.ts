import { randomUUID } from 'node:crypto'
import {
  ANNOUNCEMENT_STATUS_DRAFT,
  ANNOUNCEMENT_TARGET_TYPE_ROLE,
  ANNOUNCEMENT_VISIBILITY_TARGETED,
  ROLE_STATUS_DISABLED,
} from '@rev30/contracts'
import { eq } from 'drizzle-orm'
import { describe, expect } from 'vitest'
import { announcements, announcementTargets } from '../../../../src/db/schema'
import { AnnouncementInvalidTargetError } from '../../../../src/modules/content/announcements/errors'
import { createAnnouncementRepository } from '../../../../src/modules/content/announcements/repository'
import { dbTest } from '../../../fixtures/database'
import { createSystemRoleFixture } from '../../../helpers/system'

describe('announcement repository', () => {
  dbTest('rolls back publishing writes when a target is invalid', async ({ db }) => {
    const id = randomUUID()
    await db.insert(announcements).values({
      id,
      type: 'notice',
      title: 'Draft',
      visibility: 'all',
      contentJson: { type: 'doc', content: [{ type: 'paragraph' }] },
      contentText: '',
      contentHtml: '<p></p>',
    })
    const role = await createSystemRoleFixture(db, {
      name: 'Disabled',
      code: 'disabled-publish-target',
      status: ROLE_STATUS_DISABLED,
    })
    await expect(
      createAnnouncementRepository(db).update(id, {
        publish: true,
        visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
        targets: [{ targetType: ANNOUNCEMENT_TARGET_TYPE_ROLE, targetId: role.id }],
      }),
    ).rejects.toThrow(AnnouncementInvalidTargetError)
    const [row] = await db.select().from(announcements).where(eq(announcements.id, id))
    expect(row).toMatchObject({
      status: ANNOUNCEMENT_STATUS_DRAFT,
      visibility: 'all',
      publishedAt: null,
    })
    expect(
      await db.select().from(announcementTargets).where(eq(announcementTargets.announcementId, id)),
    ).toEqual([])
  })
})
