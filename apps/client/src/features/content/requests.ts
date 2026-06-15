import {
  announcementListResponseSchema,
  announcementMyDetailSchema,
  announcementMyListResponseSchema,
  announcementSchema,
  builtinIconListResponseSchema,
  builtinIconSetListResponseSchema,
  customIconItemSchema,
  customIconListResponseSchema,
  customIconSetListResponseSchema,
  customIconSetSchema,
  customIconUploadResponseSchema,
  type Announcement,
  type AnnouncementCreateInput,
  type AnnouncementListQuery,
  type AnnouncementListResponse,
  type AnnouncementMyDetail,
  type AnnouncementMyListQuery,
  type AnnouncementMyListResponse,
  type AnnouncementUpdateInput,
  type BuiltinIconListResponse,
  type BuiltinIconSetListResponse,
  type CustomIconItem,
  type CustomIconListResponse,
  type CustomIconSet,
  type CustomIconSetCreateInput,
  type CustomIconSetListResponse,
  type CustomIconSetUpdateInput,
  type CustomIconUploadResponse,
  type IconSetIconListQuery,
  type IconSetListQuery,
  type IconSetRenameIconInput,
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

export async function listBuiltinIconSets(
  query: IconSetListQuery,
): Promise<BuiltinIconSetListResponse> {
  return parseApiResponse(
    await api['icon-sets'].builtin.$get({
      query: normalizeRequestQuery(query),
    }),
    builtinIconSetListResponseSchema,
  )
}

export async function listBuiltinIcons(
  query: IconSetIconListQuery,
): Promise<BuiltinIconListResponse> {
  return parseApiResponse(
    await api['icon-sets'].builtin.icons.$get({
      query: normalizeRequestQuery(query),
    }),
    builtinIconListResponseSchema,
  )
}

export async function listCustomIconSets(
  query: IconSetListQuery,
): Promise<CustomIconSetListResponse> {
  return parseApiResponse(
    await api['icon-sets'].custom.$get({
      query: normalizeRequestQuery(query),
    }),
    customIconSetListResponseSchema,
  )
}

export async function createCustomIconSet(input: CustomIconSetCreateInput): Promise<CustomIconSet> {
  return parseApiResponse(
    await api['icon-sets'].custom.$post({
      json: input,
    }),
    customIconSetSchema,
  )
}

export async function updateCustomIconSet(
  prefix: string,
  input: CustomIconSetUpdateInput,
): Promise<CustomIconSet> {
  return parseApiResponse(
    await api['icon-sets'].custom[':prefix'].$patch({
      param: { prefix },
      json: input,
    }),
    customIconSetSchema,
  )
}

export async function deleteCustomIconSet(prefix: string): Promise<void> {
  await assertApiResponseOk(
    await api['icon-sets'].custom[':prefix'].$delete({
      param: { prefix },
    }),
  )
}

export async function listCustomIcons(
  query: IconSetIconListQuery,
): Promise<CustomIconListResponse> {
  return parseApiResponse(
    await api['icon-sets'].custom.icons.$get({
      query: normalizeRequestQuery(query),
    }),
    customIconListResponseSchema,
  )
}

export async function uploadCustomIcons(
  prefix: string,
  input: {
    duplicateStrategy: 'skip' | 'replace'
    files: File[]
  },
): Promise<CustomIconUploadResponse> {
  const formData = new FormData()
  formData.set('duplicateStrategy', input.duplicateStrategy)

  for (const file of input.files) {
    formData.append('files', file)
  }

  return parseApiResponse(
    await api['icon-sets'].custom[':prefix'].icons.$post(
      {
        param: { prefix },
      },
      {
        init: {
          body: formData,
        },
      },
    ),
    customIconUploadResponseSchema,
  )
}

export async function renameCustomIcon(
  prefix: string,
  name: string,
  input: IconSetRenameIconInput,
): Promise<CustomIconItem> {
  return parseApiResponse(
    await api['icon-sets'].custom[':prefix'].icons[':name'].$patch({
      param: { prefix, name },
      json: input,
    }),
    customIconItemSchema,
  )
}

export async function deleteCustomIcon(prefix: string, name: string): Promise<void> {
  await assertApiResponseOk(
    await api['icon-sets'].custom[':prefix'].icons[':name'].$delete({
      param: { prefix, name },
    }),
  )
}

export function getCustomIconSetExportUrl(prefix: string) {
  return `/api/icon-sets/custom/${encodeURIComponent(prefix)}/export`
}
