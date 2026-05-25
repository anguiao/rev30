import type {
  AnnouncementTarget,
  AnnouncementCreateInput,
  AnnouncementListQuery,
  AnnouncementUpdateInput,
} from '@rev30/contracts'
import {
  ANNOUNCEMENT_STATUS_ARCHIVED,
  ANNOUNCEMENT_STATUS_DRAFT,
  ANNOUNCEMENT_VISIBILITY_ALL,
} from '@rev30/contracts'
import type { Db } from '../../../db'
import {
  AnnouncementDraftArchiveError,
  AnnouncementInvalidTargetError,
  AnnouncementNotFoundError,
  AnnouncementVisibilityTargetRequiredError,
} from './errors'
import { toAnnouncement, toAnnouncementListItem } from './mapper'
import { createAnnouncementRepository } from './repository'

export function createAnnouncementService(database: Db) {
  const repository = createAnnouncementRepository(database)

  function assertPublishableVisibility(input: {
    publish: boolean | undefined
    visibility: string
    targets: AnnouncementTarget[]
  }) {
    if (
      input.publish === true &&
      input.visibility !== ANNOUNCEMENT_VISIBILITY_ALL &&
      input.targets.length === 0
    ) {
      throw new AnnouncementVisibilityTargetRequiredError()
    }
  }

  return {
    async list(query: AnnouncementListQuery) {
      const result = await repository.list(query)

      return {
        ...result,
        list: result.list.map(toAnnouncementListItem),
      }
    },

    async get(id: string) {
      const announcement = await repository.findActiveById(id)

      if (!announcement) {
        throw new AnnouncementNotFoundError()
      }

      return toAnnouncement(announcement)
    },

    async create(input: AnnouncementCreateInput) {
      assertPublishableVisibility(input)

      if (input.targets.length > 0 && !(await repository.validateTargets(input.targets))) {
        throw new AnnouncementInvalidTargetError()
      }

      return toAnnouncement(await repository.create(input))
    },

    async update(id: string, input: AnnouncementUpdateInput) {
      const existingAnnouncement = await repository.findActiveById(id)

      if (!existingAnnouncement) {
        throw new AnnouncementNotFoundError()
      }

      const mergedVisibility = input.visibility ?? existingAnnouncement.announcement.visibility
      const mergedTargets = input.targets ?? existingAnnouncement.targets

      assertPublishableVisibility({
        publish: input.publish,
        visibility: mergedVisibility,
        targets: mergedTargets,
      })

      if (input.targets !== undefined && input.targets.length > 0) {
        const targetsValid = await repository.validateTargets(input.targets)

        if (!targetsValid) {
          throw new AnnouncementInvalidTargetError()
        }
      }

      const updated = await repository.update(id, input)

      if (!updated) {
        throw new AnnouncementNotFoundError()
      }

      return toAnnouncement(updated)
    },

    async publish(id: string) {
      const existingAnnouncement = await repository.findActiveById(id)

      if (!existingAnnouncement) {
        throw new AnnouncementNotFoundError()
      }

      if (
        existingAnnouncement.announcement.visibility !== ANNOUNCEMENT_VISIBILITY_ALL &&
        existingAnnouncement.targets.length === 0
      ) {
        throw new AnnouncementVisibilityTargetRequiredError()
      }

      const updated = await repository.publish(id)

      if (!updated) {
        throw new AnnouncementNotFoundError()
      }

      return toAnnouncement(updated)
    },

    async archive(id: string) {
      const existingAnnouncement = await repository.findActiveById(id)

      if (!existingAnnouncement) {
        throw new AnnouncementNotFoundError()
      }

      if (existingAnnouncement.announcement.status === ANNOUNCEMENT_STATUS_DRAFT) {
        throw new AnnouncementDraftArchiveError()
      }

      if (existingAnnouncement.announcement.status === ANNOUNCEMENT_STATUS_ARCHIVED) {
        return toAnnouncement(existingAnnouncement)
      }

      const updated = await repository.archive(id)

      if (!updated) {
        throw new AnnouncementNotFoundError()
      }

      return toAnnouncement(updated)
    },

    async delete(id: string) {
      const deleted = await repository.softDelete(id)

      if (!deleted) {
        throw new AnnouncementNotFoundError()
      }
    },
  }
}
