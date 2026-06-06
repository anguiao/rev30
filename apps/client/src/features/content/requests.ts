import {
  announcementListResponseSchema,
  announcementMyDetailSchema,
  announcementMyListResponseSchema,
  announcementSchema,
  type Announcement,
  type AnnouncementCreateInput,
  type AnnouncementListQuery,
  type AnnouncementListResponse,
  type AnnouncementMyDetail,
  type AnnouncementMyListQuery,
  type AnnouncementMyListResponse,
  type AnnouncementUpdateInput,
} from '@rev30/contracts'
import { api } from '../../api'
import { assertApiResponseOk, normalizeRequestQuery, parseApiResponse } from '../../utils/request'

export async function listAnnouncements(
  query: AnnouncementListQuery,
): Promise<AnnouncementListResponse> {
  return parseApiResponse(
    await api.content.announcements.$get({
      query: normalizeRequestQuery(query),
    }),
    announcementListResponseSchema,
  )
}

export async function getAnnouncement(id: string): Promise<Announcement> {
  return parseApiResponse(
    await api.content.announcements[':id'].$get({ param: { id } }),
    announcementSchema,
  )
}

export async function createAnnouncement(input: AnnouncementCreateInput): Promise<Announcement> {
  return parseApiResponse(
    await api.content.announcements.$post({ json: input }),
    announcementSchema,
  )
}

export async function updateAnnouncement(
  id: string,
  input: AnnouncementUpdateInput,
): Promise<Announcement> {
  return parseApiResponse(
    await api.content.announcements[':id'].$patch({ param: { id }, json: input }),
    announcementSchema,
  )
}

export async function publishAnnouncement(id: string): Promise<void> {
  await assertApiResponseOk(await api.content.announcements[':id'].publish.$post({ param: { id } }))
}

export async function archiveAnnouncement(id: string): Promise<void> {
  await assertApiResponseOk(await api.content.announcements[':id'].archive.$post({ param: { id } }))
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await assertApiResponseOk(await api.content.announcements[':id'].$delete({ param: { id } }))
}

export async function listMyAnnouncements(
  query: AnnouncementMyListQuery,
): Promise<AnnouncementMyListResponse> {
  return parseApiResponse(
    await api.content.announcements.my.$get({
      query: normalizeRequestQuery(query),
    }),
    announcementMyListResponseSchema,
  )
}

export async function getMyAnnouncement(id: string): Promise<AnnouncementMyDetail> {
  return parseApiResponse(
    await api.content.announcements.my[':id'].$get({ param: { id } }),
    announcementMyDetailSchema,
  )
}
