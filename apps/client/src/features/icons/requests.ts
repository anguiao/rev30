import {
  type IconSearchQuery,
  type IconSearchResponse,
  iconSearchResponseSchema,
  builtinIconListResponseSchema,
  builtinIconSetListResponseSchema,
  customIconItemSchema,
  customIconListResponseSchema,
  customIconSetListResponseSchema,
  customIconSetSchema,
  customIconUploadResponseSchema,
  type BuiltinIconListResponse,
  type BuiltinIconSetListResponse,
  type CustomIconItem,
  type CustomIconListResponse,
  type CustomIconSet,
  type CustomIconSetCreateInput,
  type CustomIconSetListResponse,
  type CustomIconSetUpdateInput,
  type CustomIconUploadResponse,
  type CustomIconUploadMetadata,
  type CustomIconUpdateInput,
  type IconSetIconListQuery,
  type IconSetListQuery,
} from '@rev30/contracts'
import { api } from '../../api'
import { normalizeRequestQuery, parseApiResponse, assertApiResponseOk } from '../../utils/request'

export async function searchIcons(query: IconSearchQuery): Promise<IconSearchResponse> {
  return parseApiResponse(
    await api.icons.search.$get({
      query: normalizeRequestQuery(query),
    }),
    iconSearchResponseSchema,
  )
}

export async function listBuiltinIconSets(
  query: IconSetListQuery,
): Promise<BuiltinIconSetListResponse> {
  return parseApiResponse(
    await api.content['icon-sets'].builtin.$get({
      query: normalizeRequestQuery(query),
    }),
    builtinIconSetListResponseSchema,
  )
}

export async function listBuiltinIcons(
  query: IconSetIconListQuery,
): Promise<BuiltinIconListResponse> {
  return parseApiResponse(
    await api.content['icon-sets'].builtin.icons.$get({
      query: normalizeRequestQuery(query),
    }),
    builtinIconListResponseSchema,
  )
}

export async function listCustomIconSets(
  query: IconSetListQuery,
): Promise<CustomIconSetListResponse> {
  return parseApiResponse(
    await api.content['icon-sets'].custom.$get({
      query: normalizeRequestQuery(query),
    }),
    customIconSetListResponseSchema,
  )
}

export async function getCustomIconSet(prefix: string): Promise<CustomIconSet> {
  return parseApiResponse(
    await api.content['icon-sets'].custom[':prefix'].$get({
      param: { prefix },
    }),
    customIconSetSchema,
  )
}

export async function createCustomIconSet(input: CustomIconSetCreateInput): Promise<CustomIconSet> {
  return parseApiResponse(
    await api.content['icon-sets'].custom.$post({
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
    await api.content['icon-sets'].custom[':prefix'].$patch({
      param: { prefix },
      json: input,
    }),
    customIconSetSchema,
  )
}

export async function deleteCustomIconSet(prefix: string): Promise<void> {
  await assertApiResponseOk(
    await api.content['icon-sets'].custom[':prefix'].$delete({
      param: { prefix },
    }),
  )
}

export async function listCustomIcons(
  query: IconSetIconListQuery,
): Promise<CustomIconListResponse> {
  return parseApiResponse(
    await api.content['icon-sets'].custom.icons.$get({
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
    metadata?: CustomIconUploadMetadata
  },
): Promise<CustomIconUploadResponse> {
  return parseApiResponse(
    await api.content['icon-sets'].custom[':prefix'].icons.$post({
      param: { prefix },
      form: {
        duplicateStrategy: input.duplicateStrategy,
        files: input.files,
        ...(input.metadata === undefined ? {} : { metadata: JSON.stringify(input.metadata) }),
      },
    }),
    customIconUploadResponseSchema,
  )
}

export async function updateCustomIcon(
  prefix: string,
  name: string,
  input: CustomIconUpdateInput,
): Promise<CustomIconItem> {
  return parseApiResponse(
    await api.content['icon-sets'].custom[':prefix'].icons[':name'].$patch({
      param: { prefix, name },
      json: input,
    }),
    customIconItemSchema,
  )
}

export async function deleteCustomIcon(prefix: string, name: string): Promise<void> {
  await assertApiResponseOk(
    await api.content['icon-sets'].custom[':prefix'].icons[':name'].$delete({
      param: { prefix, name },
    }),
  )
}

export async function exportCustomIconSet(prefix: string) {
  const response = await api.content['icon-sets'].custom[':prefix'].export.$get({
    param: { prefix },
  })
  await assertApiResponseOk(response)

  const contentDisposition = response.headers.get('content-disposition')
  const filename = contentDisposition?.match(/filename="([^"]+)"/)?.[1] ?? `${prefix}.json`

  return {
    blob: await response.blob(),
    filename,
  }
}
