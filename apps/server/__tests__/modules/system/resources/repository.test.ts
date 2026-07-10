import { describe, expect, it } from 'vitest'
import {
  RESOURCE_OPEN_TARGET_BLANK,
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_EXTERNAL,
  RESOURCE_TYPE_MENU,
} from '@rev30/contracts'
import { ResourceMoveConflictError } from '../../../../src/modules/system/resources/errors'
import { createResourceRepository } from '../../../../src/modules/system/resources/repository'
import { createTestDb } from '../../../helpers/db'

describe('resource repository', () => {
  it('validates deep moves and normalizes final type fields inside update transactions', async () => {
    const database = await createTestDb()
    const repository = createResourceRepository(database)
    const root = await repository.create({
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'repository-system',
      parentId: null,
      path: null,
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
      icon: null,
      hidden: false,
      status: RESOURCE_STATUS_ENABLED,
      sortOrder: 0,
    })
    const child = await repository.create({
      type: RESOURCE_TYPE_MENU,
      name: 'Users',
      code: 'repository-system:user',
      parentId: root.id,
      path: '/system/users',
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
      icon: null,
      hidden: false,
      status: RESOURCE_STATUS_ENABLED,
      sortOrder: 0,
    })
    const grandchild = await repository.create({
      type: RESOURCE_TYPE_ACTION,
      name: 'Export Users',
      code: 'repository-system:user:export',
      parentId: child.id,
      path: null,
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
      icon: null,
      hidden: false,
      status: RESOURCE_STATUS_ENABLED,
      sortOrder: 0,
    })

    await expect(repository.update(root.id, { parentId: grandchild.id })).rejects.toBeInstanceOf(
      ResourceMoveConflictError,
    )
    await expect(repository.findActiveById(root.id)).resolves.toMatchObject({ parentId: null })

    await expect(
      repository.update(child.id, {
        type: RESOURCE_TYPE_EXTERNAL,
        externalUrl: ' https://example.com/users ',
      }),
    ).resolves.toMatchObject({
      type: RESOURCE_TYPE_EXTERNAL,
      path: null,
      externalUrl: 'https://example.com/users',
      openTarget: RESOURCE_OPEN_TARGET_BLANK,
    })
  })
})
