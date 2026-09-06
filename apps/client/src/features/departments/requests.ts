import {
  departmentSchema,
  departmentTreeResponseSchema,
  type Department,
  type DepartmentCreateInput,
  type DepartmentUpdateInput,
  departmentTreeOptionsResponseSchema,
  type DepartmentTreeOptionsResponse,
  type DepartmentTreeResponse,
} from '@rev30/contracts'
import { api } from '../../api'
import { assertApiResponseOk, normalizeRequestQuery, parseApiResponse } from '../../utils/request'

export async function getDepartmentTree(): Promise<DepartmentTreeResponse> {
  return parseApiResponse(await api.system.departments.tree.$get(), departmentTreeResponseSchema)
}

export async function getDepartmentTreeOptions(
  includeIds: string[] = [],
): Promise<DepartmentTreeOptionsResponse> {
  return parseApiResponse(
    await api.system.departments.options.tree.$get({
      query: normalizeRequestQuery({ includeIds: includeIds.join(',') }),
    }),
    departmentTreeOptionsResponseSchema,
  )
}

export async function getDepartment(id: string): Promise<Department> {
  return parseApiResponse(
    await api.system.departments[':id'].$get({ param: { id } }),
    departmentSchema,
  )
}

export async function createDepartment(input: DepartmentCreateInput): Promise<Department> {
  return parseApiResponse(await api.system.departments.$post({ json: input }), departmentSchema)
}

export async function updateDepartment(
  id: string,
  input: DepartmentUpdateInput,
): Promise<Department> {
  return parseApiResponse(
    await api.system.departments[':id'].$patch({
      param: { id },
      json: input,
    }),
    departmentSchema,
  )
}

export async function deleteDepartment(id: string): Promise<void> {
  await assertApiResponseOk(await api.system.departments[':id'].$delete({ param: { id } }))
}
