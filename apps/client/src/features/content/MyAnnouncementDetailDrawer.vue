<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@pinia/colada'
import { type AnnouncementMyListItem } from '@rev30/contracts'
import { formatDisplayDateTime } from '@rev30/utils'
import { NAlert, NDrawer, NDrawerContent, NEmpty, NSpin, NTag } from 'naive-ui'
import { announcementTypeLabels, getContentErrorMessage, getMyAnnouncement } from '.'

const props = defineProps<{
  announcement: AnnouncementMyListItem
}>()

const show = defineModel<boolean>('show', { required: true })

const {
  data: detail,
  error: detailLoadError,
  isLoading,
} = useQuery({
  key: () => ['content', 'announcements', 'my-detail', props.announcement.id],
  enabled: () => show.value,
  async query() {
    return await getMyAnnouncement(props.announcement.id)
  },
})

const loadError = computed(() =>
  isLoading.value || detailLoadError.value === null
    ? null
    : getContentErrorMessage(detailLoadError.value, '加载通知公告详情失败'),
)

const visibleDetail = computed(() => (show.value ? (detail.value ?? null) : null))
</script>

<template>
  <NDrawer
    v-model:show="show"
    data-test="announcement-detail-drawer"
    placement="right"
    :width="560"
  >
    <NDrawerContent closable>
      <template #header>
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <NTag :bordered="false">
            {{ announcementTypeLabels[props.announcement.type] }}
          </NTag>
          <span class="min-w-0 wrap-break-word">{{ props.announcement.title }}</span>
        </div>
      </template>

      <NSpin :show="isLoading">
        <NAlert v-if="loadError" type="error" :show-icon="false">
          {{ loadError }}
        </NAlert>

        <div v-if="visibleDetail">
          <div class="flex flex-wrap items-center gap-2 text-sm text-stone-500 dark:text-zinc-400">
            <NTag v-if="visibleDetail.pinned" type="warning" :bordered="false">置顶</NTag>
            <span>
              {{ formatDisplayDateTime(visibleDetail.publishedAt) }}
            </span>
          </div>

          <p
            v-if="visibleDetail.summary"
            class="mt-3 rounded-ui bg-stone-50 px-4 py-3 text-sm text-stone-600 dark:bg-zinc-900 dark:text-zinc-300"
          >
            {{ visibleDetail.summary }}
          </p>

          <article
            data-test="announcement-detail-content"
            class="prose prose-sm mt-4 flow-root max-w-none dark:prose-invert"
            v-html="visibleDetail.contentHtml"
          />
        </div>

        <NEmpty v-else-if="!loadError && !isLoading" description="暂无详情" />
      </NSpin>
    </NDrawerContent>
  </NDrawer>
</template>
