<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useQuery } from '@pinia/colada'
import {
  ANNOUNCEMENT_TYPE_BULLETIN,
  ANNOUNCEMENT_TYPE_NOTICE,
  type AnnouncementMyListItem,
  type AnnouncementMyListQuery,
  type AnnouncementMyListResponse,
  type AnnouncementType,
} from '@rev30/contracts'
import { formatDisplayDateTime } from '@rev30/utils'
import {
  NAlert,
  NButton,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NList,
  NListItem,
  NPagination,
  NSpin,
  NTabPane,
  NTabs,
  NTag,
  NThing,
} from 'naive-ui'
import { useAdminPageTitle } from '../../../composables/useAdminPageTitle'
import MyAnnouncementDetailDrawer from '../../../features/content/MyAnnouncementDetailDrawer.vue'
import {
  announcementTypeLabels,
  getContentErrorMessage,
  listMyAnnouncements,
} from '../../../features/content'

const pageTitle = useAdminPageTitle('通知公告')

const announcementPageSize = 20
const activeType = ref<AnnouncementType>(ANNOUNCEMENT_TYPE_NOTICE)
const keywords = reactive<Record<AnnouncementType, string>>({
  [ANNOUNCEMENT_TYPE_NOTICE]: '',
  [ANNOUNCEMENT_TYPE_BULLETIN]: '',
})
const queries = reactive<Record<AnnouncementType, AnnouncementMyListQuery>>({
  [ANNOUNCEMENT_TYPE_NOTICE]: {
    page: 1,
    pageSize: announcementPageSize,
    type: ANNOUNCEMENT_TYPE_NOTICE,
  },
  [ANNOUNCEMENT_TYPE_BULLETIN]: {
    page: 1,
    pageSize: announcementPageSize,
    type: ANNOUNCEMENT_TYPE_BULLETIN,
  },
})

const emptyAnnouncementsResponse: AnnouncementMyListResponse = {
  list: [],
  total: 0,
  page: 1,
  pageSize: announcementPageSize,
}

const activeKeyword = computed({
  get: () => keywords[activeType.value],
  set: (value) => {
    keywords[activeType.value] = value
  },
})
const activeQuery = computed(() => queries[activeType.value])

const {
  data: announcementsResponse,
  error: announcementsError,
  isLoading,
} = useQuery({
  key: () => [
    'content',
    'announcements',
    'my',
    activeQuery.value.page,
    activeQuery.value.pageSize,
    activeQuery.value.type ?? 'all',
    activeQuery.value.keyword ?? '',
  ],
  placeholderData: () => emptyAnnouncementsResponse,
  query: () => listMyAnnouncements(activeQuery.value),
})

function handleTypeChange(value: string) {
  activeType.value = value as AnnouncementType
}

function handleSearch() {
  const type = activeType.value
  const nextKeyword = keywords[type].trim()

  queries[type] = {
    page: 1,
    pageSize: queries[type].pageSize,
    type,
    ...(nextKeyword.length > 0 ? { keyword: nextKeyword } : {}),
  }
}

function handleReset() {
  const type = activeType.value

  keywords[type] = ''
  queries[type] = {
    page: 1,
    pageSize: queries[type].pageSize,
    type,
  }
}

const announcementsData = computed(() => announcementsResponse.value ?? emptyAnnouncementsResponse)
const loadErrorMessage = computed(() =>
  announcementsError.value === null
    ? ''
    : getContentErrorMessage(announcementsError.value, '加载通知公告失败'),
)

const isDetailDrawerVisible = ref(false)
const selectedAnnouncement = ref<AnnouncementMyListItem | null>(null)
function openAnnouncementDetail(announcement: AnnouncementMyListItem) {
  selectedAnnouncement.value = announcement
  isDetailDrawerVisible.value = true
}
</script>

<template>
  <div class="mx-auto w-full max-w-5xl space-y-5">
    <header>
      <h1 class="text-xl font-semibold text-stone-900 dark:text-zinc-100">{{ pageTitle }}</h1>
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

      <NForm inline label-placement="left" :show-feedback="false" class="mt-4 items-center gap-y-3">
        <NFormItem label="关键词">
          <NInput
            v-model:value="activeKeyword"
            data-test="my-announcements-keyword"
            clearable
            placeholder="请输入关键词"
            class="w-64!"
            @keyup.enter="handleSearch"
          />
        </NFormItem>
        <div class="flex gap-2">
          <NButton data-test="my-announcements-search" type="primary" @click="handleSearch">
            搜索
          </NButton>
          <NButton data-test="my-announcements-reset" @click="handleReset">重置</NButton>
        </div>
      </NForm>

      <NAlert v-if="loadErrorMessage" class="mt-4" type="error" :show-icon="false">
        {{ loadErrorMessage }}
      </NAlert>

      <NSpin :show="isLoading">
        <div class="mt-4 space-y-3">
          <div class="flex items-center justify-between text-sm text-stone-500 dark:text-zinc-400">
            <span>共 {{ announcementsData.total }} 条</span>
          </div>

          <NList v-if="announcementsData.list.length > 0" clickable hoverable>
            <NListItem
              v-for="announcement in announcementsData.list"
              :key="announcement.id"
              data-test="my-announcements-list-item"
              @click="openAnnouncementDetail(announcement)"
            >
              <NThing>
                <template #header>
                  <div class="flex min-w-0 flex-wrap items-center gap-2">
                    <NTag v-if="announcement.pinned" type="warning" :bordered="false">置顶</NTag>
                    <span class="wrap-break-word">
                      {{ announcement.title }}
                    </span>
                    <NTag :bordered="false">
                      {{ announcementTypeLabels[announcement.type] }}
                    </NTag>
                  </div>
                </template>
                <template #header-extra>
                  <div class="ml-4 flex shrink-0 items-center gap-3">
                    <span class="text-sm text-stone-500 dark:text-zinc-400">
                      {{ formatDisplayDateTime(announcement.publishedAt) }}
                    </span>
                    <NButton
                      data-test="my-announcements-detail"
                      quaternary
                      size="small"
                      @click.stop="openAnnouncementDetail(announcement)"
                    >
                      详情
                    </NButton>
                  </div>
                </template>
                <template v-if="announcement.summary" #description>
                  <span class="text-stone-500 dark:text-zinc-400">
                    {{ announcement.summary }}
                  </span>
                </template>
              </NThing>
            </NListItem>
          </NList>

          <NEmpty v-else-if="!isLoading" description="暂无通知公告" class="py-10" />
        </div>
      </NSpin>

      <div class="mt-4 flex justify-end">
        <NPagination
          v-model:page="activeQuery.page"
          :page-size="activeQuery.pageSize"
          :item-count="announcementsData.total"
        />
      </div>
    </section>
  </div>

  <MyAnnouncementDetailDrawer
    v-if="selectedAnnouncement !== null"
    v-model:show="isDetailDrawerVisible"
    :announcement="selectedAnnouncement"
  />
</template>
