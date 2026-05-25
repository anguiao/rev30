import { RESOURCE_TYPE_MENU } from '@rev30/contracts'
import { api } from '../../src/api'

const roleQuery: Parameters<typeof api.system.roles.$get>[0] = {
  query: {
    page: '1',
    pageSize: '20',
    keyword: 'admin',
    status: '1',
  },
}

const userQuery: Parameters<typeof api.system.users.$get>[0] = {
  query: {
    page: '1',
    pageSize: '20',
    keyword: 'ada',
    status: '1',
    departmentId: '4be2dfda-2fd6-4ee5-b06b-c551328bc343',
    roleId: '875dd9cb-488b-43d7-a55f-6db070a8e83f',
  },
}

const roleCreateInput: Parameters<typeof api.system.roles.$post>[0] = {
  json: {
    name: 'Administrator',
    code: 'admin',
    resourceIds: ['4be2dfda-2fd6-4ee5-b06b-c551328bc343'],
  },
}

const invalidUserQuery: Parameters<typeof api.system.users.$get>[0] = {
  query: {
    // @ts-expect-error Unknown query params should not be accepted by the RPC contract.
    unknown: 'value',
  },
}

const userCreateWithDepartmentIds: Parameters<typeof api.system.users.$post>[0] = {
  json: {
    username: 'department-client',
    nickname: 'Department Client',
    email: null,
    phone: null,
    departmentIds: ['4be2dfda-2fd6-4ee5-b06b-c551328bc343'],
  },
}

const userCreateWithRoleIds = {
  json: {
    username: 'role-user',
    nickname: 'Role User',
    email: null,
    phone: null,
    roleIds: ['875dd9cb-488b-43d7-a55f-6db070a8e83f'],
  },
} satisfies Parameters<typeof api.system.users.$post>[0]

const invalidResourceQuery: Parameters<typeof api.system.resources.$get>[0] = {
  query: {
    // @ts-expect-error Unknown query params should not be accepted by the RPC contract.
    unknown: 'value',
  },
}

const resourceCreateMenuInput: Parameters<typeof api.system.resources.$post>[0] = {
  json: {
    type: RESOURCE_TYPE_MENU,
    name: '系统用户',
    code: 'system:user',
    path: '/system/users',
    externalUrl: null,
    icon: null,
  },
}

void [
  roleQuery,
  userQuery,
  roleCreateInput,
  invalidUserQuery,
  userCreateWithDepartmentIds,
  userCreateWithRoleIds,
  invalidResourceQuery,
  resourceCreateMenuInput,
]
