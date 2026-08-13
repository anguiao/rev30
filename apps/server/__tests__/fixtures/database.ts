import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFile } from 'node:fs/promises'
import { inject, test as baseTest } from 'vitest'
import { relations } from '../../src/db/relations'

const rollbackTestTransaction = Symbol('rollback test transaction')

async function restoreTestDb() {
  const snapshot = new Uint8Array(await readFile(inject('pgliteSnapshotPath')))
  const client = await PGlite.create({
    loadDataDir: new Blob([snapshot]),
  })

  return {
    client,
    database: drizzle({ client, relations }),
  }
}

type RestoredTestDb = Awaited<ReturnType<typeof restoreTestDb>>

export type TestDatabase = RestoredTestDb['database']

export const dbTest = baseTest.extend<{
  $file: { pglite: RestoredTestDb }
  $test: { db: TestDatabase }
}>({
  pglite: [
    // eslint-disable-next-line no-empty-pattern -- Vitest requires fixture dependencies to use object destructuring.
    async ({}, use) => {
      const testDb = await restoreTestDb()

      try {
        await use(testDb)
      } finally {
        await testDb.client.close()
      }
    },
    { scope: 'file' },
  ],
  db: async ({ pglite }, use) => {
    try {
      await pglite.database.transaction(async (transaction) => {
        await use(transaction as unknown as TestDatabase)
        throw rollbackTestTransaction
      })
    } catch (error) {
      if (error !== rollbackTestTransaction) {
        throw error
      }
    }
  },
})
