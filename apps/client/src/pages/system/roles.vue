<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { useQuery } from '@pinia/colada'
import type { DataTableColumns, SelectOption } from 'naive-ui'
import { NAlert, NButton, NDataTable, NInput, NPagination, NSelect, NSpace, NTag } from 'naive-ui'
import {
  ROLE_STATUS_DISABLED,
  ROLE_STATUS_ENABLED,
  type RoleListItem,
  type RoleListQuery,
} from '@rev30/shared'
import { formatDateTime, statusLabels, statusTagTypes } from '../../features/system/labels'
import { getSystemErrorMessage, listRoles } from '../../features/system/requests'

type RoleStatusFilter = typeof ROLE_STATUS_ENABLED | typeof ROLE_STATUS_DISABLED | 'all'

const keyword = ref('')
const status = ref<RoleStatusFilter>('all')
const query = ref<RoleListQuery>({
  page: 1,
  pageSize: 20,
})

const rolesQuery = useQuery({
  key: () => [
    'system',
    'roles',
    query.value.page,
    query.value.pageSize,
    query.value.keyword ?? '',
    query.value.status ?? null,
  ],
  query: () => listRoles(query.value),
})

const isLoading = computed(() => rolesQuery.asyncStatus.value === 'loading')
const roles = computed(() => rolesQuery.state.value.data?.list ?? [])
const total = computed(() => rolesQuery.state.value.data?.total ?? 0)
const loadErrorMessage = computed(() => {
  if (rolesQuery.state.value.status !== 'error') {
    return ''
  }

  return getSystemErrorMessage(rolesQuery.state.value.error, '加载角色失败')
})

const statusOptions: SelectOption[] = [
  { label: '全部', value: 'all' },
  { label: '启用', value: ROLE_STATUS_ENABLED },
  { label: '禁用', value: ROLE_STATUS_DISABLED },
]

function buildNextQuery(targetPage: number) {
  const nextKeyword = keyword.value.trim()

  return {
    page: targetPage,
    pageSize: query.value.pageSize,
    ...(nextKeyword.length > 0 ? { keyword: nextKeyword } : {}),
    ...(status.value !== 'all' ? { status: status.value } : {}),
  } satisfies RoleListQuery
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
  query.value = {
    ...query.value,
    page,
  }
}

function handleRefresh() {
  void rolesQuery.refresh()
}

const columns: DataTableColumns<RoleListItem> = [
  {
    title: '角色名',
    key: 'name',
    width: 160,
  },
  {
    title: '角色编码',
    key: 'code',
    width: 170,
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
    title: '用户数',
    key: 'userCount',
    width: 100,
  },
  {
    title: '排序',
    key: 'sortOrder',
    width: 100,
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
        <h1 class="text-xl font-semibold">角色管理</h1>
        <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">共 {{ total }} 个角色</p>
      </div>
      <NButton type="primary" secondary :loading="isLoading" @click="handleRefresh">刷新</NButton>
    </header>

    <section
      class="rounded-md border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <NSpace align="end" :size="12">
        <NInput
          v-model:value="keyword"
          data-test="roles-keyword"
          clearable
          placeholder="请输入角色名或编码"
          class="w-[260px]"
        />
        <NSelect
          v-model:value="status"
          data-test="roles-status"
          :options="statusOptions"
          placeholder="全部状态"
          class="w-[160px]"
        />
        <NButton data-test="roles-search" type="primary" @click="handleSearch">查询</NButton>
        <NButton @click="handleReset">重置</NButton>
      </NSpace>
    </section>

    <NAlert v-if="loadErrorMessage" type="error">{{ loadErrorMessage }}</NAlert>

    <section
      class="rounded-md border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <NDataTable
        :columns="columns"
        :data="roles"
        :loading="isLoading"
        :pagination="false"
        :row-key="(row: RoleListItem) => row.id"
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
