import {
  configListResponseSchema,
  configSchema,
  type Config,
  type ConfigListResponse,
  type ConfigUpdateInput,
} from '@rev30/contracts'
import { api } from '../../api'
import { parseApiResponse } from '../../utils/request'

export async function listConfigs(): Promise<ConfigListResponse> {
  return parseApiResponse(await api.system.configs.$get(), configListResponseSchema)
}

export async function getConfig(key: string): Promise<Config> {
  return parseApiResponse(await api.system.configs[':key'].$get({ param: { key } }), configSchema)
}

export async function updateConfig(key: string, input: ConfigUpdateInput): Promise<Config> {
  return parseApiResponse(
    await api.system.configs[':key'].$put({ param: { key }, json: input }),
    configSchema,
  )
}
