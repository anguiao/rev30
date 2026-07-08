import type { Db } from '../../../db'
import { ConfigNotFoundError } from './errors'
import { findConfigSpec, parseConfigValue } from './registry'
import { createConfigRepository } from './repository'

export async function readNumberConfigValue(database: Db, key: string) {
  const spec = findConfigSpec(key)
  if (!spec) {
    throw new ConfigNotFoundError()
  }

  const repository = createConfigRepository(database)
  const override = await repository.find(key)
  const parsed = parseConfigValue(spec, override?.value ?? spec.defaultValue)

  if (typeof parsed !== 'number') {
    throw new Error(`系统配置 ${key} 不是数字类型`)
  }

  return parsed
}
