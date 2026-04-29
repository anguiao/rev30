import { describe, expect, it } from 'vitest'
import { USER_STATUS_ENABLED } from '@rev30/shared'
import { createTestDb } from '../../../test/db'
import { SystemUserConflictError, createSystemUserService } from './service'

describe('system user service', () => {
  it('raises a field conflict when creating a duplicate username', async () => {
    const database = await createTestDb()
    const service = createSystemUserService(database)

    await service.create({
      username: 'ada',
      nickname: 'Ada Lovelace',
      status: USER_STATUS_ENABLED,
    })

    await expect(
      service.create({
        username: 'ada',
        nickname: 'Duplicate Ada',
        status: USER_STATUS_ENABLED,
      }),
    ).rejects.toMatchObject({
      field: 'username',
      message: 'username already exists',
    })

    await expect(
      service.create({
        username: 'ada',
        nickname: 'Another Ada',
        status: USER_STATUS_ENABLED,
      }),
    ).rejects.toBeInstanceOf(SystemUserConflictError)
  })
})
