import {
  dictionaryListResponseSchema,
  dictionaryDetailSchema,
  dictionaryOptionsResponseSchema,
  type DictionaryListQuery,
  type DictionaryListResponse,
  type DictionaryDetail,
  type DictionaryCreateInput,
  type DictionaryUpdateInput,
  type DictionaryOptionsResponse,
} from '@rev30/contracts'
import { api } from '../../api'
import { assertApiResponseOk, normalizeRequestQuery, parseApiResponse } from '../../utils/request'

export async function listDictionaries(
  query: DictionaryListQuery,
): Promise<DictionaryListResponse> {
  return parseApiResponse(
    await api.system.dictionaries.$get({
      query: normalizeRequestQuery(query),
    }),
    dictionaryListResponseSchema,
  )
}

export async function getDictionary(id: string): Promise<DictionaryDetail> {
  return parseApiResponse(
    await api.system.dictionaries[':id'].$get({ param: { id } }),
    dictionaryDetailSchema,
  )
}

export async function createDictionary(input: DictionaryCreateInput): Promise<DictionaryDetail> {
  return parseApiResponse(
    await api.system.dictionaries.$post({ json: input }),
    dictionaryDetailSchema,
  )
}

export async function updateDictionary(
  id: string,
  input: DictionaryUpdateInput,
): Promise<DictionaryDetail> {
  return parseApiResponse(
    await api.system.dictionaries[':id'].$put({
      param: { id },
      json: input,
    }),
    dictionaryDetailSchema,
  )
}

export async function deleteDictionary(id: string): Promise<void> {
  await assertApiResponseOk(await api.system.dictionaries[':id'].$delete({ param: { id } }))
}

export async function getDictionaryOptions(codes: string[]): Promise<DictionaryOptionsResponse> {
  return parseApiResponse(
    await api.system.dictionaries.options.$get({
      query: normalizeRequestQuery({ codes: codes.join(',') }) as { codes: string },
    }),
    dictionaryOptionsResponseSchema,
  )
}
