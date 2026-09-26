import { describe, expect, it, vi } from 'vitest'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { Db } from '../../../src/db'
import { systemDepartments, systemUserDepartments, systemUsers } from '../../../src/db/schema'
import { createDepartmentRepository } from '../../../src/modules/system/departments/repository'
import { createUserRepository } from '../../../src/modules/system/users/repository'

const departmentId = '4be2dfda-2fd6-4ee5-b06b-c551328bc343'
const userId = 'd5f2d7ac-15ee-4d71-8c47-65963c62d07f'
const now = new Date('2026-05-04T00:00:00.000Z')

function tableEventName(table: unknown) {
  if (table === systemDepartments) {
    return 'departments'
  }

  if (table === systemUsers) {
    return 'users'
  }

  if (table === systemUserDepartments) {
    return 'userDepartments'
  }

  return 'unknown'
}

function createThenableQuery<T>(
  events: string[],
  getRows: (table: unknown) => T[],
  lockQueries: ReturnType<PgDialect['sqlToQuery']>[],
) {
  let condition: SQL | undefined
  let rows: T[] = []
  const query = {
    from(table: unknown) {
      events.push(`select:${tableEventName(table)}`)
      rows = getRows(table)

      return query
    },
    innerJoin() {
      return query
    },
    where(nextCondition: SQL | undefined) {
      condition = nextCondition
      return query
    },
    orderBy() {
      return Promise.resolve(rows)
    },
    limit() {
      return query
    },
    for(strength: string) {
      events.push(`lock:${strength}`)
      lockQueries.push(new PgDialect().sqlToQuery(condition!))

      return query
    },
    then<TResult1 = T[], TResult2 = never>(
      onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(rows).then(onfulfilled, onrejected)
    },
  }

  return query
}

function createLockTrackingDb(events: string[]) {
  const lockQueries: ReturnType<PgDialect['sqlToQuery']>[] = []
  const insertValues = vi.fn()
  const updateValues = vi.fn()
  let departmentSelects = 0
  const departmentRow = {
    id: departmentId,
    parentId: null,
    name: 'Engineering',
    code: 'engineering',
    status: 1,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  const userRow = {
    id: userId,
    username: 'ada',
    nickname: 'Ada Lovelace',
    email: null,
    phone: null,
    status: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  function getSelectRows(table: unknown) {
    if (table === systemDepartments) {
      departmentSelects += 1

      return departmentSelects === 1 ? [departmentRow] : []
    }

    return []
  }

  const tx = {
    select() {
      return createThenableQuery(events, getSelectRows, lockQueries)
    },
    insert(table: unknown) {
      events.push(`insert:${tableEventName(table)}`)

      return {
        values(value: unknown) {
          insertValues(table, value)
          return {
            returning() {
              return Promise.resolve(table === systemUsers ? [userRow] : [])
            },
            then<TResult1 = unknown[], TResult2 = never>(
              onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
              onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
            ) {
              return Promise.resolve([]).then(onfulfilled, onrejected)
            },
          }
        },
      }
    },
    update(table: unknown) {
      events.push(`update:${tableEventName(table)}`)

      return {
        set(value: unknown) {
          updateValues(table, value)
          return this
        },
        where() {
          return this
        },
        returning() {
          return Promise.resolve([departmentRow])
        },
      }
    },
    delete(table: unknown) {
      events.push(`delete:${tableEventName(table)}`)

      return {
        where() {
          return Promise.resolve([])
        },
      }
    },
  }

  const database = {
    transaction(operation: (transaction: typeof tx) => Promise<unknown>) {
      events.push('transaction')
      return operation(tx)
    },
  } as unknown as Db

  return { database, lockQueries, insertValues, updateValues }
}

describe('system repository lock query intent', () => {
  // Builder mocks verify transaction usage and SQL intent, not database mutual exclusion.
  it('requests the active department update lock through the transaction before inserting relations', async () => {
    const events: string[] = []
    const { database, lockQueries, insertValues } = createLockTrackingDb(events)
    const repository = createUserRepository(database)

    await repository.create(
      {
        username: 'ada',
        nickname: 'Ada Lovelace',
        avatarId: null,
        status: 1,
        departmentIds: [departmentId],
      },
      'password-hash',
      { accessCodes: [], isAdmin: true },
    )

    expect(events.indexOf('lock:update')).toBeGreaterThanOrEqual(0)
    expect(events.indexOf('lock:update')).toBeLessThan(events.indexOf('insert:userDepartments'))
    expect(lockQueries).toHaveLength(1)
    expect(lockQueries[0]?.params).toEqual([departmentId])
    expect(lockQueries[0]?.sql).toContain('"system_departments"."id" =')
    expect(lockQueries[0]?.sql).toContain('"system_departments"."deleted_at" is null')
    expect(insertValues).toHaveBeenCalledWith(systemUserDepartments, [{ userId, departmentId }])
  })

  it('requests the active department update lock through the transaction before soft deletion', async () => {
    const events: string[] = []
    const { database, lockQueries, updateValues } = createLockTrackingDb(events)
    const repository = createDepartmentRepository(database)

    await repository.softDelete(departmentId)

    expect(events.indexOf('lock:update')).toBeGreaterThanOrEqual(0)
    expect(events.indexOf('lock:update')).toBeLessThan(events.indexOf('update:departments'))
    expect(lockQueries).toHaveLength(1)
    expect(lockQueries[0]?.params).toEqual([departmentId])
    expect(lockQueries[0]?.sql).toContain('"system_departments"."id" =')
    expect(lockQueries[0]?.sql).toContain('"system_departments"."deleted_at" is null')
    expect(updateValues).toHaveBeenCalledWith(systemDepartments, {
      deletedAt: expect.any(Date),
      updatedAt: expect.any(Date),
    })
  })
})
