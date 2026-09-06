import {
  resourceTreeResponseSchema,
  resourceSchema,
  type Resource,
  type ResourceCreateInput,
  type ResourceUpdateInput,
  resourceTreeOptionsResponseSchema,
  type ResourceTreeOptionsResponse,
  type ResourceTreeResponse,
} from '@rev30/contracts'
import { api } from '../../api'
import { assertApiResponseOk, normalizeRequestQuery, parseApiResponse } from '../../utils/request'

export async function getResourceTree(): Promise<ResourceTreeResponse> {
  return parseApiResponse(await api.system.resources.tree.$get(), resourceTreeResponseSchema)
}

export async function getResourceTreeOptions(
  includeIds: string[] = [],
): Promise<ResourceTreeOptionsResponse> {
  return parseApiResponse(
    await api.system.resources.options.tree.$get({
      query: normalizeRequestQuery({ includeIds: includeIds.join(',') }),
    }),
    resourceTreeOptionsResponseSchema,
  )
}

export async function getResource(id: string): Promise<Resource> {
  return parseApiResponse(await api.system.resources[':id'].$get({ param: { id } }), resourceSchema)
}

export async function createResource(input: ResourceCreateInput): Promise<Resource> {
  return parseApiResponse(await api.system.resources.$post({ json: input }), resourceSchema)
}

export async function updateResource(id: string, input: ResourceUpdateInput): Promise<Resource> {
  return parseApiResponse(
    await api.system.resources[':id'].$patch({ param: { id }, json: input }),
    resourceSchema,
  )
}

export async function deleteResource(id: string): Promise<void> {
  await assertApiResponseOk(await api.system.resources[':id'].$delete({ param: { id } }))
}
