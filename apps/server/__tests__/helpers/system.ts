import { randomUUID } from 'node:crypto'
import {
  DEPARTMENT_STATUS_ENABLED,
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_DIRECTORY,
  ROLE_STATUS_ENABLED,
  USER_STATUS_ENABLED,
} from '@rev30/contracts'
import { systemDepartments, systemResources, systemRoles, systemUsers } from '../../src/db/schema'
import type { TestDatabase } from './db'

type WithDefaults<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

type SystemUserFixtureInput = WithDefaults<
  typeof systemUsers.$inferInsert,
  'id' | 'nickname' | 'status' | 'createdAt' | 'updatedAt'
>
type SystemDepartmentFixtureInput = WithDefaults<
  typeof systemDepartments.$inferInsert,
  'id' | 'status' | 'sortOrder' | 'createdAt' | 'updatedAt'
>
type SystemRoleFixtureInput = WithDefaults<
  typeof systemRoles.$inferInsert,
  'id' | 'status' | 'sortOrder' | 'createdAt' | 'updatedAt'
>
type SystemResourceFixtureInput = WithDefaults<
  typeof systemResources.$inferInsert,
  'id' | 'type' | 'openTarget' | 'hidden' | 'status' | 'sortOrder' | 'createdAt' | 'updatedAt'
>

const fixtureTime = new Date('2026-05-06T00:00:00.000Z')

export async function createSystemUserFixture(
  database: TestDatabase,
  input: SystemUserFixtureInput,
) {
  const {
    id = randomUUID(),
    nickname = `${input.username} Nickname`,
    status = USER_STATUS_ENABLED,
    createdAt = fixtureTime,
    updatedAt = fixtureTime,
    ...values
  } = input
  const [user] = await database
    .insert(systemUsers)
    .values({ id, nickname, status, createdAt, updatedAt, ...values })
    .returning()

  if (!user) {
    throw new Error(`Expected user ${input.username}`)
  }

  return user
}

export async function createSystemDepartmentFixture(
  database: TestDatabase,
  input: SystemDepartmentFixtureInput,
) {
  const {
    id = randomUUID(),
    status = DEPARTMENT_STATUS_ENABLED,
    sortOrder = 0,
    createdAt = fixtureTime,
    updatedAt = fixtureTime,
    ...values
  } = input
  const [department] = await database
    .insert(systemDepartments)
    .values({ id, status, sortOrder, createdAt, updatedAt, ...values })
    .returning()

  if (!department) {
    throw new Error(`Expected department ${input.code}`)
  }

  return department
}

export async function createSystemRoleFixture(
  database: TestDatabase,
  input: SystemRoleFixtureInput,
) {
  const {
    id = randomUUID(),
    status = ROLE_STATUS_ENABLED,
    sortOrder = 0,
    createdAt = fixtureTime,
    updatedAt = fixtureTime,
    ...values
  } = input
  const [role] = await database
    .insert(systemRoles)
    .values({ id, status, sortOrder, createdAt, updatedAt, ...values })
    .returning()

  if (!role) {
    throw new Error(`Expected role ${input.code}`)
  }

  return role
}

export async function createSystemResourceFixture(
  database: TestDatabase,
  input: SystemResourceFixtureInput,
) {
  const {
    id = randomUUID(),
    type = RESOURCE_TYPE_DIRECTORY,
    openTarget = RESOURCE_OPEN_TARGET_SELF,
    hidden = false,
    status = RESOURCE_STATUS_ENABLED,
    sortOrder = 0,
    createdAt = fixtureTime,
    updatedAt = fixtureTime,
    ...values
  } = input
  const [resource] = await database
    .insert(systemResources)
    .values({
      id,
      type,
      openTarget,
      hidden,
      status,
      sortOrder,
      createdAt,
      updatedAt,
      ...values,
    })
    .returning()

  if (!resource) {
    throw new Error(`Expected resource ${input.code}`)
  }

  return resource
}
