<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery, useQueryCache } from '@pinia/colada'
import type { DataTableColumns } from 'naive-ui'
import { NAlert, NButton, NDataTable, NForm, NFormItem, NInput, useMessage } from 'naive-ui'
import type { Config } from '@rev30/contracts'
import { useAdminPageTitle } from '../../../composables/useAdminPageTitle'
import { getErrorMessage } from '../../../utils/error'
import ConfigFormDrawer from '../../../features/system/ConfigFormDrawer.vue'
import { configValueTypeLabels, listConfigs } from '../../../features/system'
import { renderTableActionButton, renderTableActions } from '../../../utils/ui'

const pageTitle = useAdminPageTitle('系统配置')

const message = useMessage()
const queryCache = useQueryCache()

const keyword = ref('')
const submittedKeyword = ref('')

const {
  data: configsResponse,
  error: configsError,
  isLoading,
} = useQuery({
  key: () => ['system', 'configs', 'list'],
  placeholderData: () => [],
  query: () => listConfigs(),
})
const loadErrorMessage = computed(() =>
  configsError.value === null ? '' : getErrorMessage(configsError.value, '加载配置失败'),
)

function handleSearch() {
  submittedKeyword.value = keyword.value.trim()
}

function handleReset() {
  keyword.value = ''
  submittedKeyword.value = ''
}

const configsData = computed(() => configsResponse.value ?? [])
const filteredConfigs = computed(() => {
  const value = submittedKeyword.value.toLowerCase()
  if (!value) {
    return configsData.value
  }

  return configsData.value.filter((config) =>
    [config.key, config.name, config.description].some((item) =>
      item.toLowerCase().includes(value),
    ),
  )
})

const isConfigDrawerVisible = ref(false)
const editingConfigKey = ref<string | null>(null)

function openConfigFormDrawer(configKey: string) {
  editingConfigKey.value = configKey
  isConfigDrawerVisible.value = true
}

async function handleConfigSaved() {
  message.success('系统配置已保存')
  await queryCache.invalidateQueries({
    key: ['system', 'configs', 'list'],
  })
}

const columns: DataTableColumns<Config> = [
  {
    title: '配置键',
    key: 'key',
    minWidth: 220,
  },
  {
    title: '配置名称',
    key: 'name',
    minWidth: 180,
  },
  {
    title: '配置值',
    key: 'value',
    minWidth: 220,
    ellipsis: {
      tooltip: true,
    },
    render: (config) => config.value,
  },
  {
    title: '值类型',
    key: 'valueType',
    width: 100,
    render: (config) => configValueTypeLabels[config.valueType],
  },
  {
    title: '操作',
    key: 'actions',
    width: 90,
    fixed: 'right',
    render: (config) =>
      renderTableActions([
        renderTableActionButton({
          label: '编辑',
          accessCode: ['system:config:update', 'system:config:list'],
          testId: 'configs-edit',
          onClick: () => openConfigFormDrawer(config.key),
        }),
      ]),
  },
]
</script>

<template>
  <main class="space-y-5">
    <header>
      <h1 class="text-xl font-semibold">{{ pageTitle }}</h1>
      <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">
        共 {{ filteredConfigs.length }} 个
      </p>
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
        :data="filteredConfigs"
        :loading="isLoading"
        :pagination="false"
        :row-key="(config: Config) => config.key"
      />
    </section>

    <ConfigFormDrawer
      v-model:show="isConfigDrawerVisible"
      :config-key="editingConfigKey"
      @saved="handleConfigSaved"
    />
  </main>
</template>
