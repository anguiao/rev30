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
  ANNOUNCEMENT_STATUS_PUBLISHED,
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

  async function assertPublishableVisibility(
    input: {
      visibility: Announcement['visibility']
      targets: AnnouncementTarget[]
    },
    options: {
      validateTargets?: boolean
    } = {},
  ) {
    if (
      input.visibility !== ANNOUNCEMENT_VISIBILITY_ALL &&
      input.targets.length === 0
    ) {
      throw new AnnouncementVisibilityTargetRequiredError()
    }

    if (options.validateTargets === true && input.targets.length > 0) {
      const targetsValid = await repository.validateTargets(input.targets)

      if (!targetsValid) {
        throw new AnnouncementInvalidTargetError()
      }
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
        await assertPublishableVisibility(normalizedInput, { validateTargets: true })
      }
      else if (
        normalizedInput.targets.length > 0 &&
        !(await repository.validateTargets(normalizedInput.targets))
      ) {
        throw new AnnouncementInvalidTargetError()
      }

      return toAnnouncement(await repository.create(normalizedInput))
    },

    async update(id: string, input: AnnouncementUpdateInput) {
      const existingAnnouncement = await repository.findActiveById(id)

      if (!existingAnnouncement) {
        throw new AnnouncementNotFoundError()
      }

      const finalState = normalizeVisibilityTargets({
        visibility:
          input.visibility ??
          (existingAnnouncement.announcement.visibility as Announcement['visibility']),
        targets: input.targets ?? existingAnnouncement.targets,
      })
      const shouldValidatePublishableState =
        existingAnnouncement.announcement.status === ANNOUNCEMENT_STATUS_PUBLISHED ||
        input.publish === true

      if (shouldValidatePublishableState) {
        await assertPublishableVisibility(finalState, { validateTargets: true })
      }

      const normalizedInput = {
        ...input,
        targets: finalState.targets,
      }

      if (
        !shouldValidatePublishableState &&
        input.targets !== undefined &&
        normalizedInput.targets.length > 0 &&
        !(await repository.validateTargets(normalizedInput.targets))
      ) {
        throw new AnnouncementInvalidTargetError()
      }

      const updated = await repository.update(id, normalizedInput)

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

      await assertPublishableVisibility(
        normalizeVisibilityTargets({
          visibility: existingAnnouncement.announcement.visibility as Announcement['visibility'],
          targets: existingAnnouncement.targets,
        }),
        { validateTargets: true },
      )

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
