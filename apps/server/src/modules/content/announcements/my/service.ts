import type { AnnouncementMyListQuery, User } from '@rev30/contracts'
import type { Db } from '../../../../db'
import { MyAnnouncementNotFoundError } from './errors'
import { toMyAnnouncementDetail, toMyAnnouncementListItem } from './mapper'
import { createMyAnnouncementRepository } from './repository'

export function createMyAnnouncementService(database: Db) {
  const repository = createMyAnnouncementRepository(database)

  return {
    async list(currentUser: User, query: AnnouncementMyListQuery) {
      const result = await repository.list(currentUser, query)

      return {
        ...result,
        list: result.list.map(toMyAnnouncementListItem),
      }
    },

    async get(currentUser: User, id: string) {
      const announcement = await repository.findById(currentUser, id)

      if (!announcement) {
        throw new MyAnnouncementNotFoundError()
      }

      return toMyAnnouncementDetail(announcement)
    },
  }
}
