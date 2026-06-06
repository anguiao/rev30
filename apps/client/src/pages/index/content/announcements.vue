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
import {
  ANNOUNCEMENT_STATUS_PUBLISHED,
  type AnnouncementListItem,
  type AnnouncementListQuery,
  type AnnouncementListResponse,
} from '@rev30/contracts'
import { formatDisplayDateTime } from '@rev30/utils'
import { useAdminPageTitle } from '../../../composables/useAdminPageTitle'
import { getErrorMessage } from '../../../utils/error'
import AnnouncementFormDrawer from '../../../features/content/AnnouncementFormDrawer.vue'
import {
  ANNOUNCEMENT_PINNED_FILTER_ALL,
  ANNOUNCEMENT_STATUS_FILTER_ALL,
  ANNOUNCEMENT_TYPE_FILTER_ALL,
  announcementPinnedFilterOptions,
  announcementStatusFilterOptions,
  announcementStatusLabels,
  announcementStatusTagTypes,
  announcementTypeFilterOptions,
  announcementTypeLabels,
  archiveAnnouncement,
  listAnnouncements,
  publishAnnouncement,
  deleteAnnouncement,
  type AnnouncementPinnedFilter,
  type AnnouncementStatusFilter,
  type AnnouncementTypeFilter,
} from '../../../features/content'
import { renderTableActionButton, renderTableActions } from '../../../utils/ui'

const pageTitle = useAdminPageTitle('通知公告')

const message = useMessage()
const dialog = useDialog()
const queryCache = useQueryCache()

const keyword = ref('')
const type = ref<AnnouncementTypeFilter>(ANNOUNCEMENT_TYPE_FILTER_ALL)
const status = ref<AnnouncementStatusFilter>(ANNOUNCEMENT_STATUS_FILTER_ALL)
const pinned = ref<AnnouncementPinnedFilter>(ANNOUNCEMENT_PINNED_FILTER_ALL)
const query = ref<AnnouncementListQuery>({
  page: 1,
  pageSize: 20,
})
const emptyAnnouncementsData: AnnouncementListResponse = {
  list: [],
  total: 0,
  page: 1,
  pageSize: query.value.pageSize,
}

const {
  data: announcementsResponse,
  error: announcementsError,
  isLoading,
} = useQuery({
  key: () => [
    'content',
    'announcements',
    'list',
    query.value.page,
    query.value.pageSize,
    query.value.keyword ?? '',
    query.value.type ?? 'all',
    query.value.status ?? 'all',
    query.value.pinned ?? 'all',
  ],
  placeholderData: () => emptyAnnouncementsData,
  query: () => listAnnouncements(query.value),
})

function handleSearch() {
  const nextKeyword = keyword.value.trim()

  query.value = {
    page: 1,
    pageSize: query.value.pageSize,
    ...(nextKeyword.length > 0 ? { keyword: nextKeyword } : {}),
    ...(type.value !== ANNOUNCEMENT_TYPE_FILTER_ALL ? { type: type.value } : {}),
    ...(status.value !== ANNOUNCEMENT_STATUS_FILTER_ALL ? { status: status.value } : {}),
    ...(pinned.value === 'true' ? { pinned: true } : {}),
    ...(pinned.value === 'false' ? { pinned: false } : {}),
  } satisfies AnnouncementListQuery
}

function handleReset() {
  keyword.value = ''
  type.value = ANNOUNCEMENT_TYPE_FILTER_ALL
  status.value = ANNOUNCEMENT_STATUS_FILTER_ALL
  pinned.value = ANNOUNCEMENT_PINNED_FILTER_ALL
  query.value = {
    page: 1,
    pageSize: query.value.pageSize,
  }
}

const announcementsData = computed(() => announcementsResponse.value ?? emptyAnnouncementsData)
const loadErrorMessage = computed(() =>
  announcementsError.value === null
    ? ''
    : getErrorMessage(announcementsError.value, '加载通知公告失败'),
)

