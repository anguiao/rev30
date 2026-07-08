import { eq, inArray } from 'drizzle-orm'
import type { Db } from '../../../db'
import { systemConfigOverrides } from '../../../db/schema'

export function createConfigRepository(database: Db) {
  return {
    async listByKeys(keys: readonly string[]) {
      if (keys.length === 0) {
        return []
      }

      return database
        .select()
        .from(systemConfigOverrides)
        .where(inArray(systemConfigOverrides.key, [...keys]))
    },

    async findByKey(key: string) {
      const [row] = await database
        .select()
        .from(systemConfigOverrides)
        .where(eq(systemConfigOverrides.key, key))
        .limit(1)

      return row
    },

    async upsert(key: string, value: string) {
      const [row] = await database
        .insert(systemConfigOverrides)
        .values({ key, value })
        .onConflictDoUpdate({
          target: systemConfigOverrides.key,
          set: {
            updatedAt: new Date(),
            value,
          },
        })
        .returning()

      if (!row) {
        throw new Error('保存系统配置覆盖值失败')
      }

      return row
    },

    async deleteByKey(key: string) {
      await database.delete(systemConfigOverrides).where(eq(systemConfigOverrides.key, key))
    },
  }
}
