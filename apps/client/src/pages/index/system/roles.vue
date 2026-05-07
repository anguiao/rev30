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
import type { RoleListItem, RoleListQuery, RoleListResponse } from '@rev30/shared'
import RoleFormDrawer from '../../../features/system/RoleFormDrawer.vue'
import {
  STATUS_FILTER_ALL,
  deleteRole,
  formatDateTime,
  getSystemErrorMessage,
  listRoles,
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
const isRoleDrawerShown = ref(false)
const editingRoleId = ref<string | null>(null)
const query = ref<RoleListQuery>({
  page: 1,
  pageSize: 20,
})
const emptyRolesData: RoleListResponse = {
  list: [],
  total: 0,
  page: 1,
  pageSize: query.value.pageSize,
}

const {
  data: rolesResponse,
  error: rolesError,
  isLoading,
  refetch,
} = useQuery({
  key: () => [
    'system',
    'roles',
    query.value.page,
    query.value.pageSize,
    query.value.keyword ?? '',
    query.value.status ?? null,
  ],
  placeholderData: () => emptyRolesData,
  query: () => listRoles(query.value),
})

const rolesData = computed(() => rolesResponse.value ?? emptyRolesData)
const loadErrorMessage = computed(() =>
  rolesError.value === null ? '' : getSystemErrorMessage(rolesError.value, '加载角色失败'),
)

async function refreshRoles() {
  await refetch()
}

function openCreateRoleDrawer() {
  editingRoleId.value = null
  isRoleDrawerShown.value = true
}

function openEditRoleDrawer(roleId: string) {
  editingRoleId.value = roleId
  isRoleDrawerShown.value = true
}

function confirmDeleteRole(role: RoleListItem) {
  const positiveButtonProps: ButtonProps & Record<string, unknown> = {
    type: 'error',
    'data-test': 'roles-delete-confirm',
  }

  dialog.warning({
    title: '确认删除',
    content: `确定删除角色“${role.name}”吗？`,
    positiveText: '删除',
    negativeText: '取消',
    positiveButtonProps,
    async onPositiveClick() {
      try {
        await deleteRole(role.id)
        message.success('删除角色成功')
        await refreshRoles()
      } catch (error) {
        message.error(getSystemErrorMessage(error, '删除角色失败'))
      }
    },
  })
}

function handleSearch() {
  const nextKeyword = keyword.value.trim()

  query.value = {
    page: 1,
    pageSize: query.value.pageSize,
    ...(nextKeyword.length > 0 ? { keyword: nextKeyword } : {}),
    ...(status.value !== STATUS_FILTER_ALL ? { status: status.value } : {}),
  } satisfies RoleListQuery
}

function handleReset() {
  keyword.value = ''
  status.value = STATUS_FILTER_ALL
  query.value = {
    page: 1,
    pageSize: query.value.pageSize,
  }
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
    render: (role) =>
      h(
        NTag,
        {
          type: statusTagTypes[role.status],
          bordered: false,
        },
        () => statusLabels[role.status],
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
    render: (role) => formatDateTime(role.createdAt),
  },
  {
    title: '操作',
    key: 'actions',
    width: 120,
    fixed: 'right',
    render: (role) =>
      renderTableActions([
        renderTableActionButton({
          label: '编辑',
          accessCode: 'system:role:update',
          onClick: () => openEditRoleDrawer(role.id),
          testId: 'roles-edit',
        }),
        renderTableActionButton({
          label: '删除',
          accessCode: 'system:role:delete',
          onClick: () => confirmDeleteRole(role),
          type: 'error',
          testId: 'roles-delete',
        }),
      ]),
  },
]
</script>

<template>
  <main class="space-y-5">
    <header class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold">角色管理</h1>
        <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">
          共 {{ rolesData.total }} 个角色
        </p>
      </div>
      <NButton
        v-can="'system:role:create'"
        data-test="roles-create"
        type="primary"
        @click="openCreateRoleDrawer"
      >
        新增角色
      </NButton>
    </header>

    <section
      class="rounded-ui border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <NFlex align="end" size="medium">
        <NInput
          v-model:value="keyword"
          data-test="roles-keyword"
          clearable
          placeholder="请输入名称或编码"
          class="w-64!"
        />
        <NSelect
          v-model:value="status"
          data-test="roles-status"
          :options="statusOptions"
          placeholder="全部状态"
          class="w-40!"
        />
        <NButton data-test="roles-search" type="primary" @click="handleSearch">查询</NButton>
        <NButton @click="handleReset">重置</NButton>
      </NFlex>
    </section>

    <NAlert v-if="loadErrorMessage" type="error">{{ loadErrorMessage }}</NAlert>

    <section>
      <NDataTable
        :columns="columns"
        :data="rolesData.list"
        :loading="isLoading"
        :pagination="false"
        :row-key="(role: RoleListItem) => role.id"
      />

      <div class="mt-4 flex justify-end">
        <NPagination
          v-model:page="query.page"
          :page-size="query.pageSize"
          :item-count="rolesData.total"
        />
      </div>
    </section>

    <RoleFormDrawer
      v-model:show="isRoleDrawerShown"
      :role-id="editingRoleId"
      @saved="refreshRoles"
    />
  </main>
</template>
