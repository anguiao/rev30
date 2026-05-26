import {
  announcementListResponseSchema,
  announcementMyDetailSchema,
  announcementMyListResponseSchema,
  announcementSchema,
  errorResponseSchema,
  type Announcement,
  type AnnouncementCreateInput,
  type AnnouncementListQuery,
  type AnnouncementListResponse,
  type AnnouncementMyDetail,
  type AnnouncementMyListQuery,
  type AnnouncementMyListResponse,
  type AnnouncementUpdateInput,
  type ErrorResponse,
} from '@rev30/contracts'
import type { z } from 'zod'
import { api } from '../../api'
import { normalizeRequestQuery } from '../../utils/request'

export class ContentRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly field?: ErrorResponse['field'],
  ) {
    super(message)
    this.name = 'ContentRequestError'
  }
}

async function parseContentError(response: Response): Promise<ContentRequestError> {
  try {
    const result = errorResponseSchema.safeParse(await response.json())

    return new ContentRequestError(
      response.status,
      result.success ? result.data.message : '请求失败',
      result.success ? result.data.field : undefined,
    )
  } catch {
    return new ContentRequestError(response.status, '请求失败')
  }
}

async function parseContentResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  if (!response.ok) {
    throw await parseContentError(response)
  }

  return schema.parse(await response.json())
}

export function getContentErrorMessage(error: unknown, fallback: string) {
  return error instanceof ContentRequestError ? error.message : fallback
}

export async function listAnnouncements(
  query: AnnouncementListQuery,
): Promise<AnnouncementListResponse> {
  return parseContentResponse(
    await api.content.announcements.$get({
      query: normalizeRequestQuery(query),
    }),
    announcementListResponseSchema,
  )
}

export async function getAnnouncement(id: string): Promise<Announcement> {
  return parseContentResponse(
    await api.content.announcements[':id'].$get({ param: { id } }),
    announcementSchema,
  )
}

export async function createAnnouncement(input: AnnouncementCreateInput): Promise<Announcement> {
  return parseContentResponse(
    await api.content.announcements.$post({ json: input }),
    announcementSchema,
  )
}

export async function updateAnnouncement(
  id: string,
  input: AnnouncementUpdateInput,
): Promise<Announcement> {
  return parseContentResponse(
    await api.content.announcements[':id'].$patch({ param: { id }, json: input }),
    announcementSchema,
  )
}

export async function publishAnnouncement(id: string): Promise<void> {
  const response = await api.content.announcements[':id'].publish.$post({ param: { id } })

  if (!response.ok) {
    throw await parseContentError(response)
  }
}

export async function archiveAnnouncement(id: string): Promise<void> {
  const response = await api.content.announcements[':id'].archive.$post({ param: { id } })

  if (!response.ok) {
    throw await parseContentError(response)
  }
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const response = await api.content.announcements[':id'].$delete({ param: { id } })

  if (!response.ok) {
    throw await parseContentError(response)
  }
}

export async function listMyAnnouncements(
  query: AnnouncementMyListQuery,
): Promise<AnnouncementMyListResponse> {
  return parseContentResponse(
    await api.content.announcements.my.$get({
      query: normalizeRequestQuery(query),
    }),
    announcementMyListResponseSchema,
  )
}

export async function getMyAnnouncement(id: string): Promise<AnnouncementMyDetail> {
  return parseContentResponse(
    await api.content.announcements.my[':id'].$get({ param: { id } }),
    announcementMyDetailSchema,
  )
}