const isAnnouncementDrawerVisible = ref(false)
const editingAnnouncementId = ref<string | null>(null)
function openAnnouncementFormDrawer(announcementId: string | null = null) {
  editingAnnouncementId.value = announcementId
  isAnnouncementDrawerVisible.value = true
}

async function invalidateAnnouncementListQueries() {
  await queryCache.invalidateQueries({
    key: ['content', 'announcements', 'list'],
  })
}

async function handleAnnouncementSaved() {
  message.success('保存通知公告成功')
  await invalidateAnnouncementListQueries()
}

function confirmPublishAnnouncement(announcement: AnnouncementListItem) {
  const positiveButtonProps: ButtonProps & Record<string, unknown> = {
    type: 'primary',
    'data-test': 'announcements-publish-confirm',
  }

  dialog.warning({
    title: '确认发布',
    content: `确定发布通知公告“${announcement.title}”吗？`,
    positiveText: '发布',
    negativeText: '取消',
    positiveButtonProps,
    async onPositiveClick() {
      try {
        await publishAnnouncement(announcement.id)

        message.success('发布通知公告成功')
        await invalidateAnnouncementListQueries()
      } catch (error) {
        message.error(getErrorMessage(error, '发布通知公告失败'))
        return false
      }
    },
  })
}

function confirmArchiveAnnouncement(announcement: AnnouncementListItem) {
  const positiveButtonProps: ButtonProps & Record<string, unknown> = {
    type: 'warning',
    'data-test': 'announcements-archive-confirm',
  }

  dialog.warning({
    title: '确认归档',
    content: `确定归档通知公告“${announcement.title}”吗？`,
    positiveText: '归档',
    negativeText: '取消',
    positiveButtonProps,
    async onPositiveClick() {
      try {
        await archiveAnnouncement(announcement.id)

        message.success('归档通知公告成功')
        await invalidateAnnouncementListQueries()
      } catch (error) {
        message.error(getErrorMessage(error, '归档通知公告失败'))
        return false
      }
    },
  })
}

function confirmDeleteAnnouncement(announcement: AnnouncementListItem) {
  const positiveButtonProps: ButtonProps & Record<string, unknown> = {
    type: 'error',
    'data-test': 'announcements-delete-confirm',
  }

  dialog.warning({
    title: '确认删除',
    content: `确定删除通知公告“${announcement.title}”吗？`,
    positiveText: '删除',
    negativeText: '取消',
    positiveButtonProps,
    async onPositiveClick() {
      try {
        await deleteAnnouncement(announcement.id)

        message.success('删除通知公告成功')
        await invalidateAnnouncementListQueries()
      } catch (error) {
        message.error(getErrorMessage(error, '删除通知公告失败'))
        return false
      }
    },
  })
}

