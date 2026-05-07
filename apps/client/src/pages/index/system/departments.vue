<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import { useQuery } from '@pinia/colada'
import type { DataTableColumns, DataTableRowKey } from 'naive-ui'
import { NAlert, NButton, NDataTable, NFlex, NInput, NSelect, NTag } from 'naive-ui'
import type { DepartmentTreeNode } from '@rev30/shared'
import {
  STATUS_FILTER_ALL,
  countTreeNodes,
  filterTree,
  formatDateTime,
  getDepartmentTree,
  getSystemErrorMessage,
  statusLabels,
  statusOptions,
  statusTagTypes,
  type StatusFilter,
  type SystemStatus,
} from '../../../features/system'
import { renderTableActionButton, renderTableActions } from '../../../utils/ui'

type DepartmentFilters = {
  keyword: string
  status: StatusFilter
}

type DepartmentActiveFilters = {
  keyword: string
  status: SystemStatus | null
}

const filters = ref<DepartmentFilters>({
  keyword: '',
  status: STATUS_FILTER_ALL,
})

const activeFilters = ref<DepartmentActiveFilters>({
  keyword: '',
  status: null,
})
const emptyDepartmentTree: DepartmentTreeNode[] = []

const {
  data: departmentTree,
  error: departmentTreeError,
  isLoading,
} = useQuery({
  key: () => ['system', 'departments', 'tree'],
  placeholderData: () => emptyDepartmentTree,
  query: () => getDepartmentTree(),
})

const rawTree = computed(() => departmentTree.value ?? emptyDepartmentTree)
const loadErrorMessage = computed(() =>
  departmentTreeError.value === null
    ? ''
    : getSystemErrorMessage(departmentTreeError.value, '加载部门失败'),
)

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
    status: filters.value.status === STATUS_FILTER_ALL ? null : filters.value.status,
  }
}

function handleReset() {
  filters.value = {
    keyword: '',
    status: STATUS_FILTER_ALL,
  }
  activeFilters.value = {
    keyword: '',
    status: null,
  }
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
    render: (department) =>
      h(
        NTag,
        {
          type: statusTagTypes[department.status],
          bordered: false,
        },
        () => statusLabels[department.status],
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
    render: (department) => formatDateTime(department.createdAt),
  },
  {
    title: '操作',
    key: 'actions',
    width: 180,
    fixed: 'right',
    render: () =>
      renderTableActions([
        renderTableActionButton({
          label: '新增下级',
          accessCode: 'system:department:create',
          testId: 'departments-create-child',
        }),
        renderTableActionButton({
          label: '编辑',
          accessCode: 'system:department:update',
          testId: 'departments-edit',
        }),
        renderTableActionButton({
          label: '删除',
          accessCode: 'system:department:delete',
          type: 'error',
          testId: 'departments-delete',
        }),
      ]),
  },
]
</script>

<template>
  <main class="space-y-5">
    <header class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold">部门管理</h1>
        <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">共 {{ visibleCount }} 个部门</p>
      </div>
      <NButton v-can="'system:department:create'" data-test="departments-create" type="primary">
        新增部门
      </NButton>
    </header>

    <section
      class="rounded-ui border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <NFlex align="end" size="medium">
        <NInput
          v-model:value="filters.keyword"
          data-test="departments-keyword"
          clearable
          placeholder="请输入名称或编码"
          class="w-64!"
        />
        <NSelect
          v-model:value="filters.status"
          data-test="departments-status"
          :options="statusOptions"
          placeholder="全部状态"
          class="w-40!"
        />
        <NButton data-test="departments-search" type="primary" @click="handleSearch">查询</NButton>
        <NButton @click="handleReset">重置</NButton>
      </NFlex>
    </section>

    <NAlert v-if="loadErrorMessage" type="error">{{ loadErrorMessage }}</NAlert>

    <section>
      <NDataTable
        :columns="columns"
        :data="rows"
        :loading="isLoading"
        :pagination="false"
        :expanded-row-keys="expandedRowKeys"
        @update:expanded-row-keys="handleUpdateExpandedRowKeys"
        :row-key="(department: DepartmentTreeNode) => department.id"
      />
    </section>
  </main>
</template>
