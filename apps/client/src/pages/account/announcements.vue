<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery } from '@pinia/colada'
import {
  ANNOUNCEMENT_TYPE_BULLETIN,
  ANNOUNCEMENT_TYPE_NOTICE,
  type AnnouncementMyDetail,
  type AnnouncementMyListResponse,
  type AnnouncementType,
} from '@rev30/contracts'
import {
  NAlert,
  NButton,
  NEmpty,
  NInput,
  NPagination,
  NTabPane,
  NTabs,
  NTag,
  useMessage,
} from 'naive-ui'
import AdminLayout from '../../components/admin/AdminLayout.vue'
import { useAdminPageTitle } from '../../composables/useAdminPageTitle'
import AnnouncementDetailDrawer from '../../features/content/AnnouncementDetailDrawer.vue'
import {
  announcementTypeLabels,
  formatDateTime,
  getContentErrorMessage,
  getMyAnnouncement,
  listMyAnnouncements,
} from '../../features/content'

const pageTitle = useAdminPageTitle('通知公告')
const message = useMessage()

const activeType = ref<AnnouncementType>(ANNOUNCEMENT_TYPE_NOTICE)
const keyword = ref('')
const queryKeyword = ref('')
const page = ref(1)
const pageSize = ref(20)

const emptyAnnouncementsResponse: AnnouncementMyListResponse = {
  list: [],
  total: 0,
  page: 1,
  pageSize: pageSize.value,
}

const {
  data: announcementsResponse,
  error: announcementsError,
  isLoading,
} = useQuery({
  key: () => [
    'content',
    'my-announcements',
    page.value,
    pageSize.value,
    activeType.value,
    queryKeyword.value,
  ],
  placeholderData: () => emptyAnnouncementsResponse,
  query: () =>
    listMyAnnouncements({
      page: page.value,
      pageSize: pageSize.value,
      type: activeType.value,
      ...(queryKeyword.value.length > 0 ? { keyword: queryKeyword.value } : {}),
    }),
})

const announcementsData = computed(() => announcementsResponse.value ?? emptyAnnouncementsResponse)
const loadErrorMessage = computed(() =>
  announcementsError.value === null
    ? ''
    : getContentErrorMessage(announcementsError.value, '加载通知公告失败'),
)

const isDetailDrawerVisible = ref(false)
const isDetailLoading = ref(false)
const announcementDetail = ref<AnnouncementMyDetail | null>(null)

function handleTypeChange(value: string) {
  activeType.value = value as AnnouncementType
  page.value = 1
}

function handleSearch() {
  queryKeyword.value = keyword.value.trim()
  page.value = 1
}

function handleReset() {
  keyword.value = ''
  queryKeyword.value = ''
  page.value = 1
}

async function openAnnouncementDetail(id: string) {
  isDetailLoading.value = true

  try {
    announcementDetail.value = await getMyAnnouncement(id)
    isDetailDrawerVisible.value = true
  } catch (error) {
    message.error(getContentErrorMessage(error, '加载通知公告详情失败'))
  } finally {
    isDetailLoading.value = false
  }
}
</script>

<template>
  <AdminLayout>
    <div class="mx-auto w-full max-w-5xl space-y-5">
      <header>
        <h1 class="text-xl font-semibold text-stone-900 dark:text-zinc-100">{{ pageTitle }}</h1>
        <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">查看发送给我的通知和公告</p>
      </header>

      <section
        class="rounded-ui border border-stone-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <NTabs
          data-test="my-announcements-tabs"
          type="line"
          :value="activeType"
          animated
          @update:value="handleTypeChange"
        >
          <NTabPane name="notice" tab="通知" />
          <NTabPane name="bulletin" tab="公告" />
        </NTabs>

        <div
          class="mt-4 flex flex-col gap-3 border-b border-stone-200 pb-4 md:flex-row md:items-center dark:border-zinc-800"
        >
          <NInput
            data-test="my-announcements-keyword"
            :value="keyword"
            clearable
            placeholder="搜索标题或摘要"
            @keyup.enter="handleSearch"
            @update:value="keyword = $event"
          />
          <div class="flex items-center gap-2">
            <NButton data-test="my-announcements-search" type="primary" @click="handleSearch">
              搜索
            </NButton>
            <NButton data-test="my-announcements-reset" @click="handleReset">重置</NButton>
          </div>
        </div>

        <NAlert v-if="loadErrorMessage" class="mt-4" type="error" :show-icon="false">
          {{ loadErrorMessage }}
        </NAlert>

        <div class="mt-4 space-y-3">
          <div class="flex items-center justify-between text-sm text-stone-500 dark:text-zinc-400">
            <span>共 {{ announcementsData.total }} 条</span>
          </div>

          <div v-if="announcementsData.list.length > 0" class="space-y-3">
            <article
              v-for="announcement in announcementsData.list"
              :key="announcement.id"
              data-test="my-announcements-list-item"
              class="rounded-ui cursor-pointer border border-stone-200 p-4 transition-colors hover:border-stone-300 hover:bg-stone-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-950"
              @click="openAnnouncementDetail(announcement.id)"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0 flex-1 space-y-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <NTag v-if="announcement.pinned" type="warning" :bordered="false">置顶</NTag>
                    <span class="text-base font-medium text-stone-900 dark:text-zinc-100">
                      {{ announcement.title }}
                    </span>
                    <NTag :bordered="false">
                      {{ announcementTypeLabels[announcement.type] }}
                    </NTag>
                  </div>
                  <p v-if="announcement.summary" class="text-sm text-stone-500 dark:text-zinc-400">
                    {{ announcement.summary }}
                  </p>
                </div>
                <div class="flex shrink-0 items-center gap-3">
                  <span class="text-sm text-stone-500 dark:text-zinc-400">
                    {{ formatDateTime(announcement.publishedAt) }}
                  </span>
                  <NButton quaternary size="small" @click.stop="openAnnouncementDetail(announcement.id)">
                    详情
                  </NButton>
                </div>
              </div>
            </article>
          </div>

          <NEmpty v-else description="暂无通知公告" class="py-10" />
        </div>

        <div class="mt-4 flex justify-end">
          <NPagination
            :item-count="announcementsData.total"
            :page="page"
            :page-size="pageSize"
            simple
            @update:page="page = $event"
          />
        </div>
      </section>
    </div>

    <AnnouncementDetailDrawer
      v-model:show="isDetailDrawerVisible"
      :detail="announcementDetail"
      :loading="isDetailLoading"
    />
  </AdminLayout>
</template>
