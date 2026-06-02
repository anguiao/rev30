<script setup lang="ts">
import bytes from 'bytes'
import { computed, h, ref } from 'vue'
import { useQuery, useQueryCache } from '@pinia/colada'
import type { ButtonProps, DataTableColumns } from 'naive-ui'
import {
  NAlert,
  NButton,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NPagination,
  NSelect,
  useDialog,
  useMessage,
} from 'naive-ui'
import {
  type AttachmentListItem,
  type AttachmentListQuery,
  type AttachmentListResponse,
} from '@rev30/contracts'
import { useAdminPageTitle } from '../../../composables/useAdminPageTitle'
import {
  ATTACHMENT_USAGE_FILTER_ALL,
  attachmentUsageFilterOptions,
  attachmentUsageLabels,
  formatDateTime,
  type AttachmentUsageFilter,
} from '../../../features/content'
import {
  AttachmentPreviewCell,
  deleteAttachment,
  getAttachmentErrorMessage,
  listAttachments,
} from '../../../features/attachments'
import { renderTableActionButton, renderTableActions } from '../../../utils/ui'

const pageTitle = useAdminPageTitle('附件资源')

const message = useMessage()
const dialog = useDialog()
const queryCache = useQueryCache()

const keyword = ref('')
const usage = ref<AttachmentUsageFilter>(ATTACHMENT_USAGE_FILTER_ALL)
const query = ref<AttachmentListQuery>({
  page: 1,
  pageSize: 20,
})
const emptyAttachmentsData: AttachmentListResponse = {
  list: [],
  total: 0,
  page: 1,
  pageSize: query.value.pageSize,
}

const {
  data: attachmentsResponse,
  error: attachmentsError,
  isLoading,
} = useQuery({
  key: () => [
    'content',
    'attachments',
    'list',
    query.value.page,
    query.value.pageSize,
    query.value.keyword ?? '',
    query.value.usage ?? ATTACHMENT_USAGE_FILTER_ALL,
  ],
  placeholderData: () => emptyAttachmentsData,
  query: () => listAttachments(query.value),
})

const attachmentsData = computed(() => attachmentsResponse.value ?? emptyAttachmentsData)
const loadErrorMessage = computed(() =>
  attachmentsError.value === null
    ? ''
    : getAttachmentErrorMessage(attachmentsError.value, '加载附件资源失败'),
)

function handleSearch() {
  const nextKeyword = keyword.value.trim()

  query.value = {
    page: 1,
    pageSize: query.value.pageSize,
    ...(nextKeyword.length > 0 ? { keyword: nextKeyword } : {}),
    ...(usage.value !== ATTACHMENT_USAGE_FILTER_ALL ? { usage: usage.value } : {}),
  } satisfies AttachmentListQuery
}

function handleReset() {
  keyword.value = ''
  usage.value = ATTACHMENT_USAGE_FILTER_ALL
  query.value = {
    page: 1,
    pageSize: query.value.pageSize,
  }
}

async function invalidateAttachmentListQueries() {
  await queryCache.invalidateQueries({
    key: ['content', 'attachments', 'list'],
  })
}

function confirmDeleteAttachment(attachment: AttachmentListItem) {
  const positiveButtonProps: ButtonProps & Record<string, unknown> = {
    type: 'error',
    'data-test': 'attachments-delete-confirm',
  }

  dialog.warning({
    title: '确认删除',
    content: `确定删除附件“${attachment.originalName}”吗？`,
    positiveText: '删除',
    negativeText: '取消',
    positiveButtonProps,
    async onPositiveClick() {
      try {
        await deleteAttachment(attachment.id)

        message.success('删除附件成功')
        await invalidateAttachmentListQueries()
      } catch (error) {
        message.error(getAttachmentErrorMessage(error, '删除附件失败'))
        return false
      }
    },
  })
}

function formatUploader(attachment: AttachmentListItem) {
  return `${attachment.createdBy.nickname} (${attachment.createdBy.username})`
}

const columns: DataTableColumns<AttachmentListItem> = [
  {
    title: '预览',
    key: 'preview',
    width: 90,
    render: (attachment) => h(AttachmentPreviewCell, { attachment }),
  },
  {
    title: '文件名',
    key: 'originalName',
    minWidth: 240,
  },
  {
    title: 'MIME',
    key: 'mimeType',
    minWidth: 180,
  },
  {
    title: '大小',
    key: 'size',
    width: 120,
    render: (attachment) => bytes.format(attachment.size),
  },
  {
    title: '用途',
    key: 'usage',
    width: 110,
    render: (attachment) => attachmentUsageLabels[attachment.usage],
  },
  {
    title: '上传人',
    key: 'createdBy',
    minWidth: 200,
    render: (attachment) => formatUploader(attachment),
  },
  {
    title: '上传时间',
    key: 'createdAt',
    minWidth: 180,
    render: (attachment) => formatDateTime(attachment.createdAt),
  },
  {
    title: '操作',
    key: 'actions',
    width: 100,
    fixed: 'right',
    render: (attachment) =>
      renderTableActions([
        renderTableActionButton({
          label: '删除',
          accessCode: 'content:attachment:delete',
          type: 'error',
          testId: 'attachments-delete',
          onClick: () => confirmDeleteAttachment(attachment),
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
        共 {{ attachmentsData.total }} 条
      </p>
    </header>

    <section
      class="rounded-ui border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <NForm inline label-placement="left" :show-feedback="false" class="items-center gap-y-3">
        <NFormItem label="关键词">
          <NInput
            v-model:value="keyword"
            data-test="attachments-keyword"
            clearable
            placeholder="请输入文件名关键词"
            class="w-64!"
          />
        </NFormItem>
        <NFormItem label="用途">
          <NSelect
            v-model:value="usage"
            data-test="attachments-usage"
            :options="attachmentUsageFilterOptions"
            placeholder="全部"
            class="w-40!"
          />
        </NFormItem>
        <div class="flex gap-2">
          <NButton data-test="attachments-search" type="primary" @click="handleSearch"
            >查询</NButton
          >
          <NButton data-test="attachments-reset" @click="handleReset">重置</NButton>
        </div>
      </NForm>
    </section>

    <NAlert v-if="loadErrorMessage" type="error">{{ loadErrorMessage }}</NAlert>

    <section>
      <NDataTable
        :columns="columns"
        :data="attachmentsData.list"
        :loading="isLoading"
        :pagination="false"
        :row-key="(attachment: AttachmentListItem) => attachment.id"
      />

      <div class="mt-4 flex justify-end">
        <NPagination
          v-model:page="query.page"
          :page-size="query.pageSize"
          :item-count="attachmentsData.total"
        />
      </div>
    </section>
  </main>
</template>
