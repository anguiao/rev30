import type {
  AnnouncementCreateInput,
  AnnouncementListQuery,
  AnnouncementUpdateInput,
} from '@rev30/contracts'
import { ANNOUNCEMENT_STATUS_ARCHIVED, ANNOUNCEMENT_STATUS_DRAFT } from '@rev30/contracts'
import type { Db } from '../../../db'
import { AnnouncementDraftArchiveError, AnnouncementNotFoundError } from './errors'
import { toAnnouncement, toAnnouncementListItem } from './mapper'
import { createAnnouncementRepository } from './repository'

export function createAnnouncementService(database: Db) {
  const repository = createAnnouncementRepository(database)

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

      return toAnnouncement(announcement.announcement, announcement.targets)
    },

    async create(input: AnnouncementCreateInput) {
      const created = await repository.create(input)

      return toAnnouncement(created.announcement, created.targets)
    },

    async update(id: string, input: AnnouncementUpdateInput) {
      const updated = await repository.update(id, input)

      if (!updated) {
        throw new AnnouncementNotFoundError()
      }

      return toAnnouncement(updated.announcement, updated.targets)
    },

    async publish(id: string) {
      const updated = await repository.publish(id)

      if (!updated) {
        throw new AnnouncementNotFoundError()
      }
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
        return
      }

      const updated = await repository.archive(id)

      if (!updated) {
        throw new AnnouncementNotFoundError()
      }
    },

    async delete(id: string) {
      const deleted = await repository.softDelete(id)

      if (!deleted) {
        throw new AnnouncementNotFoundError()
      }
    },
  }
}