const columns: DataTableColumns<AnnouncementListItem> = [
  {
    title: '标题',
    key: 'title',
    minWidth: 220,
  },
  {
    title: '类型',
    key: 'type',
    width: 100,
    render: (announcement) =>
      h(
        NTag,
        {
          bordered: false,
        },
        () => announcementTypeLabels[announcement.type],
      ),
  },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render: (announcement) =>
      h(
        NTag,
        {
          type: announcementStatusTagTypes[announcement.status],
          bordered: false,
        },
        () => announcementStatusLabels[announcement.status],
      ),
  },
  {
    title: '置顶',
    key: 'pinned',
    width: 100,
    render: (announcement) =>
      h(
        NTag,
        {
          type: announcement.pinned ? 'warning' : 'default',
          bordered: false,
        },
        () => (announcement.pinned ? '置顶' : '普通'),
      ),
  },
  {
    title: '摘要',
    key: 'summary',
    minWidth: 220,
    ellipsis: {
      tooltip: true,
    },
    render: (announcement) => announcement.summary ?? '-',
  },
  {
    title: '发布时间',
    key: 'publishedAt',
    minWidth: 160,
    render: (announcement) =>
      announcement.publishedAt === null ? '-' : formatDisplayDateTime(announcement.publishedAt),
  },
  {
    title: '更新时间',
    key: 'updatedAt',
    minWidth: 160,
    render: (announcement) => formatDisplayDateTime(announcement.updatedAt),
  },
  {
    title: '操作',
    key: 'actions',
    width: 180,
    fixed: 'right',
    render: (announcement) =>
      renderTableActions([
        renderTableActionButton({
          label: '编辑',
          accessCode: ['content:announcement:update', 'content:announcement:list'],
          testId: 'announcements-edit',
          onClick: () => openAnnouncementFormDrawer(announcement.id),
        }),
        announcement.status === ANNOUNCEMENT_STATUS_PUBLISHED
          ? renderTableActionButton({
              label: '归档',
              accessCode: ['content:announcement:update', 'content:announcement:list'],
              testId: 'announcements-archive',
              onClick: () => confirmArchiveAnnouncement(announcement),
            })
          : renderTableActionButton({
              label: '发布',
              accessCode: ['content:announcement:update', 'content:announcement:list'],
              testId: 'announcements-publish',
              onClick: () => confirmPublishAnnouncement(announcement),
            }),
        renderTableActionButton({
          label: '删除',
          accessCode: 'content:announcement:delete',
          type: 'error',
          testId: 'announcements-delete',
          onClick: () => confirmDeleteAnnouncement(announcement),
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
          共 {{ announcementsData.total }} 条
        </p>
      </div>
      <NButton
        v-can="'content:announcement:create'"
        data-test="announcements-create"
        type="primary"
        @click="openAnnouncementFormDrawer()"
      >
        新增通知公告
      </NButton>
    </header>

    <section
      class="rounded-ui border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <NForm inline label-placement="left" :show-feedback="false" class="items-center gap-y-3">
        <NFormItem label="关键词">
          <NInput
            v-model:value="keyword"
            data-test="announcements-keyword"
            clearable
            placeholder="请输入关键词"
            class="w-64!"
          />
        </NFormItem>
        <NFormItem label="类型">
          <NSelect
            v-model:value="type"
            data-test="announcements-type"
            :options="announcementTypeFilterOptions"
            placeholder="全部"
            class="w-40!"
          />
        </NFormItem>
        <NFormItem label="状态">
          <NSelect
            v-model:value="status"
            data-test="announcements-status"
            :options="announcementStatusFilterOptions"
            placeholder="全部"
            class="w-40!"
          />
        </NFormItem>
        <NFormItem label="置顶">
          <NSelect
            v-model:value="pinned"
            data-test="announcements-pinned"
            :options="announcementPinnedFilterOptions"
            placeholder="全部"
            class="w-40!"
          />
        </NFormItem>
        <div class="flex gap-2">
          <NButton data-test="announcements-search" type="primary" @click="handleSearch">
            查询
          </NButton>
          <NButton data-test="announcements-reset" @click="handleReset">重置</NButton>
        </div>
      </NForm>
    </section>

    <NAlert v-if="loadErrorMessage" type="error">{{ loadErrorMessage }}</NAlert>

    <section>
      <NDataTable
        :columns="columns"
        :data="announcementsData.list"
        :loading="isLoading"
        :pagination="false"
        :row-key="(announcement: AnnouncementListItem) => announcement.id"
      />

      <div class="mt-4 flex justify-end">
        <NPagination
          v-model:page="query.page"
          :page-size="query.pageSize"
          :item-count="announcementsData.total"
        />
      </div>
    </section>

    <AnnouncementFormDrawer
      v-model:show="isAnnouncementDrawerVisible"
      :announcement-id="editingAnnouncementId"
      @saved="handleAnnouncementSaved"
    />
  </main>
</template>
