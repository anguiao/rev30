<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { useQuery } from '@pinia/colada'
import type { DataTableColumns } from 'naive-ui'
import { NAlert, NButton, NDataTable, NInput, NPagination, NSelect, NSpace, NTag } from 'naive-ui'
import type { UserListItem, UserListQuery, UserListResponse } from '@rev30/shared'
import {
  STATUS_FILTER_ALL,
  formatDateTime,
  getSystemErrorMessage,
  listUsers,
  statusLabels,
  statusOptions,
  statusTagTypes,
  type StatusFilter,
} from '../../../features/system'

const keyword = ref('')
const status = ref<StatusFilter>(STATUS_FILTER_ALL)
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

function handleRefresh() {
  void refetch()
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
]
</script>

<template>
  <main class="space-y-5">
    <header>
      <div>
        <h1 class="text-xl font-semibold">用户管理</h1>
        <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">
          共 {{ usersData.total }} 个用户
        </p>
      </div>
    </header>

    <section
      class="rounded-md border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <NSpace align="end" :size="12">
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
        <NButton v-can="'system:user:list'" data-test="users-refresh" @click="handleRefresh">
          刷新
        </NButton>
        <NButton @click="handleReset">重置</NButton>
      </NSpace>
    </section>

    <NAlert v-if="loadErrorMessage" type="error">{{ loadErrorMessage }}</NAlert>

    <section
      class="rounded-md border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
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
  </main>
</template>
