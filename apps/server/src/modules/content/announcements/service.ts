import type {
  AnnouncementCreateInput,
  AnnouncementListQuery,
  AnnouncementTarget,
  AnnouncementTargetOptionsQuery,
  AnnouncementTargetType,
  AnnouncementUpdateInput,
} from '@rev30/contracts'
import {
  ANNOUNCEMENT_STATUS_ARCHIVED,
  ANNOUNCEMENT_STATUS_DRAFT,
  ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT,
  ANNOUNCEMENT_TARGET_TYPE_ROLE,
  ANNOUNCEMENT_TARGET_TYPE_USER,
} from '@rev30/contracts'
import type { Db } from '../../../db'
import { createDepartmentService } from '../../system/departments/service'
import { createRoleService } from '../../system/roles/service'
import { createUserService } from '../../system/users/service'
import { AnnouncementDraftArchiveError, AnnouncementNotFoundError } from './errors'
import { toAnnouncement, toAnnouncementListItem } from './mapper'
import { createAnnouncementRepository } from './repository'

function getTargetIds(targets: AnnouncementTarget[], targetType: AnnouncementTargetType) {
  return targets
    .filter((target) => target.targetType === targetType)
    .map((target) => target.targetId)
}

export function createAnnouncementService(database: Db) {
  const repository = createAnnouncementRepository(database)
  const departmentService = createDepartmentService(database)
  const roleService = createRoleService(database)
  const userService = createUserService(database)

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

    async targetOptions(query: AnnouncementTargetOptionsQuery) {
      let targets: AnnouncementTarget[] = []

      if (query.announcementId !== undefined) {
        const announcement = await repository.findActiveById(query.announcementId)

        if (!announcement) {
          throw new AnnouncementNotFoundError()
        }

        targets = announcement.targets
      }

      const [users, departments, roles] = await Promise.all([
        userService.options({
          includeIds: getTargetIds(targets, ANNOUNCEMENT_TARGET_TYPE_USER),
        }),
        departmentService.treeOptions({
          includeIds: getTargetIds(targets, ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT),
        }),
        roleService.options({
          includeIds: getTargetIds(targets, ANNOUNCEMENT_TARGET_TYPE_ROLE),
        }),
      ])

      return { users, departments, roles }
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
