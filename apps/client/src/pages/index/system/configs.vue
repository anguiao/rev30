<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { useQuery } from '@pinia/colada'
import type { DataTableColumns } from 'naive-ui'
import {
  NAlert,
  NButton,
  NDataTable,
  NEllipsis,
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
import type { ConfigListItem, ConfigListQuery, ConfigListResponse } from '@rev30/contracts'
import { useAdminPageTitle } from '../../../composables/useAdminPageTitle'
import ConfigFormDrawer from '../../../features/system/ConfigFormDrawer.vue'
import {
  CONFIG_VALUE_TYPE_FILTER_ALL,
  STATUS_FILTER_ALL,
  configValueTypeFilterOptions,
  configValueTypeLabels,
  deleteConfig,
  formatDateTime,
  getSystemErrorMessage,
  listConfigs,
  statusFilterOptions,
  statusLabels,
  statusTagTypes,
  type ConfigValueTypeFilter,
  type StatusFilter,
} from '../../../features/system'
import { renderTableActionButton, renderTableActions } from '../../../utils/ui'

const pageTitle = useAdminPageTitle('系统配置')

const message = useMessage()
const dialog = useDialog()

const keyword = ref('')
const groupCode = ref('')
const valueType = ref<ConfigValueTypeFilter>(CONFIG_VALUE_TYPE_FILTER_ALL)
const status = ref<StatusFilter>(STATUS_FILTER_ALL)
const query = ref<ConfigListQuery>({
  page: 1,
  pageSize: 20,
})
const emptyConfigsData: ConfigListResponse = {
  list: [],
  total: 0,
  page: 1,
  pageSize: query.value.pageSize,
}

const {
  data: configsResponse,
  error: configsError,
  isLoading,
  refetch: refetchConfigs,
} = useQuery({
  key: () => [
    'system',
    'configs',
    query.value.page,
    query.value.pageSize,
    query.value.keyword ?? '',
    query.value.groupCode ?? '',
    query.value.valueType ?? null,
    query.value.status ?? null,
  ],
  placeholderData: () => emptyConfigsData,
  query: () => listConfigs(query.value),
})

function handleSearch() {
  const nextKeyword = keyword.value.trim()
  const nextGroupCode = groupCode.value.trim()

  query.value = {
    page: 1,
    pageSize: query.value.pageSize,
    ...(nextKeyword.length > 0 ? { keyword: nextKeyword } : {}),
    ...(nextGroupCode.length > 0 ? { groupCode: nextGroupCode } : {}),
    ...(valueType.value !== CONFIG_VALUE_TYPE_FILTER_ALL ? { valueType: valueType.value } : {}),
    ...(status.value !== STATUS_FILTER_ALL ? { status: status.value } : {}),
  } satisfies ConfigListQuery
}

function handleReset() {
  keyword.value = ''
  groupCode.value = ''
  valueType.value = CONFIG_VALUE_TYPE_FILTER_ALL
  status.value = STATUS_FILTER_ALL
  query.value = {
    page: 1,
    pageSize: query.value.pageSize,
  }
}

const configsData = computed(() => configsResponse.value ?? emptyConfigsData)
const loadErrorMessage = computed(() =>
  configsError.value === null ? '' : getSystemErrorMessage(configsError.value, '加载系统配置失败'),
)

const isConfigDrawerVisible = ref(false)
const editingConfigId = ref<string | null>(null)
function openConfigFormDrawer(configId: string | null = null) {
  editingConfigId.value = configId
  isConfigDrawerVisible.value = true
}
async function handleConfigSaved() {
  message.success('保存系统配置成功')
  await refetchConfigs()
}

function confirmDeleteConfig(config: ConfigListItem) {
  const positiveButtonProps: ButtonProps & Record<string, unknown> = {
    type: 'error',
    'data-test': 'configs-delete-confirm',
  }

  dialog.warning({
    title: '确认删除',
    content: `确定删除系统配置“${config.name}”吗？`,
    positiveText: '删除',
    negativeText: '取消',
    positiveButtonProps,
    async onPositiveClick() {
      try {
        await deleteConfig(config.id)

        message.success('删除系统配置成功')
        await refetchConfigs()
      } catch (error) {
        message.error(getSystemErrorMessage(error, '删除系统配置失败'))
        return false
      }
    },
  })
}

const columns: DataTableColumns<ConfigListItem> = [
  {
    title: '分组',
    key: 'groupCode',
    width: 140,
  },
  {
    title: '配置键',
    key: 'key',
    minWidth: 180,
  },
  {
    title: '配置名称',
    key: 'name',
    width: 160,
  },
  {
    title: '值类型',
    key: 'valueType',
    width: 100,
    render: (config) => configValueTypeLabels[config.valueType],
  },
  {
    title: '配置值',
    key: 'value',
    minWidth: 220,
    render: (config) =>
      h(
        NEllipsis,
        {
          lineClamp: 1,
          tooltip: {
            width: 360,
          },
        },
        () => config.value,
      ),
  },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render: (config) =>
      h(
        NTag,
        {
          type: statusTagTypes[config.status],
          bordered: false,
        },
        () => statusLabels[config.status],
      ),
  },
  {
    title: '更新时间',
    key: 'updatedAt',
    minWidth: 160,
    render: (config) => formatDateTime(config.updatedAt),
  },
  {
    title: '操作',
    key: 'actions',
    width: 120,
    fixed: 'right',
    render: (config) =>
      renderTableActions([
        renderTableActionButton({
          label: '编辑',
          accessCode: ['system:config:update', 'system:config:list'],
          testId: 'configs-edit',
          onClick: () => openConfigFormDrawer(config.id),
        }),
        renderTableActionButton({
          label: '删除',
          accessCode: 'system:config:delete',
          type: 'error',
          testId: 'configs-delete',
          onClick: () => confirmDeleteConfig(config),
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
        <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">共 {{ configsData.total }} 个</p>
      </div>
      <NButton
        v-can="'system:config:create'"
        data-test="configs-create"
        type="primary"
        @click="openConfigFormDrawer()"
      >
        新增系统配置
      </NButton>
    </header>

    <section
      class="rounded-ui border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <NForm inline label-placement="left" :show-feedback="false" class="items-center gap-y-3">
        <NFormItem label="关键词">
          <NInput
            v-model:value="keyword"
            data-test="configs-keyword"
            clearable
            placeholder="请输入关键词"
            class="w-64!"
          />
        </NFormItem>
        <NFormItem label="分组编码">
          <NInput
            v-model:value="groupCode"
            data-test="configs-group-code"
            clearable
            placeholder="请输入分组编码"
            class="w-52!"
          />
        </NFormItem>
        <NFormItem label="值类型">
          <NSelect
            v-model:value="valueType"
            data-test="configs-value-type"
            :options="configValueTypeFilterOptions"
            placeholder="全部"
            class="w-40!"
          />
        </NFormItem>
        <NFormItem label="状态">
          <NSelect
            v-model:value="status"
            data-test="configs-status"
            :options="statusFilterOptions"
            placeholder="全部"
            class="w-40!"
          />
        </NFormItem>
        <div class="flex gap-2">
          <NButton data-test="configs-search" type="primary" @click="handleSearch">查询</NButton>
          <NButton data-test="configs-reset" @click="handleReset">重置</NButton>
        </div>
      </NForm>
    </section>

    <NAlert v-if="loadErrorMessage" type="error">{{ loadErrorMessage }}</NAlert>

    <section>
      <NDataTable
        :columns="columns"
        :data="configsData.list"
        :loading="isLoading"
        :pagination="false"
        :row-key="(config: ConfigListItem) => config.id"
      />

      <div class="mt-4 flex justify-end">
        <NPagination
          v-model:page="query.page"
          :page-size="query.pageSize"
          :item-count="configsData.total"
        />
      </div>
    </section>

    <ConfigFormDrawer
      v-model:show="isConfigDrawerVisible"
      :config-id="editingConfigId"
      @saved="handleConfigSaved"
    />
  </main>
</template>
