import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterAll, beforeAll, onTestFinished } from 'vitest'
import { migratePGlite } from '../../src/db/migrate'
import { relations } from '../../src/db/relations'

const rollbackTestTransaction = Symbol('rollback test transaction')

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, reject, resolve }
}

async function createMigratedTestDb() {
  const client = new PGlite()

  await migratePGlite(client)

  return {
    client,
    database: drizzle({ client, relations }),
  }
}

type TestDatabase = Awaited<ReturnType<typeof createMigratedTestDb>>['database']

const migratedTestDbPromise = createMigratedTestDb()

beforeAll(async () => {
  await migratedTestDbPromise
})

afterAll(async () => {
  const { client } = await migratedTestDbPromise

  await client.close()
})

export async function createTestDb() {
  const { database } = await migratedTestDbPromise
  const transactionReady = createDeferred<TestDatabase>()
  const rollbackSignal = createDeferred<never>()

  const transactionRun = database.transaction(async (transaction) => {
    transactionReady.resolve(transaction as unknown as TestDatabase)
    await rollbackSignal.promise
  })
  const transactionCompletion = transactionRun.catch((error) => {
    if (error !== rollbackTestTransaction) {
      throw error
    }
  })
  transactionRun.catch(transactionReady.reject)
  const transaction = await transactionReady.promise

  onTestFinished(async () => {
    rollbackSignal.reject(rollbackTestTransaction)
    await transactionCompletion
  })

  return transaction
}
