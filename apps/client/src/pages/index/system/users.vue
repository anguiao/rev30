<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { useQuery } from '@pinia/colada'
import type { DataTableColumns } from 'naive-ui'
import {
  NAlert,
  NButton,
  NDataTable,
  NFlex,
  NInput,
  NPagination,
  NSelect,
  NTag,
  useDialog,
  useMessage,
} from 'naive-ui'
import type { ButtonProps } from 'naive-ui'
import type { UserListItem, UserListQuery, UserListResponse } from '@rev30/shared'
import UserFormDrawer from '../../../features/system/UserFormDrawer.vue'
import {
  STATUS_FILTER_ALL,
  deleteUser,
  formatDateTime,
  getSystemErrorMessage,
  listUsers,
  statusLabels,
  statusOptions,
  statusTagTypes,
  type StatusFilter,
} from '../../../features/system'
import { renderTableActionButton, renderTableActions } from '../../../utils/ui'

const dialog = useDialog()
const message = useMessage()
const keyword = ref('')
const status = ref<StatusFilter>(STATUS_FILTER_ALL)
const userDrawerVisible = ref(false)
const editingUserId = ref<string | null>(null)
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
  refetch,
} = useQuery({
  key: () => [
    'system',
    'users',
    query.value.page,
    query.value.pageSize,
    query.value.keyword ?? '',
    query.value.status ?? null,
  ],
  placeholderData: () => emptyUsersData,
  query: () => listUsers(query.value),
})

const usersData = computed(() => usersResponse.value ?? emptyUsersData)
const loadErrorMessage = computed(() =>
  usersError.value === null ? '' : getSystemErrorMessage(usersError.value, '加载用户失败'),
)

async function refreshUsers() {
  await refetch()
}

function openEditUserDrawer(userId: string) {
  editingUserId.value = userId
  userDrawerVisible.value = true
}

function confirmDeleteUser(user: UserListItem) {
  const positiveButtonProps: ButtonProps & Record<string, unknown> = {
    type: 'error',
    'data-test': 'users-delete-confirm',
  }

  dialog.warning({
    title: '确认删除',
    content: `确定删除用户“${user.nickname || user.username}”吗？`,
    positiveText: '删除',
    negativeText: '取消',
    positiveButtonProps,
    async onPositiveClick() {
      try {
        await deleteUser(user.id)
        message.success('删除用户成功')
        await refreshUsers()
      } catch (error) {
        message.error(getSystemErrorMessage(error, '删除用户失败'))
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

function handleSearch() {
  const nextKeyword = keyword.value.trim()

  query.value = {
    page: 1,
    pageSize: query.value.pageSize,
    ...(nextKeyword.length > 0 ? { keyword: nextKeyword } : {}),
    ...(status.value !== STATUS_FILTER_ALL ? { status: status.value } : {}),
  } satisfies UserListQuery
}

function handleReset() {
  keyword.value = ''
  status.value = STATUS_FILTER_ALL
  query.value = {
    page: 1,
    pageSize: query.value.pageSize,
  }
}

const columns: DataTableColumns<UserListItem> = [
  {
    title: '用户名',
    key: 'username',
    width: 140,
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
    width: 120,
    fixed: 'right',
    render: (user) =>
      renderTableActions([
        renderTableActionButton({
          label: '编辑',
          accessCode: 'system:user:update',
          onClick: () => openEditUserDrawer(user.id),
          testId: 'users-edit',
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
        <h1 class="text-xl font-semibold">用户管理</h1>
        <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">
          共 {{ usersData.total }} 个用户
        </p>
      </div>
      <NButton v-can="'system:user:create'" data-test="users-create" type="primary">
        新增用户
      </NButton>
    </header>

    <section
      class="rounded-ui border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <NFlex align="end" size="medium">
        <NInput
          v-model:value="keyword"
          data-test="users-keyword"
          clearable
          placeholder="请输入用户名或昵称"
          class="w-64!"
        />
        <NSelect
          v-model:value="status"
          data-test="users-status"
          :options="statusOptions"
          placeholder="全部状态"
          class="w-40!"
        />
        <NButton data-test="users-search" type="primary" @click="handleSearch">查询</NButton>
        <NButton @click="handleReset">重置</NButton>
      </NFlex>
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
      v-model:show="userDrawerVisible"
      :user-id="editingUserId"
      @saved="refreshUsers"
    />
  </main>
</template>
