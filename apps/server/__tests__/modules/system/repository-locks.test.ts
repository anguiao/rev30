import { describe, expect, it } from 'vitest'
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

function createThenableQuery<T>(events: string[], getRows: (table: unknown) => T[]) {
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
    where() {
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

  const db = {
    transaction(operation: (tx: unknown) => Promise<unknown>) {
      events.push('transaction')

      return operation(db)
    },
    select() {
      return createThenableQuery(events, getSelectRows)
    },
    insert(table: unknown) {
      events.push(`insert:${tableEventName(table)}`)

      return {
        values() {
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
        set() {
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

  return db as unknown as Db
}

describe('system repository locks', () => {
  it('locks active departments before creating user department relations', async () => {
    const events: string[] = []
    const repository = createUserRepository(createLockTrackingDb(events))

    await repository.create(
      {
        username: 'ada',
        nickname: 'Ada Lovelace',
        status: 1,
        departmentIds: [departmentId],
      },
      'password-hash',
    )

    expect(events.indexOf('lock:update')).toBeGreaterThanOrEqual(0)
    expect(events.indexOf('lock:update')).toBeLessThan(events.indexOf('insert:userDepartments'))
  })

  it('locks the department row before soft deleting it', async () => {
    const events: string[] = []
    const repository = createDepartmentRepository(createLockTrackingDb(events))

    await repository.softDelete(departmentId)

    expect(events.indexOf('lock:update')).toBeGreaterThanOrEqual(0)
    expect(events.indexOf('lock:update')).toBeLessThan(events.indexOf('update:departments'))
  })
})
