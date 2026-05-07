<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import { useQuery } from '@pinia/colada'
import type { DataTableColumns, DataTableRowKey, SelectOption } from 'naive-ui'
import { NAlert, NButton, NDataTable, NFlex, NInput, NSelect, NTag } from 'naive-ui'
import {
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_EXTERNAL,
  RESOURCE_TYPE_MENU,
  type ResourceTreeNode,
  type ResourceType,
} from '@rev30/shared'
import {
  STATUS_FILTER_ALL,
  countTreeNodes,
  filterTree,
  formatDateTime,
  getResourceTree,
  getSystemErrorMessage,
  resourceTypeLabels,
  statusLabels,
  statusOptions,
  statusTagTypes,
  type StatusFilter,
  type SystemStatus,
} from '../../../features/system'
import { renderTableActionButton, renderTableActions } from '../../../utils/ui'

type ResourceTypeFilter = ResourceType | 'all'

type ResourceFilters = {
  keyword: string
  type: ResourceTypeFilter
  status: StatusFilter
}

type ResourceActiveFilters = {
  keyword: string
  type: ResourceType | null
  status: SystemStatus | null
}

const filters = ref<ResourceFilters>({
  keyword: '',
  type: 'all',
  status: STATUS_FILTER_ALL,
})

const activeFilters = ref<ResourceActiveFilters>({
  keyword: '',
  type: null,
  status: null,
})
const emptyResourceTree: ResourceTreeNode[] = []

const {
  data: resourceTree,
  error: resourceTreeError,
  isLoading,
} = useQuery({
  key: () => ['system', 'resources', 'tree'],
  placeholderData: () => emptyResourceTree,
  query: () => getResourceTree(),
})

const rawTree = computed(() => resourceTree.value ?? emptyResourceTree)
const loadErrorMessage = computed(() =>
  resourceTreeError.value === null
    ? ''
    : getSystemErrorMessage(resourceTreeError.value, '加载资源失败'),
)

const typeOptions: SelectOption[] = [
  { label: '全部', value: 'all' },
  { label: resourceTypeLabels[RESOURCE_TYPE_DIRECTORY], value: RESOURCE_TYPE_DIRECTORY },
  { label: resourceTypeLabels[RESOURCE_TYPE_MENU], value: RESOURCE_TYPE_MENU },
  { label: resourceTypeLabels[RESOURCE_TYPE_EXTERNAL], value: RESOURCE_TYPE_EXTERNAL },
  { label: resourceTypeLabels[RESOURCE_TYPE_ACTION], value: RESOURCE_TYPE_ACTION },
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
    status: filters.value.status === STATUS_FILTER_ALL ? null : filters.value.status,
  }
}

function handleReset() {
  filters.value = {
    keyword: '',
    type: 'all',
    status: STATUS_FILTER_ALL,
  }
  activeFilters.value = {
    keyword: '',
    type: null,
    status: null,
  }
}

function collectTreeIds(nodes: ResourceTreeNode[]): DataTableRowKey[] {
  return nodes.flatMap((node) => [node.id, ...collectTreeIds(node.children)])
}

function handleUpdateExpandedRowKeys(keys: DataTableRowKey[]) {
  expandedRowKeys.value = keys
}

function renderPathValue(resource: ResourceTreeNode) {
  return resource.path ?? resource.externalUrl ?? '-'
}

function canCreateChildResource(resource: ResourceTreeNode) {
  return resource.type === RESOURCE_TYPE_DIRECTORY || resource.type === RESOURCE_TYPE_MENU
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
    render: (resource) => resourceTypeLabels[resource.type],
  },
  {
    title: '路径/外链',
    key: 'pathOrExternalUrl',
    minWidth: 220,
    render: (resource) => renderPathValue(resource),
  },
  {
    title: '隐藏',
    key: 'hidden',
    width: 90,
    render: (resource) => (resource.hidden ? '是' : '否'),
  },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render: (resource) =>
      h(
        NTag,
        {
          type: statusTagTypes[resource.status],
          bordered: false,
        },
        () => statusLabels[resource.status],
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
    render: (resource) => formatDateTime(resource.createdAt),
  },
  {
    title: '操作',
    key: 'actions',
    width: 180,
    fixed: 'right',
    render: (resource) =>
      renderTableActions([
        canCreateChildResource(resource)
          ? renderTableActionButton({
              label: '新增下级',
              accessCode: 'system:resource:create',
              testId: 'resources-create-child',
            })
          : null,
        renderTableActionButton({
          label: '编辑',
          accessCode: 'system:resource:update',
          testId: 'resources-edit',
        }),
        renderTableActionButton({
          label: '删除',
          accessCode: 'system:resource:delete',
          type: 'error',
          testId: 'resources-delete',
        }),
      ]),
  },
]
</script>

<template>
  <main class="space-y-5">
    <header class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold">资源管理</h1>
        <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">共 {{ visibleCount }} 个资源</p>
      </div>
      <NButton v-can="'system:resource:create'" data-test="resources-create" type="primary">
        新增资源
      </NButton>
    </header>

    <section
      class="rounded-ui border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <NFlex align="end" size="medium">
        <NInput
          v-model:value="filters.keyword"
          data-test="resources-keyword"
          clearable
          placeholder="请输入名称、编码、路径或外链"
          class="w-64!"
        />
        <NSelect
          v-model:value="filters.type"
          data-test="resources-type"
          :options="typeOptions"
          placeholder="全部类型"
          class="w-40!"
        />
        <NSelect
          v-model:value="filters.status"
          data-test="resources-status"
          :options="statusOptions"
          placeholder="全部状态"
          class="w-40!"
        />
        <NButton data-test="resources-search" type="primary" @click="handleSearch">查询</NButton>
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
        :row-key="(resource: ResourceTreeNode) => resource.id"
      />
    </section>
  </main>
</template>
