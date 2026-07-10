import { describe, expect, it } from 'vitest'
import { DEPARTMENT_STATUS_ENABLED } from '@rev30/contracts'
import { createDepartmentRepository } from '../../../../src/modules/system/departments/repository'
import { DepartmentMoveConflictError } from '../../../../src/modules/system/departments/errors'
import { createTestDb } from '../../../helpers/db'

describe('department repository', () => {
  it('rejects moving a department under a deep descendant inside the update transaction', async () => {
    const database = await createTestDb()
    const repository = createDepartmentRepository(database)
    const root = await repository.create({
      name: 'Company',
      code: 'repository-company',
      parentId: null,
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 0,
    })
    const child = await repository.create({
      name: 'Engineering',
      code: 'repository-engineering',
      parentId: root.id,
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 0,
    })
    const grandchild = await repository.create({
      name: 'Platform',
      code: 'repository-platform',
      parentId: child.id,
      status: DEPARTMENT_STATUS_ENABLED,
      sortOrder: 0,
    })

    await expect(repository.update(root.id, { parentId: grandchild.id })).rejects.toBeInstanceOf(
      DepartmentMoveConflictError,
    )
    await expect(repository.findActiveById(root.id)).resolves.toMatchObject({ parentId: null })
  })
})
