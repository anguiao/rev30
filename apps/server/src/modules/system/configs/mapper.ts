import type { Config } from '@rev30/contracts'
import { systemConfigOverrides } from '../../../db/schema'
import type { ConfigSpec } from './registry'

export type ConfigOverrideRow = typeof systemConfigOverrides.$inferSelect

export function toConfig(spec: ConfigSpec, override: ConfigOverrideRow | undefined): Config {
  const customValue = override?.value ?? null

  return {
    key: spec.key,
    name: spec.name,
    description: spec.description,
    valueType: spec.valueType,
    defaultValue: spec.defaultValue,
    customValue,
    value: customValue ?? spec.defaultValue,
  }
}
