<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { useQuery, useQueryCache } from '@pinia/colada'
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
import type {
  DictionaryListItem,
  DictionaryListQuery,
  DictionaryListResponse,
} from '@rev30/contracts'
import { formatDisplayDateTime } from '@rev30/utils'
import { useAdminPageTitle } from '../../../composables/useAdminPageTitle'
import { getErrorMessage } from '../../../utils/error'
import DictionaryFormDrawer from '../../../features/system/DictionaryFormDrawer.vue'
import {
  STATUS_FILTER_ALL,
  deleteDictionary,
  listDictionaries,
  statusFilterOptions,
  statusLabels,
  statusTagTypes,
  type StatusFilter,
} from '../../../features/system'
import { renderTableActionButton, renderTableActions } from '../../../utils/ui'

const pageTitle = useAdminPageTitle('数据字典')

const message = useMessage()
const dialog = useDialog()
const queryCache = useQueryCache()

const keyword = ref('')
const status = ref<StatusFilter>(STATUS_FILTER_ALL)
const query = ref<DictionaryListQuery>({
  page: 1,
  pageSize: 20,
})
const emptyDictionariesData: DictionaryListResponse = {
  list: [],
  total: 0,
  page: 1,
  pageSize: query.value.pageSize,
}

const {
  data: dictionariesResponse,
  error: dictionariesError,
  isLoading,
} = useQuery({
  key: () => [
    'system',
    'dictionaries',
    'list',
    query.value.page,
    query.value.pageSize,
    query.value.keyword ?? '',
    query.value.status ?? null,
  ],
  placeholderData: () => emptyDictionariesData,
  query: () => listDictionaries(query.value),
})

function handleSearch() {
  const nextKeyword = keyword.value.trim()

  query.value = {
    page: 1,
    pageSize: query.value.pageSize,
    ...(nextKeyword.length > 0 ? { keyword: nextKeyword } : {}),
    ...(status.value !== STATUS_FILTER_ALL ? { status: status.value } : {}),
  } satisfies DictionaryListQuery
}

function handleReset() {
  keyword.value = ''
  status.value = STATUS_FILTER_ALL
  query.value = {
    page: 1,
    pageSize: query.value.pageSize,
  }
}

const dictionariesData = computed(() => dictionariesResponse.value ?? emptyDictionariesData)
const loadErrorMessage = computed(() =>
  dictionariesError.value === null
    ? ''
    : getErrorMessage(dictionariesError.value, '加载数据字典失败'),
)

const isDictionaryDrawerVisible = ref(false)
const editingDictionaryId = ref<string | null>(null)
function openDictionaryFormDrawer(dictionaryId: string | null = null) {
  editingDictionaryId.value = dictionaryId
  isDictionaryDrawerVisible.value = true
}
async function invalidateDictionaryListQueries() {
  await queryCache.invalidateQueries({
    key: ['system', 'dictionaries', 'list'],
  })
}
async function handleDictionarySaved() {
  message.success('保存数据字典成功')
  await invalidateDictionaryListQueries()
}

function confirmDeleteDictionary(dictionary: DictionaryListItem) {
  const positiveButtonProps: ButtonProps & Record<string, unknown> = {
    type: 'error',
    'data-test': 'dictionaries-delete-confirm',
  }

  dialog.warning({
    title: '确认删除',
    content: `确定删除数据字典“${dictionary.name}”吗？将同时删除该字典下的 ${dictionary.itemCount} 个字典项。`,
    positiveText: '删除',
    negativeText: '取消',
    positiveButtonProps,
    async onPositiveClick() {
      try {
        await deleteDictionary(dictionary.id)

        message.success('删除数据字典成功')
        await invalidateDictionaryListQueries()
      } catch (error) {
        message.error(getErrorMessage(error, '删除数据字典失败'))
        return false
      }
    },
  })
}

const columns: DataTableColumns<DictionaryListItem> = [
  {
    title: '字典编码',
    key: 'code',
    width: 180,
  },
  {
    title: '字典名称',
    key: 'name',
    width: 180,
  },
  {
    title: '字典项数量',
    key: 'itemCount',
    width: 120,
  },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render: (dictionary) =>
      h(
        NTag,
        {
          type: statusTagTypes[dictionary.status],
          bordered: false,
        },
        () => statusLabels[dictionary.status],
      ),
  },
  {
    title: '排序',
    key: 'sortOrder',
    width: 100,
  },
  {
    title: '更新时间',
    key: 'updatedAt',
    minWidth: 160,
    render: (dictionary) => formatDisplayDateTime(dictionary.updatedAt),
  },
  {
    title: '操作',
    key: 'actions',
    width: 120,
    fixed: 'right',
    render: (dictionary) =>
      renderTableActions([
        renderTableActionButton({
          label: '编辑',
          accessCode: ['system:dictionary:update', 'system:dictionary:list'],
          testId: 'dictionaries-edit',
          onClick: () => openDictionaryFormDrawer(dictionary.id),
        }),
        renderTableActionButton({
          label: '删除',
          accessCode: 'system:dictionary:delete',
          type: 'error',
          testId: 'dictionaries-delete',
          onClick: () => confirmDeleteDictionary(dictionary),
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
        <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">
          共 {{ dictionariesData.total }} 个
        </p>
      </div>
      <NButton
        v-can="'system:dictionary:create'"
        data-test="dictionaries-create"
        type="primary"
        @click="openDictionaryFormDrawer()"
      >
        新增数据字典
      </NButton>
    </header>

    <section
      class="rounded-ui border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <NForm inline label-placement="left" :show-feedback="false" class="items-center gap-y-3">
        <NFormItem label="关键词">
          <NInput
            v-model:value="keyword"
            data-test="dictionaries-keyword"
            clearable
            placeholder="请输入关键词"
            class="w-64!"
          />
        </NFormItem>
        <NFormItem label="状态">
          <NSelect
            v-model:value="status"
            data-test="dictionaries-status"
            :options="statusFilterOptions"
            placeholder="全部"
            class="w-40!"
          />
        </NFormItem>
        <div class="flex gap-2">
          <NButton data-test="dictionaries-search" type="primary" @click="handleSearch">
            查询
          </NButton>
          <NButton data-test="dictionaries-reset" @click="handleReset">重置</NButton>
        </div>
      </NForm>
    </section>

    <NAlert v-if="loadErrorMessage" type="error">{{ loadErrorMessage }}</NAlert>

    <section>
      <NDataTable
        :columns="columns"
        :data="dictionariesData.list"
        :loading="isLoading"
        :pagination="false"
        :row-key="(dictionary: DictionaryListItem) => dictionary.id"
      />

      <div class="mt-4 flex justify-end">
        <NPagination
          v-model:page="query.page"
          :page-size="query.pageSize"
          :item-count="dictionariesData.total"
        />
      </div>
    </section>

    <DictionaryFormDrawer
      v-model:show="isDictionaryDrawerVisible"
      :dictionary-id="editingDictionaryId"
      @saved="handleDictionarySaved"
    />
  </main>
</template>
