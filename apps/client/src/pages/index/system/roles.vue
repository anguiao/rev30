<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { useQuery } from '@pinia/colada'
import type { DataTableColumns } from 'naive-ui'
import {
  NAlert,
  NButton,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NPagination,
  NSelect,
  NTag,
  useDialog,
  useMessage,
} from 'naive-ui'
import type { ButtonProps } from 'naive-ui'
import {
  BUILT_IN_ADMIN_ROLE_CODE,
  type RoleListItem,
  type RoleListQuery,
  type RoleListResponse,
} from '@rev30/shared'
import { useAdminPageTitle } from '../../../composables/useAdminPageTitle'
import RoleFormDrawer from '../../../features/system/RoleFormDrawer.vue'
import {
  STATUS_FILTER_ALL,
  deleteRole,
  formatDateTime,
  getSystemErrorMessage,
  listRoles,
  statusFilterOptions,
  statusLabels,
  statusTagTypes,
  type StatusFilter,
} from '../../../features/system'
import { renderTableActionButton, renderTableActions } from '../../../utils/ui'

const pageTitle = useAdminPageTitle('系统角色')

const message = useMessage()
const dialog = useDialog()

const keyword = ref('')
const status = ref<StatusFilter>(STATUS_FILTER_ALL)
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
  refetch: refetchRoles,
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

const rolesData = computed(() => rolesResponse.value ?? emptyRolesData)
const loadErrorMessage = computed(() =>
  rolesError.value === null ? '' : getSystemErrorMessage(rolesError.value, '加载系统角色失败'),
)

const isRoleDrawerVisible = ref(false)
const editingRoleId = ref<string | null>(null)
function openRoleFormDrawer(roleId: string | null = null) {
  editingRoleId.value = roleId
  isRoleDrawerVisible.value = true
}
async function handleRoleSaved() {
  message.success('保存系统角色成功')
  await refetchRoles()
}

function confirmDeleteRole(role: RoleListItem) {
  const positiveButtonProps: ButtonProps & Record<string, unknown> = {
    type: 'error',
    'data-test': 'roles-delete-confirm',
  }

  dialog.warning({
    title: '确认删除',
    content: `确定删除系统角色“${role.name}”吗？`,
    positiveText: '删除',
    negativeText: '取消',
    positiveButtonProps,
    async onPositiveClick() {
      try {
        await deleteRole(role.id)

        message.success('删除系统角色成功')
        await refetchRoles()
      } catch (error) {
        message.error(getSystemErrorMessage(error, '删除系统角色失败'))
        return false
      }
    },
  })
}

const columns: DataTableColumns<RoleListItem> = [
  {
    title: '名称',
    key: 'name',
    width: 160,
  },
  {
    title: '编码',
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
      role.code === BUILT_IN_ADMIN_ROLE_CODE
        ? renderTableActions([])
        : renderTableActions([
            renderTableActionButton({
              label: '编辑',
              accessCode: ['system:role:update', 'system:role:list', 'system:resource:list'],
              onClick: () => openRoleFormDrawer(role.id),
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
        <h1 class="text-xl font-semibold">{{ pageTitle }}</h1>
        <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">共 {{ rolesData.total }} 个</p>
      </div>
      <NButton
        v-can.all="['system:role:create', 'system:resource:list']"
        data-test="roles-create"
        type="primary"
        @click="openRoleFormDrawer()"
      >
        新增系统角色
      </NButton>
    </header>

    <section
      class="rounded-ui border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <NForm inline label-placement="left" :show-feedback="false" class="items-center gap-y-3">
        <NFormItem label="关键词">
          <NInput
            v-model:value="keyword"
            data-test="roles-keyword"
            clearable
            placeholder="请输入关键词"
            class="w-64!"
          />
        </NFormItem>
        <NFormItem label="状态">
          <NSelect
            v-model:value="status"
            data-test="roles-status"
            :options="statusFilterOptions"
            placeholder="全部"
            class="w-40!"
          />
        </NFormItem>
        <div class="flex gap-2">
          <NButton data-test="roles-search" type="primary" @click="handleSearch">查询</NButton>
          <NButton @click="handleReset">重置</NButton>
        </div>
      </NForm>
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
      v-model:show="isRoleDrawerVisible"
      :role-id="editingRoleId"
      @saved="handleRoleSaved"
    />
  </main>
</template>
