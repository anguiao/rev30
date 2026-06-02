<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { useQuery, useQueryCache } from '@pinia/colada'
import { useClipboard } from '@vueuse/core'
import type { DataTableColumns } from 'naive-ui'
import {
  NAlert,
  NButton,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NPagination,
  NSelect,
  NTag,
  NTreeSelect,
  useDialog,
  useMessage,
} from 'naive-ui'
import type { ButtonProps } from 'naive-ui'
import type {
  UserCreateResponse,
  UserListItem,
  UserListQuery,
  UserListResponse,
} from '@rev30/contracts'
import { useAdminPageTitle } from '../../../composables/useAdminPageTitle'
import UserFormDrawer from '../../../features/system/UserFormDrawer.vue'
import { UserAvatar } from '../../../features/users'
import {
  STATUS_FILTER_ALL,
  deleteUser,
  formatDateTime,
  getDepartmentTreeOptions,
  getRoleOptions,
  getSystemErrorMessage,
  listUsers,
  resetUserPassword,
  statusFilterOptions,
  statusLabels,
  statusTagTypes,
  type StatusFilter,
} from '../../../features/system'
import {
  renderTableActionButton,
  renderTableActions,
  toSelectOptions,
  toTreeOptions,
} from '../../../utils/ui'

const pageTitle = useAdminPageTitle('系统用户')

const message = useMessage()
const dialog = useDialog()
const queryCache = useQueryCache()

const keyword = ref('')
const status = ref<StatusFilter>(STATUS_FILTER_ALL)
const departmentId = ref<string | null>(null)
const roleId = ref<string | null>(null)
const query = ref<UserListQuery>({
  page: 1,
  pageSize: 20,
})
const emptyUsersData: UserListResponse = {
  list: [],
  total: 0,
  page: 1,
  pageSize: query.value.pageSize,
}

const {
  data: usersResponse,
  error: usersError,
  isLoading,
} = useQuery({
  key: () => [
    'system',
    'users',
    'list',
    query.value.page,
    query.value.pageSize,
    query.value.keyword ?? '',
    query.value.status ?? null,
    query.value.departmentId ?? null,
    query.value.roleId ?? null,
  ],
  placeholderData: () => emptyUsersData,
  query: () => listUsers(query.value),
})

const { data: departmentFilterOptionsData } = useQuery({
  key: () => ['system', 'users', 'department-filter-options'],
  placeholderData: () => [],
  query: () => getDepartmentTreeOptions(),
})
const departmentFilterOptions = computed(() =>
  toTreeOptions(departmentFilterOptionsData.value ?? [], {
    label: (department) => `${department.name} (${department.code})`,
  }),
)

const { data: roleFilterOptionsData } = useQuery({
  key: () => ['system', 'users', 'role-filter-options'],
  placeholderData: () => [],
  query: () => getRoleOptions(),
})
const roleFilterOptions = computed(() =>
  toSelectOptions(roleFilterOptionsData.value ?? [], {
    label: (role) => `${role.name} (${role.code})`,
    value: (role) => role.id,
  }),
)

function handleSearch() {
  const nextKeyword = keyword.value.trim()

  query.value = {
    page: 1,
    pageSize: query.value.pageSize,
    ...(nextKeyword.length > 0 ? { keyword: nextKeyword } : {}),
    ...(status.value !== STATUS_FILTER_ALL ? { status: status.value } : {}),
    ...(departmentId.value === null ? {} : { departmentId: departmentId.value }),
    ...(roleId.value === null ? {} : { roleId: roleId.value }),
  } satisfies UserListQuery
}

function handleReset() {
  keyword.value = ''
  status.value = STATUS_FILTER_ALL
  departmentId.value = null
  roleId.value = null
  query.value = {
    page: 1,
    pageSize: query.value.pageSize,
  }
}

const usersData = computed(() => usersResponse.value ?? emptyUsersData)
const loadErrorMessage = computed(() =>
  usersError.value === null ? '' : getSystemErrorMessage(usersError.value, '加载系统用户失败'),
)

