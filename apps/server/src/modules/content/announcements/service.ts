import type {
  Announcement,
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
  AnnouncementNotFoundError,
  AnnouncementVisibilityTargetRequiredError,
} from './errors'
import { toAnnouncement, toAnnouncementListItem } from './mapper'
import { createAnnouncementRepository } from './repository'

export function createAnnouncementService(database: Db) {
  const repository = createAnnouncementRepository(database)

  function normalizeVisibilityTargets(input: {
    visibility: Announcement['visibility']
    targets: AnnouncementTarget[]
  }) {
    if (input.visibility === ANNOUNCEMENT_VISIBILITY_ALL) {
      return {
        visibility: input.visibility,
        targets: [],
      }
    }

    return input
  }

  async function assertPublishableVisibility(input: {
    visibility: Announcement['visibility']
    targets: AnnouncementTarget[]
  }) {
    if (input.visibility !== ANNOUNCEMENT_VISIBILITY_ALL && input.targets.length === 0) {
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
      const normalizedInput = {
        ...input,
        ...normalizeVisibilityTargets({
          visibility: input.visibility,
          targets: input.targets,
        }),
      }

      if (normalizedInput.publish) {
        await assertPublishableVisibility(normalizedInput)
      }

      return toAnnouncement(await repository.create(normalizedInput))
    },

    async update(id: string, input: AnnouncementUpdateInput) {
      const updated = await repository.update(id, input)

      if (!updated) {
        throw new AnnouncementNotFoundError()
      }

      return toAnnouncement(updated)
    },

    async publish(id: string) {
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
