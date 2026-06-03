<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import { useQuery, useQueryCache } from '@pinia/colada'
import type { ButtonProps, DataTableColumns, DataTableRowKey } from 'naive-ui'
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
import type { DepartmentTreeNode } from '@rev30/contracts'
import {
  filterTree,
  formatDisplayDateTime,
  getTreeNodeCount,
  isLeafInTree,
  treeToArray,
} from '@rev30/utils'
import { useAdminPageTitle } from '../../../composables/useAdminPageTitle'
import DepartmentFormDrawer from '../../../features/system/DepartmentFormDrawer.vue'
import {
  STATUS_FILTER_ALL,
  deleteDepartment,
  getDepartmentTree,
  getSystemErrorMessage,
  statusFilterOptions,
  statusLabels,
  statusTagTypes,
  type StatusFilter,
  type SystemStatus,
} from '../../../features/system'
import { renderTableActionButton, renderTableActions } from '../../../utils/ui'

const pageTitle = useAdminPageTitle('组织部门')

const message = useMessage()
const dialog = useDialog()
const queryCache = useQueryCache()

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

const rawTree = computed(() => departmentTree.value ?? emptyDepartmentTree)
const loadErrorMessage = computed(() =>
  departmentTreeError.value === null
    ? ''
    : getSystemErrorMessage(departmentTreeError.value, '加载组织部门失败'),
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

const visibleCount = computed(() => getTreeNodeCount(rows.value))

const isDepartmentDrawerVisible = ref(false)
const editingDepartmentId = ref<string | null>(null)
const selectedParentDepartmentId = ref<string | null>(null)
function openDepartmentFormDrawer(
  departmentId: string | null = null,
  parentId: string | null = null,
) {
  editingDepartmentId.value = departmentId
  selectedParentDepartmentId.value = parentId
  isDepartmentDrawerVisible.value = true
}
async function invalidateDepartmentTreeQuery() {
  await queryCache.invalidateQueries({
    key: ['system', 'departments', 'tree'],
    exact: true,
  })
}
async function handleDepartmentSaved() {
  message.success('保存组织部门成功')
  await invalidateDepartmentTreeQuery()
}

function confirmDeleteDepartment(department: DepartmentTreeNode) {
  if (!isLeafInTree(rawTree.value, department.id)) {
    return
  }

  const positiveButtonProps: ButtonProps & Record<string, unknown> = {
    type: 'error',
    'data-test': 'departments-delete-confirm',
  }

  dialog.warning({
    title: '确认删除',
    content: `确定删除组织部门“${department.name}”吗？`,
    positiveText: '删除',
    negativeText: '取消',
    positiveButtonProps,
    async onPositiveClick() {
      try {
        await deleteDepartment(department.id)

        message.success('删除组织部门成功')
        await invalidateDepartmentTreeQuery()
      } catch (error) {
        message.error(getSystemErrorMessage(error, '删除组织部门失败'))
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

const columns: DataTableColumns<DepartmentTreeNode> = [
  {
    title: '名称',
    key: 'name',
    minWidth: 220,
  },
  {
    title: '编码',
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
    render: (department) => formatDisplayDateTime(department.createdAt),
  },
  {
    title: '操作',
    key: 'actions',
    width: 180,
    fixed: 'right',
    render: (department) =>
      renderTableActions([
        renderTableActionButton({
          label: '新增下级',
          accessCode: 'system:department:create',
          testId: 'departments-create-child',
          onClick: () => openDepartmentFormDrawer(null, department.id),
        }),
        renderTableActionButton({
          label: '编辑',
          accessCode: ['system:department:update', 'system:department:list'],
          testId: 'departments-edit',
          onClick: () => openDepartmentFormDrawer(department.id),
        }),
        renderTableActionButton({
          label: '删除',
          accessCode: 'system:department:delete',
          type: 'error',
          testId: 'departments-delete',
          disabled: !isLeafInTree(rawTree.value, department.id),
          onClick: () => confirmDeleteDepartment(department),
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
        v-can="'system:department:create'"
        data-test="departments-create"
        type="primary"
        @click="openDepartmentFormDrawer()"
      >
        新增组织部门
      </NButton>
    </header>

    <section
      class="rounded-ui border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <NForm inline label-placement="left" :show-feedback="false" class="items-center gap-y-3">
        <NFormItem label="关键词">
          <NInput
            v-model:value="filters.keyword"
            data-test="departments-keyword"
            clearable
            placeholder="请输入关键词"
            class="w-64!"
          />
        </NFormItem>
        <NFormItem label="状态">
          <NSelect
            v-model:value="filters.status"
            data-test="departments-status"
            :options="statusFilterOptions"
            placeholder="全部"
            class="w-40!"
          />
        </NFormItem>
        <div class="flex gap-2">
          <NButton data-test="departments-search" type="primary" @click="handleSearch"
            >查询</NButton
          >
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
        :row-key="(department: DepartmentTreeNode) => department.id"
      />
    </section>

    <DepartmentFormDrawer
      v-model:show="isDepartmentDrawerVisible"
      :department-id="editingDepartmentId"
      :parent-id="selectedParentDepartmentId"
      @saved="handleDepartmentSaved"
    />
  </main>
</template>