const isUserDrawerVisible = ref(false)
const editingUserId = ref<string | null>(null)
function openUserFormDrawer(userId: string | null = null) {
  editingUserId.value = userId
  isUserDrawerVisible.value = true
}
async function invalidateUserListQueries() {
  await queryCache.invalidateQueries({
    key: ['system', 'users', 'list'],
  })
}
async function handleUserSaved(result?: UserCreateResponse) {
  message.success('保存系统用户成功')
  await invalidateUserListQueries()

  if (result !== undefined) {
    showTemporaryPasswordDialog(
      result.user.nickname || result.user.username,
      result.temporaryPassword,
    )
  }
}

function confirmDeleteUser(user: UserListItem) {
  const positiveButtonProps: ButtonProps & Record<string, unknown> = {
    type: 'error',
    'data-test': 'users-delete-confirm',
  }

  dialog.warning({
    title: '确认删除',
    content: `确定删除系统用户“${user.nickname || user.username}”吗？`,
    positiveText: '删除',
    negativeText: '取消',
    positiveButtonProps,
    async onPositiveClick() {
      try {
        await deleteUser(user.id)

        message.success('删除系统用户成功')
        await invalidateUserListQueries()
      } catch (error) {
        message.error(getSystemErrorMessage(error, '删除系统用户失败'))
        return false
      }
    },
  })
}

function confirmResetUserPassword(user: UserListItem) {
  const positiveButtonProps: ButtonProps & Record<string, unknown> = {
    'data-test': 'users-reset-password-confirm',
  }

  dialog.warning({
    title: '确认重置密码',
    content: `确定重置系统用户“${user.nickname || user.username}”的密码吗？`,
    positiveText: '重置密码',
    negativeText: '取消',
    positiveButtonProps,
    async onPositiveClick() {
      try {
        const result = await resetUserPassword(user.id)
        showTemporaryPasswordDialog(user.nickname || user.username, result.temporaryPassword)
      } catch (error) {
        message.error(getSystemErrorMessage(error, '重置密码失败'))
        return false
      }
    },
  })
}

function summarizeNames(items: Array<{ name: string }>) {
  const names = items.map((item) => item.name)

  if (names.length === 0) {
    return '-'
  }

  if (names.length <= 2) {
    return names.join('、')
  }

  return `${names.slice(0, 2).join('、')}等 ${names.length} 个`
}

function formatContact(user: UserListItem) {
  return user.email ?? user.phone ?? '-'
}

const { copied, copy } = useClipboard()
function showTemporaryPasswordDialog(username: string, temporaryPassword: string) {
  dialog.info({
    title: '临时密码',
    showIcon: false,
    content: () =>
      h('div', { class: 'space-y-4' }, [
        h(
          'p',
          { class: 'text-sm text-stone-600 dark:text-zinc-300' },
          `系统用户 ${username} 的临时密码只会显示一次。`,
        ),
        h('div', { class: 'flex items-center gap-3' }, [
          h(NInput, {
            'data-test': 'temporary-password',
            class: 'min-w-0 flex-1',
            readonly: true,
            value: temporaryPassword,
          }),
          h(
            NButton,
            {
              'data-test': 'temporary-password-copy',
              class: 'w-24!',
              onClick: () => copy(temporaryPassword),
            },
            {
              default: () =>
                copied.value
                  ? h('span', { class: 'inline-flex items-center' }, [
                      h('span', { class: 'relative -left-0.5 i-[lucide--check] text-sm' }),
                      '已复制',
                    ])
                  : '点击复制',
            },
          ),
        ]),
      ]),
  })
}

