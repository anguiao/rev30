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

      return toAnnouncement(announcement)
    },

    async create(input: AnnouncementCreateInput) {
      return toAnnouncement(await repository.create(input))
    },

    async update(id: string, input: AnnouncementUpdateInput) {
      const existingAnnouncement = await repository.findActiveById(id)

      if (!existingAnnouncement) {
        throw new AnnouncementNotFoundError()
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

      if (existingAnnouncement.status === ANNOUNCEMENT_STATUS_DRAFT) {
        throw new AnnouncementDraftArchiveError()
      }

      if (existingAnnouncement.status === ANNOUNCEMENT_STATUS_ARCHIVED) {
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
