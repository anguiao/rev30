<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import { useQuery } from '@pinia/colada'
import type { ButtonProps, DataTableColumns, DataTableRowKey, SelectOption } from 'naive-ui'
import {
  NAlert,
  NButton,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NSelect,
  NTag,
  useDialog,
  useMessage,
} from 'naive-ui'
import {
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_EXTERNAL,
  RESOURCE_TYPE_MENU,
  type ResourceTreeNode,
  type ResourceType,
} from '@rev30/contracts'
import { filterTree, getTreeNodeCount, isLeafInTree, treeToArray } from '@rev30/utils'
import { useAdminPageTitle } from '../../../composables/useAdminPageTitle'
import ResourceFormDrawer from '../../../features/system/ResourceFormDrawer.vue'
import {
  STATUS_FILTER_ALL,
  deleteResource,
  formatDateTime,
  getResourceTree,
  getSystemErrorMessage,
  resourceTypeLabels,
  statusFilterOptions,
  statusLabels,
  statusTagTypes,
  type StatusFilter,
  type SystemStatus,
} from '../../../features/system'
import { renderTableActionButton, renderTableActions } from '../../../utils/ui'

const pageTitle = useAdminPageTitle('权限资源')

const message = useMessage()
const dialog = useDialog()

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
  refetch: refetchResources,
} = useQuery({
  key: () => ['system', 'resources', 'tree'],
  placeholderData: () => emptyResourceTree,
  query: () => getResourceTree(),
})

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

const rawTree = computed(() => resourceTree.value ?? emptyResourceTree)
const loadErrorMessage = computed(() =>
  resourceTreeError.value === null
    ? ''
    : getSystemErrorMessage(resourceTreeError.value, '加载权限资源失败'),
)

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

const visibleCount = computed(() => getTreeNodeCount(rows.value))

const isResourceDrawerVisible = ref(false)
const editingResourceId = ref<string | null>(null)
const selectedParentResourceId = ref<string | null>(null)
function openResourceFormDrawer(resourceId: string | null = null, parentId: string | null = null) {
  editingResourceId.value = resourceId
  selectedParentResourceId.value = parentId
  isResourceDrawerVisible.value = true
}
async function handleResourceSaved() {
  message.success('保存权限资源成功')
  await refetchResources()
}

function confirmDeleteResource(resource: ResourceTreeNode) {
  if (!isLeafInTree(rawTree.value, resource.id)) {
    return
  }

  const positiveButtonProps: ButtonProps & Record<string, unknown> = {
    type: 'error',
    'data-test': 'resources-delete-confirm',
  }

  dialog.warning({
    title: '确认删除',
    content: `确定删除权限资源“${resource.name}”吗？`,
    positiveText: '删除',
    negativeText: '取消',
    positiveButtonProps,
    async onPositiveClick() {
      try {
        await deleteResource(resource.id)

        message.success('删除权限资源成功')
        await refetchResources()
      } catch (error) {
        message.error(getSystemErrorMessage(error, '删除权限资源失败'))
        return false
      }
    },
  })
}

const expandedRowKeys = ref<DataTableRowKey[]>([])
watch(
  rows,
  (nextRows) => {
    expandedRowKeys.value = treeToArray(nextRows).map((node) => node.id)
  },
  { immediate: true },
)
function handleUpdateExpandedRowKeys(keys: DataTableRowKey[]) {
  expandedRowKeys.value = keys
}

function renderPathValue(resource: ResourceTreeNode) {
  return resource.path ?? resource.externalUrl ?? '-'
}

function canCreateChildResource(resource: ResourceTreeNode) {
  return resource.type === RESOURCE_TYPE_DIRECTORY || resource.type === RESOURCE_TYPE_MENU
}

const typeOptions: SelectOption[] = [
  { label: '全部', value: 'all' },
  { label: resourceTypeLabels[RESOURCE_TYPE_DIRECTORY], value: RESOURCE_TYPE_DIRECTORY },
  { label: resourceTypeLabels[RESOURCE_TYPE_MENU], value: RESOURCE_TYPE_MENU },
  { label: resourceTypeLabels[RESOURCE_TYPE_EXTERNAL], value: RESOURCE_TYPE_EXTERNAL },
  { label: resourceTypeLabels[RESOURCE_TYPE_ACTION], value: RESOURCE_TYPE_ACTION },
]

const columns: DataTableColumns<ResourceTreeNode> = [
  {
    title: '名称',
    key: 'name',
    minWidth: 220,
  },
  {
    title: '权限编码',
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
              onClick: () => openResourceFormDrawer(null, resource.id),
            })
          : null,
        renderTableActionButton({
          label: '编辑',
          accessCode: ['system:resource:update', 'system:resource:list'],
          testId: 'resources-edit',
          onClick: () => openResourceFormDrawer(resource.id),
        }),
        renderTableActionButton({
          label: '删除',
          accessCode: 'system:resource:delete',
          type: 'error',
          testId: 'resources-delete',
          disabled: !isLeafInTree(rawTree.value, resource.id),
          onClick: () => confirmDeleteResource(resource),
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
        <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">共 {{ visibleCount }} 个</p>
      </div>
      <NButton
        v-can="'system:resource:create'"
        data-test="resources-create"
        type="primary"
        @click="openResourceFormDrawer()"
      >
        新增权限资源
      </NButton>
    </header>

    <section
      class="rounded-ui border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <NForm inline label-placement="left" :show-feedback="false" class="items-center gap-y-3">
        <NFormItem label="关键词">
          <NInput
            v-model:value="filters.keyword"
            data-test="resources-keyword"
            clearable
            placeholder="请输入关键词"
            class="w-64!"
          />
        </NFormItem>
        <NFormItem label="类型">
          <NSelect
            v-model:value="filters.type"
            data-test="resources-type"
            :options="typeOptions"
            placeholder="全部"
            class="w-40!"
          />
        </NFormItem>
        <NFormItem label="状态">
          <NSelect
            v-model:value="filters.status"
            data-test="resources-status"
            :options="statusFilterOptions"
            placeholder="全部"
            class="w-40!"
          />
        </NFormItem>
        <div class="flex gap-2">
          <NButton data-test="resources-search" type="primary" @click="handleSearch">查询</NButton>
          <NButton @click="handleReset">重置</NButton>
        </div>
      </NForm>
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

    <ResourceFormDrawer
      v-model:show="isResourceDrawerVisible"
      :resource-id="editingResourceId"
      :parent-id="selectedParentResourceId"
      @saved="handleResourceSaved"
    />
  </main>
</template>