const columns: DataTableColumns<UserListItem> = [
  {
    title: '用户名',
    key: 'username',
    minWidth: 180,
    render: (user) =>
      h('div', { class: 'flex items-center gap-3' }, [
        h(UserAvatar, {
          avatarId: user.avatarId,
          nickname: user.nickname,
          username: user.username,
          size: 32,
        }),
        h('span', { class: 'min-w-0 truncate' }, user.username),
      ]),
  },
  {
    title: '昵称',
    key: 'nickname',
    width: 180,
  },
  {
    title: '联系方式',
    key: 'contact',
    minWidth: 200,
    render: (user) => formatContact(user),
  },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render: (user) =>
      h(
        NTag,
        {
          type: statusTagTypes[user.status],
          bordered: false,
        },
        () => statusLabels[user.status],
      ),
  },
  {
    title: '部门',
    key: 'departments',
    minWidth: 240,
    render: (user) => summarizeNames(user.departments),
  },
  {
    title: '角色',
    key: 'roles',
    minWidth: 220,
    render: (user) => summarizeNames(user.roles),
  },
  {
    title: '创建时间',
    key: 'createdAt',
    minWidth: 160,
    render: (user) => formatDateTime(user.createdAt),
  },
  {
    title: '操作',
    key: 'actions',
    width: 180,
    fixed: 'right',
    render: (user) =>
      user.builtIn
        ? renderTableActions([])
        : renderTableActions([
            renderTableActionButton({
              label: '编辑',
              accessCode: [
                'system:user:update',
                'system:user:list',
                'system:department:list',
                'system:role:list',
              ],
              onClick: () => openUserFormDrawer(user.id),
              testId: 'users-edit',
            }),
            renderTableActionButton({
              label: '重置密码',
              accessCode: 'system:user:reset-password',
              onClick: () => confirmResetUserPassword(user),
              testId: 'users-reset-password',
            }),
            renderTableActionButton({
              label: '删除',
              accessCode: 'system:user:delete',
              onClick: () => confirmDeleteUser(user),
              type: 'error',
              testId: 'users-delete',
            }),
          ]),
  },
]
</script>

<template>
  <main class="space-y-5">
    <header class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold">{{ pageTitle }}</h1>
        <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">共 {{ usersData.total }} 个</p>
      </div>
      <NButton
        v-can.all="['system:user:create', 'system:department:list', 'system:role:list']"
        data-test="users-create"
        type="primary"
        @click="openUserFormDrawer()"
      >
        新增系统用户
      </NButton>
    </header>

    <section
      class="rounded-ui border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <NForm inline label-placement="left" :show-feedback="false" class="items-center gap-y-3">
        <NFormItem label="关键词">
          <NInput
            v-model:value="keyword"
            data-test="users-keyword"
            clearable
            placeholder="请输入关键词"
            class="w-64!"
          />
        </NFormItem>
        <NFormItem label="部门">
          <NTreeSelect
            v-model:value="departmentId"
            data-test="users-department"
            clearable
            filterable
            default-expand-all
            :options="departmentFilterOptions"
            placeholder="全部"
            class="w-56!"
          />
        </NFormItem>
        <NFormItem label="角色">
          <NSelect
            v-model:value="roleId"
            data-test="users-role"
            clearable
            filterable
            :options="roleFilterOptions"
            placeholder="全部"
            class="w-56!"
          />
        </NFormItem>
        <NFormItem label="状态">
          <NSelect
            v-model:value="status"
            data-test="users-status"
            :options="statusFilterOptions"
            placeholder="全部"
            class="w-40!"
          />
        </NFormItem>
        <div class="flex gap-2">
          <NButton data-test="users-search" type="primary" @click="handleSearch">查询</NButton>
          <NButton @click="handleReset">重置</NButton>
        </div>
      </NForm>
    </section>

    <NAlert v-if="loadErrorMessage" type="error">{{ loadErrorMessage }}</NAlert>

    <section>
      <NDataTable
        :columns="columns"
        :data="usersData.list"
        :loading="isLoading"
        :pagination="false"
        :row-key="(user: UserListItem) => user.id"
      />

      <div class="mt-4 flex justify-end">
        <NPagination
          v-model:page="query.page"
          :page-size="query.pageSize"
          :item-count="usersData.total"
        />
      </div>
    </section>

    <UserFormDrawer
      v-model:show="isUserDrawerVisible"
      :user-id="editingUserId"
      @saved="handleUserSaved"
    />
  </main>
</template>
