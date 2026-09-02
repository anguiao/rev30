import { sql } from 'drizzle-orm'
import type { Db } from '../../db'

export async function probeDatabase(database: Db): Promise<void> {
  await database.execute(sql`SELECT 1`)
}
