<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { useQuery } from '@pinia/colada'
import type { DataTableColumns, SelectOption } from 'naive-ui'
import {
  NAlert,
  NButton,
  NDataTable,
  NInput,
  NPagination,
  NSelect,
  NSpace,
  NTag,
} from 'naive-ui'
import {
  USER_STATUS_DISABLED,
  USER_STATUS_ENABLED,
  type User,
  type UserListQuery,
} from '@rev30/shared'
import { formatDateTime, statusLabels, statusTagTypes } from '../../features/system/labels'
import { getSystemErrorMessage, listUsers } from '../../features/system/requests'

type UserStatusFilter = typeof USER_STATUS_ENABLED | typeof USER_STATUS_DISABLED | 'all'

const keyword = ref('')
const status = ref<UserStatusFilter>('all')
const query = ref<UserListQuery>({
  page: 1,
  pageSize: 20,
})

const usersQuery = useQuery({
  key: () => [
    'system',
    'users',
    query.value.page,
    query.value.pageSize,
    query.value.keyword ?? '',
    query.value.status ?? null,
  ],
  query: () => listUsers(query.value),
})

const isLoading = computed(() => usersQuery.asyncStatus.value === 'loading')
const users = computed(() => usersQuery.state.value.data?.list ?? [])
const total = computed(() => usersQuery.state.value.data?.total ?? 0)
const loadErrorMessage = computed(() => {
  if (usersQuery.state.value.status !== 'error') {
    return ''
  }

  return getSystemErrorMessage(usersQuery.state.value.error, '加载用户失败')
})

const statusOptions: SelectOption[] = [
  { label: '全部', value: 'all' },
  { label: '启用', value: USER_STATUS_ENABLED },
  { label: '禁用', value: USER_STATUS_DISABLED },
]

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

function formatContact(user: User) {
  return user.email ?? user.phone ?? '-'
}

function buildNextQuery(targetPage: number) {
  const nextKeyword = keyword.value.trim()

  return {
    page: targetPage,
    pageSize: query.value.pageSize,
    ...(nextKeyword.length > 0 ? { keyword: nextKeyword } : {}),
    ...(status.value !== 'all' ? { status: status.value } : {}),
  } satisfies UserListQuery
}

function handleSearch() {
  query.value = buildNextQuery(1)
}

function handleReset() {
  keyword.value = ''
  status.value = 'all'
  query.value = {
    page: 1,
    pageSize: query.value.pageSize,
  }
}

function handlePageChange(page: number) {
  query.value = buildNextQuery(page)
}

function handleRefresh() {
  void usersQuery.refresh()
}

const columns: DataTableColumns<User> = [
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
    render: (row) => formatContact(row),
  },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render: (row) =>
      h(
        NTag,
        {
          type: statusTagTypes[row.status],
          bordered: false,
        },
        () => statusLabels[row.status],
      ),
  },
  {
    title: '部门',
    key: 'departments',
    minWidth: 240,
    render: (row) => summarizeNames(row.departments),
  },
  {
    title: '角色',
    key: 'roles',
    minWidth: 220,
    render: (row) => summarizeNames(row.roles),
  },
  {
    title: '创建时间',
    key: 'createdAt',
    minWidth: 160,
    render: (row) => formatDateTime(row.createdAt),
  },
]
</script>

<template>
  <main class="space-y-5">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold">用户管理</h1>
        <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">共 {{ total }} 个用户</p>
      </div>
      <NButton type="primary" secondary :loading="isLoading" @click="handleRefresh">刷新</NButton>
    </header>

    <section class="rounded-md border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <NSpace align="end" :size="12">
        <NInput
          v-model:value="keyword"
          data-test="users-keyword"
          clearable
          placeholder="请输入用户名或昵称"
          class="w-[260px]"
        />
        <NSelect
          v-model:value="status"
          data-test="users-status"
          :options="statusOptions"
          placeholder="全部状态"
          class="w-[160px]"
        />
        <NButton data-test="users-search" type="primary" @click="handleSearch">查询</NButton>
        <NButton @click="handleReset">重置</NButton>
      </NSpace>
    </section>

    <NAlert v-if="loadErrorMessage" type="error">{{ loadErrorMessage }}</NAlert>

    <section class="rounded-md border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <NDataTable
        :columns="columns"
        :data="users"
        :loading="isLoading"
        :pagination="false"
        :row-key="(row: User) => row.id"
      />

      <div class="mt-4 flex justify-end">
        <NPagination
          :page="query.page"
          :page-size="query.pageSize"
          :item-count="total"
          @update:page="handlePageChange"
        />
      </div>
    </section>
  </main>
</template>
