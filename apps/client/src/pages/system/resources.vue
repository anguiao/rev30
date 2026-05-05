<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import { useQuery } from '@pinia/colada'
import type { DataTableColumns, DataTableRowKey, SelectOption } from 'naive-ui'
import { NAlert, NButton, NDataTable, NInput, NSelect, NSpace, NTag } from 'naive-ui'
import {
  RESOURCE_STATUS_DISABLED,
  RESOURCE_STATUS_ENABLED,
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_EXTERNAL,
  RESOURCE_TYPE_MENU,
  type ResourceTreeNode,
  type ResourceType,
} from '@rev30/shared'
import {
  formatDateTime,
  resourceTypeLabels,
  statusLabels,
  statusTagTypes,
} from '../../features/system/labels'
import { getResourceTree, getSystemErrorMessage } from '../../features/system/requests'
import { countTreeNodes, filterTree } from '../../features/system/tree'

type ResourceTypeFilter = ResourceType | 'all'
type ResourceStatusFilter = typeof RESOURCE_STATUS_ENABLED | typeof RESOURCE_STATUS_DISABLED | 'all'

type ResourceFilters = {
  keyword: string
  type: ResourceTypeFilter
  status: ResourceStatusFilter
}

type ResourceActiveFilters = {
  keyword: string
  type: ResourceType | null
  status: typeof RESOURCE_STATUS_ENABLED | typeof RESOURCE_STATUS_DISABLED | null
}

const filters = ref<ResourceFilters>({
  keyword: '',
  type: 'all',
  status: 'all',
})

const activeFilters = ref<ResourceActiveFilters>({
  keyword: '',
  type: null,
  status: null,
})

const resourceTreeQuery = useQuery({
  key: () => ['system', 'resources', 'tree'],
  query: () => getResourceTree(),
})

const isLoading = computed(() => resourceTreeQuery.asyncStatus.value === 'loading')
const rawTree = computed(() => resourceTreeQuery.state.value.data ?? [])
const loadErrorMessage = computed(() => {
  if (resourceTreeQuery.state.value.status !== 'error') {
    return ''
  }

  return getSystemErrorMessage(resourceTreeQuery.state.value.error, '加载资源失败')
})

const typeOptions: SelectOption[] = [
  { label: '全部', value: 'all' },
  { label: resourceTypeLabels[RESOURCE_TYPE_DIRECTORY], value: RESOURCE_TYPE_DIRECTORY },
  { label: resourceTypeLabels[RESOURCE_TYPE_MENU], value: RESOURCE_TYPE_MENU },
  { label: resourceTypeLabels[RESOURCE_TYPE_EXTERNAL], value: RESOURCE_TYPE_EXTERNAL },
  { label: resourceTypeLabels[RESOURCE_TYPE_ACTION], value: RESOURCE_TYPE_ACTION },
]

const statusOptions: SelectOption[] = [
  { label: '全部', value: 'all' },
  { label: '启用', value: RESOURCE_STATUS_ENABLED },
  { label: '禁用', value: RESOURCE_STATUS_DISABLED },
]

const rows = computed(() => {
  const normalizedKeyword = activeFilters.value.keyword.trim().toLowerCase()
  const hasKeyword = normalizedKeyword.length > 0
  const selectedType = activeFilters.value.type
  const selectedStatus = activeFilters.value.status

  return filterTree(rawTree.value, {
    matches: (node) => {
      const matchesKeyword =
        !hasKeyword ||
        node.name.toLowerCase().includes(normalizedKeyword) ||
        node.code.toLowerCase().includes(normalizedKeyword) ||
        node.path?.toLowerCase().includes(normalizedKeyword) === true ||
        node.externalUrl?.toLowerCase().includes(normalizedKeyword) === true
      const matchesType = selectedType === null || node.type === selectedType
      const matchesStatus = selectedStatus === null || node.status === selectedStatus

      return matchesKeyword && matchesType && matchesStatus
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
    type: filters.value.type === 'all' ? null : filters.value.type,
    status: filters.value.status === 'all' ? null : filters.value.status,
  }
}

function handleReset() {
  filters.value = {
    keyword: '',
    type: 'all',
    status: 'all',
  }
  activeFilters.value = {
    keyword: '',
    type: null,
    status: null,
  }
}

function handleRefresh() {
  void resourceTreeQuery.refresh()
}

function collectTreeIds(nodes: ResourceTreeNode[]): DataTableRowKey[] {
  return nodes.flatMap((node) => [node.id, ...collectTreeIds(node.children)])
}

function handleUpdateExpandedRowKeys(keys: DataTableRowKey[]) {
  expandedRowKeys.value = keys
}

function renderPathValue(row: ResourceTreeNode) {
  return row.path ?? row.externalUrl ?? '-'
}

const columns: DataTableColumns<ResourceTreeNode> = [
  {
    title: '资源名称',
    key: 'name',
    minWidth: 220,
  },
  {
    title: '资源编码',
    key: 'code',
    minWidth: 180,
  },
  {
    title: '类型',
    key: 'type',
    width: 100,
    render: (row) => resourceTypeLabels[row.type],
  },
  {
    title: '路径/外链',
    key: 'pathOrExternalUrl',
    minWidth: 220,
    render: (row) => renderPathValue(row),
  },
  {
    title: '隐藏',
    key: 'hidden',
    width: 90,
    render: (row) => (row.hidden ? '是' : '否'),
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
        <h1 class="text-xl font-semibold">资源管理</h1>
        <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">共 {{ visibleCount }} 个资源</p>
      </div>
      <NButton type="primary" secondary :loading="isLoading" @click="handleRefresh">刷新</NButton>
    </header>

    <section class="rounded-md border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <NSpace align="end" :size="12">
        <NInput
          v-model:value="filters.keyword"
          data-test="resources-keyword"
          clearable
          placeholder="请输入资源名称、编码、路径或外链"
          class="w-[280px]"
        />
        <NSelect
          v-model:value="filters.type"
          data-test="resources-type"
          :options="typeOptions"
          placeholder="全部类型"
          class="w-[160px]"
        />
        <NSelect
          v-model:value="filters.status"
          data-test="resources-status"
          :options="statusOptions"
          placeholder="全部状态"
          class="w-[160px]"
        />
        <NButton data-test="resources-search" type="primary" @click="handleSearch">查询</NButton>
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
        :row-key="(row: ResourceTreeNode) => row.id"
      />
    </section>
  </main>
</template>
