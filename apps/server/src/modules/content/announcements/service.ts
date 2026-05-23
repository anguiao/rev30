import type {
  AnnouncementCreateInput,
  AnnouncementListQuery,
  AnnouncementUpdateInput,
} from '@rev30/shared'
import {
  ANNOUNCEMENT_STATUS_ARCHIVED,
  ANNOUNCEMENT_STATUS_DRAFT,
  ANNOUNCEMENT_STATUS_PUBLISHED,
} from '@rev30/shared'
import type { Db } from '../../../db'
import { deriveAnnouncementContentText } from './content'
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
      const now = new Date()
      const contentText = deriveAnnouncementContentText(input.contentJson)
      const createInput: Parameters<typeof repository.create>[0] = {
        type: input.type,
        title: input.title,
        contentJson: input.contentJson,
        contentText,
        status: input.publish ? ANNOUNCEMENT_STATUS_PUBLISHED : ANNOUNCEMENT_STATUS_DRAFT,
        pinned: input.pinned,
        publishedAt: input.publish ? now : null,
        ...(input.summary === undefined ? {} : { summary: input.summary }),
      }

      return toAnnouncement(await repository.create(createInput))
    },

    async update(id: string, input: AnnouncementUpdateInput) {
      const existingAnnouncement = await repository.findActiveById(id)

      if (!existingAnnouncement) {
        throw new AnnouncementNotFoundError()
      }

      const nextUpdate: Parameters<typeof repository.update>[1] = {
        ...(input.type === undefined ? {} : { type: input.type }),
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.summary === undefined ? {} : { summary: input.summary }),
        ...(input.pinned === undefined ? {} : { pinned: input.pinned }),
        ...(input.contentJson === undefined
          ? {}
          : {
              contentJson: input.contentJson,
              contentText: deriveAnnouncementContentText(input.contentJson),
            }),
        ...(input.publish
          ? {
              status: ANNOUNCEMENT_STATUS_PUBLISHED,
              publishedAt: new Date(),
            }
          : {}),
      }

      const updated = await repository.update(id, nextUpdate)

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

      const updated = await repository.update(id, {
        status: ANNOUNCEMENT_STATUS_PUBLISHED,
        publishedAt: new Date(),
      })

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

      const updated = await repository.update(id, {
        status: ANNOUNCEMENT_STATUS_ARCHIVED,
      })

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
