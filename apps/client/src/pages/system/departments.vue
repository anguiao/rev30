<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import { useQuery } from '@pinia/colada'
import type { DataTableColumns, DataTableRowKey, SelectOption } from 'naive-ui'
import { NAlert, NButton, NDataTable, NInput, NSelect, NSpace, NTag } from 'naive-ui'
import {
  DEPARTMENT_STATUS_DISABLED,
  DEPARTMENT_STATUS_ENABLED,
  type DepartmentTreeNode,
} from '@rev30/shared'
import { formatDateTime, statusLabels, statusTagTypes } from '../../features/system/labels'
import { getSystemErrorMessage, getDepartmentTree } from '../../features/system/requests'
import { countTreeNodes, filterTree } from '../../features/system/tree'

type DepartmentStatusFilter = typeof DEPARTMENT_STATUS_ENABLED | typeof DEPARTMENT_STATUS_DISABLED | 'all'

type DepartmentFilters = {
  keyword: string
  status: DepartmentStatusFilter
}

type DepartmentActiveFilters = {
  keyword: string
  status: typeof DEPARTMENT_STATUS_ENABLED | typeof DEPARTMENT_STATUS_DISABLED | null
}

const filters = ref<DepartmentFilters>({
  keyword: '',
  status: 'all',
})

const activeFilters = ref<DepartmentActiveFilters>({
  keyword: '',
  status: null,
})

const departmentTreeQuery = useQuery({
  key: () => ['system', 'departments', 'tree'],
  query: () => getDepartmentTree(),
})

const isLoading = computed(() => departmentTreeQuery.asyncStatus.value === 'loading')
const rawTree = computed(() => departmentTreeQuery.state.value.data ?? [])
const loadErrorMessage = computed(() => {
  if (departmentTreeQuery.state.value.status !== 'error') {
    return ''
  }

  return getSystemErrorMessage(departmentTreeQuery.state.value.error, '加载部门失败')
})

const statusOptions: SelectOption[] = [
  { label: '全部', value: 'all' },
  { label: '启用', value: DEPARTMENT_STATUS_ENABLED },
  { label: '禁用', value: DEPARTMENT_STATUS_DISABLED },
]

const rows = computed(() => {
  const normalizedKeyword = activeFilters.value.keyword.trim().toLowerCase()
  const hasKeyword = normalizedKeyword.length > 0
  const selectedStatus = activeFilters.value.status

  return filterTree(rawTree.value, {
    matches: (node) => {
      const matchesKeyword =
        !hasKeyword ||
        node.name.toLowerCase().includes(normalizedKeyword) ||
        node.code.toLowerCase().includes(normalizedKeyword)
      const matchesStatus = selectedStatus === null || node.status === selectedStatus

      return matchesKeyword && matchesStatus
    },
  })
})

const visibleCount = computed(() => countTreeNodes(rows.value))
const expandedRowKeys = ref<DataTableRowKey[]>([])

watch(
  rows,
  (nextRows) => {
    expandedRowKeys.value = collectTreeIds(nextRows)
  },
  { immediate: true },
)

function handleSearch() {
  activeFilters.value = {
    keyword: filters.value.keyword.trim(),
    status: filters.value.status === 'all' ? null : filters.value.status,
  }
}

function handleReset() {
  filters.value = {
    keyword: '',
    status: 'all',
  }
  activeFilters.value = {
    keyword: '',
    status: null,
  }
}

function handleRefresh() {
  void departmentTreeQuery.refresh()
}

function collectTreeIds(nodes: DepartmentTreeNode[]): DataTableRowKey[] {
  return nodes.flatMap((node) => [node.id, ...collectTreeIds(node.children)])
}

function handleUpdateExpandedRowKeys(keys: DataTableRowKey[]) {
  expandedRowKeys.value = keys
}

const columns: DataTableColumns<DepartmentTreeNode> = [
  {
    title: '部门名称',
    key: 'name',
    minWidth: 220,
  },
  {
    title: '部门编码',
    key: 'code',
    width: 180,
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
    title: '排序',
    key: 'sortOrder',
    width: 100,
  },
  {
    title: '创建时间',
    key: 'createdAt',
    minWidth: 180,
    render: (row) => formatDateTime(row.createdAt),
  },
]
</script>

<template>
  <main class="space-y-5">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold">部门管理</h1>
        <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">共 {{ visibleCount }} 个部门</p>
      </div>
      <NButton type="primary" secondary :loading="isLoading" @click="handleRefresh">刷新</NButton>
    </header>

    <section class="rounded-md border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <NSpace align="end" :size="12">
        <NInput
          v-model:value="filters.keyword"
          data-test="departments-keyword"
          clearable
          placeholder="请输入部门名称或编码"
          class="w-[260px]"
        />
        <NSelect
          v-model:value="filters.status"
          data-test="departments-status"
          :options="statusOptions"
          placeholder="全部状态"
          class="w-[160px]"
        />
        <NButton data-test="departments-search" type="primary" @click="handleSearch">查询</NButton>
        <NButton @click="handleReset">重置</NButton>
      </NSpace>
    </section>

    <NAlert v-if="loadErrorMessage" type="error">{{ loadErrorMessage }}</NAlert>

    <section class="rounded-md border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <NDataTable
        :columns="columns"
        :data="rows"
        :loading="isLoading"
        :pagination="false"
        :expanded-row-keys="expandedRowKeys"
        @update:expanded-row-keys="handleUpdateExpandedRowKeys"
        :row-key="(row: DepartmentTreeNode) => row.id"
      />
    </section>
  </main>
</template>
