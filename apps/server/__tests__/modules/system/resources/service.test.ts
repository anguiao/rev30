import { describe, expect, it } from 'vitest'
import {
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_EXTERNAL,
} from '@rev30/shared'
import { createTestDb } from '../../../helpers/db'
import { createResourceService } from '../../../../src/modules/system/resources/service'

describe('resource service', () => {
  it('normalizes type-specific fields when creating resources directly', async () => {
    const database = await createTestDb()
    const service = createResourceService(database)

    const external = await service.create({
      type: RESOURCE_TYPE_EXTERNAL,
      name: 'Docs',
      code: 'system:docs',
      parentId: null,
      path: '/stale-path',
      externalUrl: 'https://example.com/docs',
      openTarget: RESOURCE_OPEN_TARGET_SELF,
      icon: null,
      hidden: false,
      status: 1,
      sortOrder: 0,
    })
    const directory = await service.create({
      type: RESOURCE_TYPE_DIRECTORY,
      name: 'System',
      code: 'system',
      parentId: null,
      path: '/stale-directory-path',
      externalUrl: 'https://example.com/system',
      openTarget: 'blank',
      icon: null,
      hidden: false,
      status: 1,
      sortOrder: 0,
    })

    expect(external).toMatchObject({
      type: RESOURCE_TYPE_EXTERNAL,
      path: null,
      externalUrl: 'https://example.com/docs',
      openTarget: RESOURCE_OPEN_TARGET_SELF,
    })
    expect(directory).toMatchObject({
      type: RESOURCE_TYPE_DIRECTORY,
      path: null,
      externalUrl: null,
      openTarget: RESOURCE_OPEN_TARGET_SELF,
    })
  })
})
